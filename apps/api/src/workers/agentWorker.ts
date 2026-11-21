// Agent worker daemon — polls crew:agent-jobs, runs headless OpenCode job, reports.
// Run: npm run worker:agent -w apps/api
// Prod: 1 daemon per N sandboxes, each job in its own E2B/Daytona sandbox.
import { redis } from "../lib/queue.js";
import { QUEUES } from "../lib/queue.js";
import { query } from "../lib/db.js";
import { buildSystemPrompt } from "@crewcode/worker-opencode";
import { buildGraph, sliceForTask } from "@crewcode/graph";
import { syncSandboxToBranch } from "../lib/sandbox-sync.js";
import { addUsage, checkBudget } from "../lib/budgets.js";
import { notify } from "../lib/notify.js";
import { pullFromSandbox } from "../lib/e2b-pull.js";
import { runForOwner, type RunResult } from "../lib/agent-pool.js";
import { routeFor } from "../lib/cost-optimizer.js";
import { e2bRunAgent } from "../lib/e2b-deploy.js";

// Rough token estimate for one agent run (prompt+output). Phase 1: real meter from provider usage.
// Cost optimizer selects tier per job kind; agent runs default to 'standard' tier.
const DEFAULT_KIND = "agent_run";

async function estimateForProject(projectId: string, kind: string): Promise<{ tokens: number; model: string; tier: string }> {
  let tier = "standard";
  try {
    const maps = await query<any>(`select tier from cost_mapping where project_id=$1 and kind=$2`, [projectId, kind]).catch(() => []);
    if (maps[0]?.tier) tier = maps[0].tier;
  } catch {}
  const { TIER_MODEL } = await import("../lib/cost-optimizer.js");
  const model = TIER_MODEL[tier as keyof typeof TIER_MODEL] ?? "opencode-go/mimo-v2.6-pro";
  // Tier-scaled token estimate: heavy/frontier runs do more work.
  const base = tier === "frontier" ? 40000 : tier === "heavy" ? 25000 : tier === "standard" ? 15000 : 8000;
  return { tokens: base, model, tier };
}

const API_BASE = process.env.API_BASE ?? "http://localhost:4100";

async function reportUsage(projectId: string, taskId: string, tokens: number) {
  try {
    await fetch(`${API_BASE}/metering`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: projectId, task_id: taskId, tokens, model: "default" }),
    });
  } catch {
    // metering must never break main flow
  }
  // Also emit Stripe meter event if project has stripe_customer_id.
  try {
    const { query } = await import("../lib/db.js");
    const projs = await query<any>(`select stripe_customer_id from projects where id=$1`, [projectId]).catch(() => []);
    const customerId = projs[0]?.stripe_customer_id;
    if (customerId) {
      await fetch(`${API_BASE}/stripe/meters/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event_key: "crewcode_tokens", stripe_customer_id: customerId, value: tokens }),
      });
    }
  } catch {
    // stripe meter optional
  }
}

async function handleJob(raw: string) {
  const job = JSON.parse(raw) as { taskId: string; projectId: string; objective: string; workdir: string; sessionKey?: string; threadId?: string; ownerId?: string };
  console.log(`[agent-worker] picked up task ${job.taskId}: ${job.objective}`);

  // One run per task at a time; a duplicate job for a running task is dropped.
  const { withLock, runLockKey } = await import("../lib/runlock.js");
  const res = await withLock(runLockKey(job.taskId), () => runJobBody(job));
  if (!res.acquired) {
    console.log(`[agent-worker] task ${job.taskId} already running — dropping duplicate job`);
    await query(`insert into events (task_id, type, payload) values ($1,'run_skipped',$2)`, [
      job.taskId,
      JSON.stringify({ reason: "duplicate job while run in flight" }),
    ]).catch(() => {});
  }
}

async function runJobBody(job: { taskId: string; projectId: string; objective: string; workdir: string; sessionKey?: string; threadId?: string; ownerId?: string }) {

  // Budget gate before spending tokens on the LLM.
  const budget = await checkBudget(job.taskId).catch(() => ({ ok: true, used: 0, budget: 0 }));
  if (!budget.ok) {
    await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
      job.taskId,
      JSON.stringify({ message: `token budget exceeded before run: ${budget.used}/${budget.budget}` }),
    ]);
    return;
  }

  const graph = await buildGraph(job.projectId, job.workdir).catch(() => null);
  let slice = graph ? sliceForTask(graph, []) : "no graph (repo missing)";
  // Imported database schema (if any) — agents generate code against real tables.
  try {
    const { dbSchemaContext } = await import("../lib/db-import.js");
    slice += await dbSchemaContext(job.projectId);
  } catch {}
  const prompt = buildSystemPrompt(
    { taskId: job.taskId, projectId: job.projectId, objective: job.objective, workdir: job.workdir, allowlist: [] },
    slice
  );

  const { writeFile } = await import("node:fs/promises");
  const { mkdirSync } = await import("node:fs");
  const { execSync } = await import("node:child_process");
  // Keep the task brief OUT of the worktree so it never gets committed as a change.
  const promptDir = `.crew/prompts`;
  try {
    mkdirSync(promptDir, { recursive: true });
    await writeFile(`${promptDir}/${job.taskId}.md`, `# Task\n\n${prompt}\n`, "utf8");
  } catch {}
  let agentOutput = "";
  try {
    // If E2B sandbox, run agent inside it; else local OpenCode session/shell.
    const taskRows0 = await query<any>(`select * from tasks where id=$1`, [job.taskId]).catch(() => []);
    const sbxId = taskRows0[0]?.sandbox_id ?? "";
    if (sbxId.startsWith("e2b-")) {
      const e2bResult = await e2bRunAgent(sbxId.replace(/^e2b-/, ""), "/home/user/repo", job.objective);
      if (!e2bResult.ok) throw new Error(e2bResult.note);
    } else {
      // Persistent per-teammate OpenCode instance (falls back to one-shot internally).
      const ownerId = taskRows0[0]?.owner_id ?? "unknown";
      // Drive the turn through the opencode server session API (this is the
      // path verified in the packaged app; it also streams deltas).
      const { publishDelta, publishStatus } = await import("../lib/stream-bus.js");
      const { runViaServer } = await import("../lib/agent-pool.js");
      if (job.threadId) await publishStatus(job.threadId, "thinking");
      const run = await runViaServer(ownerId, job.sessionKey ?? job.taskId, job.workdir, job.objective, (text) =>
        publishDelta(job.threadId ?? job.taskId, text)
      );
      agentOutput = run.output ?? "";
      await query(`insert into events (task_id, type, payload) values ($1,'agent_instance',$2)`, [
        job.taskId,
        JSON.stringify({ owner: ownerId, attached: run.attached, note: run.note, port: run.instance?.port ?? null, reused: run.instance?.reused ?? false, session: run.sessionId }),
      ]);
      if (!run.ok) throw new Error(run.note);
    }
    const est = await estimateForProject(job.projectId, DEFAULT_KIND);
    await addUsage(job.taskId, est.tokens).catch(() => {});
    await reportUsage(job.projectId, job.taskId, est.tokens);
    // E2B sandbox: pull changed files back into .crew/sync before local sync.
    const taskRows = await query<any>(`select * from tasks where id=$1`, [job.taskId]).catch(() => []);
    if (taskRows[0]?.sandbox_id?.startsWith("e2b-")) {
      try {
        await pullFromSandbox(taskRows[0].sandbox_id, job.taskId);
      } catch (e: any) {
        await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
          job.taskId,
          JSON.stringify({ message: `e2b pull failed: ${String(e?.message ?? e).slice(0, 300)}` }),
        ]);
      }
    }
    const sync = await syncSandboxToBranch(job.taskId, job.taskId, job.workdir);
    await query(`insert into events (task_id, type, payload) values ($1,'sync',$2)`, [
      job.taskId,
      JSON.stringify(sync),
    ]);
    await query(`update tasks set status='testing' where id=$1`, [job.taskId]);
    if (job.threadId) {
      const { publishStatus } = await import("../lib/stream-bus.js");
      await publishStatus(job.threadId, "checking").catch(() => {});
    }

    // A conversational message (or a tool-only turn) can end with no text and
    // no files. Ask once more, explicitly for a text answer, before falling
    // back to a canned line.
    if (!agentOutput.trim() && !(sync.files?.length)) {
      try {
        const { runViaServer } = await import("../lib/agent-pool.js");
        const ownerId = taskRows[0]?.owner_id ?? job.ownerId ?? "unknown";
        const retry = await runViaServer(
          ownerId,
          job.sessionKey ?? job.taskId,
          job.workdir,
          `The user said: "${String(job.objective).slice(0, 600)}"\n\nThis is a conversation, not a code change. Reply in one or two short, friendly sentences. Do not modify files, run commands, or use tools.`,
          () => {}
        );
        const text = (retry.output ?? "").trim();
        if (retry.ok && text) agentOutput = text;
        await query(`insert into events (task_id, type, payload) values ($1,'reply_retry',$2)`, [
          job.taskId,
          JSON.stringify({ ok: !!text, chars: text.length }),
        ]);
      } catch (e: any) {
        await query(`insert into events (task_id, type, payload) values ($1,'reply_retry',$2)`, [
          job.taskId,
          JSON.stringify({ ok: false, error: String(e?.message ?? e).slice(0, 300) }),
        ]).catch(() => {});
      }
    }

    // Chat: post the agent's reply before enqueueing the merge, so a merge
    // fallback can never race ahead of the real answer.
    if (job.threadId) {
      const { postMessage } = await import("../lib/threads.js");
      const mode = taskRows[0]?.mode ?? "build";
      const reply =
        (agentOutput && agentOutput.trim()) ||
        (sync.files?.length
          ? `Done — updated ${sync.files.length} file(s): ${sync.files.slice(0, 8).join(", ")}`
          : mode === "build"
            ? "I didn't change anything that time. Tell me the exact screen or file you want changed."
            : "I couldn't add an explanation this time. Ask again and I'll take another look.");
      try {
        await postMessage(job.threadId, "agent", reply, { task_id: job.taskId, files: sync.files });
      } catch (e: any) {
        await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
          job.taskId,
          JSON.stringify({ message: `reply failed: ${String(e?.message ?? e).slice(0, 300)}` }),
        ]).catch(() => {});
      }
    }
    await redis.rpush(QUEUES.mergeQueue, JSON.stringify({ taskId: job.taskId }));
    await notify({ kind: "task_done", taskId: job.taskId, projectId: job.projectId, objective: job.objective });
  } catch (e: any) {
    const estFail = await estimateForProject(job.projectId, DEFAULT_KIND).catch(() => ({ tokens: 7500 }));
    await addUsage(job.taskId, Math.floor(estFail.tokens / 2)).catch(() => {});
    await reportUsage(job.projectId, job.taskId, Math.floor(estFail.tokens / 2));
    await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
      job.taskId,
      JSON.stringify({ message: String(e?.message ?? e).slice(0, 2000) }),
    ]);
    await query(`update tasks set status='blocked' where id=$1`, [job.taskId]);
    if (job.threadId) {
      const { postMessage } = await import("../lib/threads.js");
      await postMessage(job.threadId, "agent", `âš ï¸ I hit a problem: ${String(e?.message ?? e).slice(0, 500)}`, {
        task_id: job.taskId,
        error: true,
      }).catch(() => {});
    }
    await notify({ kind: "task_blocked", taskId: job.taskId, projectId: job.projectId, message: String(e?.message ?? e).slice(0, 300) });
  }
}

async function loop() {
  console.log("[agent-worker] waiting on", QUEUES.agentJobs);
  while (true) {
    const res = await redis.blpop(QUEUES.agentJobs, 5);
    if (!res) continue;
    const [, payload] = res;
    try {
      await handleJob(payload);
    } catch (e) {
      console.error("[agent-worker] job failed", e);
    }
  }
}

loop();
