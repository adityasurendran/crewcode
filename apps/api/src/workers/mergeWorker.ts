


import { redis } from "../lib/queue.js";
import { QUEUES } from "../lib/queue.js";
import { query } from "../lib/db.js";
import { integrateTask, shouldAutoMerge } from "@crewcode/integrator";
import { semanticPatch } from "../lib/semantic.js";
import { pullFromSandbox } from "../lib/e2b-pull.js";
import { runIntegrator } from "../lib/agent-pool.js";
import { notify } from "../lib/notify.js";

const MAX_RETRY = 2;



async function repoRootFor(task: any): Promise<string> {
  const { resolveRepoRoot } = await import("../lib/sandbox.js");
  return resolveRepoRoot(task.project_id);
}



async function ensureReply(task: any, fallback: string) {
  if (!task?.thread_id) return;
  try {
    const rows = await query<any>(
      `select role from messages where thread_id=$1 order by created_at desc limit 1`,
      [task.thread_id]
    );
    if (rows[0]?.role === "agent") return;
    const { postMessage } = await import("../lib/threads.js");
    const text =
      task.mode === "build"
        ? fallback
        : "I couldn't finish that explanation this time. Ask again and I'll take another look.";
    await postMessage(task.thread_id, "agent", text, { task_id: task.id });
  } catch {}
}

async function handleMerge(raw: string) {
  const { taskId, retry = 0, approved = false } = JSON.parse(raw) as { taskId: string; retry?: number; approved?: boolean };
  const head = (await query<any>(`select status from tasks where id=$1`, [taskId]))[0];
  if (!head) return;
  if (head.status === "merged") {
    console.log(`[merge-worker] ${taskId} already merged — skipping`);
    return;
  }
  
  const { withLock, mergeLockKey } = await import("../lib/runlock.js");
  const res = await withLock(mergeLockKey(taskId), () => mergeBody(taskId, retry, approved));
  if (!res.acquired) {
    console.log(`[merge-worker] ${taskId} already merging — dropping duplicate`);
    await query(`insert into events (task_id, type, payload) values ($1,'merge_skipped',$2)`, [taskId, JSON.stringify({ retry })]).catch(() => {});
  }
}

async function mergeBody(taskId: string, retry: number, approved = false) {
  console.log(`[merge-worker] integrating ${taskId} (retry ${retry})`);
  const rows = await query(`select * from tasks where id=$1`, [taskId]);
  if (!rows.length) return;
  const task = rows[0];
  if (task.status === "merged") return; 

  
  if (task.sandbox_id?.startsWith("e2b-")) {
    try {
      await pullFromSandbox(task.sandbox_id, taskId);
      await query(`insert into events (task_id, type, payload) values ($1,'sync',$2)`, [
        taskId,
        JSON.stringify({ source: "e2b", dir: `.crew/sync/${taskId}` }),
      ]);
    } catch (e: any) {
      await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
        taskId,
        JSON.stringify({ message: `e2b pull failed: ${String(e?.message ?? e).slice(0, 300)}` }),
      ]);
    }
  }

  
  const workdir = (task as any).thread_id ? `.crew/worktrees/thread-${(task as any).thread_id}` : `.crew/worktrees/${taskId}`;
  const { existsSync } = await import("node:fs");
  if (!existsSync(workdir)) {
    await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
      taskId,
      JSON.stringify({ message: `workdir missing ${workdir} — sandbox expired or E2B not synced` }),
    ]);
    return;
  }

  
  try {
    const { execSync } = await import("node:child_process");
    const repoRoot = await repoRootFor(task);
    const main = process.env.LOCAL_MAIN_BRANCH ?? "main";
    execSync(`git -C ${repoRoot} merge-base --is-ancestor ${task.branch} ${main}`, { stdio: "pipe" });
    await query(`update tasks set status='merged' where id=$1`, [taskId]);
    await query(`insert into events (task_id, type, payload) values ($1,'merged',$2)`, [
      taskId,
      JSON.stringify({ branch: task.branch, note: "already an ancestor of main; skipped re-merge" }),
    ]);
    await ensureReply(task, "Merged — no file changes were needed.");
    return;
  } catch {
    
  }

  
  
  const projs = await query<any>(`select require_approval from projects where id=$1`, [task.project_id]).catch(() => []);
  if (projs[0]?.require_approval && !approved) {
    await query(`update tasks set status='awaiting_approval' where id=$1`, [taskId]);
    if (task.thread_id) {
      const { postMessage } = await import("../lib/threads.js");
      const { publishStatus } = await import("../lib/stream-bus.js");
      await postMessage(
        task.thread_id,
        "agent",
        "Changes are ready. Approve to merge them, or reject to discard.",
        { approval: taskId }
      ).catch(() => {});
      await publishStatus(task.thread_id, "review").catch(() => {});
    }
    return;
  }

  const results = await integrateTask(workdir);
  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'integration_report','inline',$2)`, [
    taskId,
    JSON.stringify({ results, retry }),
  ]);

  if (shouldAutoMerge(results)) {
    const { execSync } = await import("node:child_process");
    try {
      const repoRoot = await repoRootFor(task);
      execSync(
        `git -C ${repoRoot} checkout ${process.env.LOCAL_MAIN_BRANCH ?? "main"} && git -C ${repoRoot} merge --no-ff ${task.branch} -m "crew: merge ${taskId}"`,
        { stdio: "pipe" }
      );
      await query(`update tasks set status='merged' where id=$1`, [taskId]);
      await query(`insert into events (task_id, type, payload) values ($1,'merged',$2)`, [
        taskId,
        JSON.stringify({ branch: task.branch }),
      ]);
      await notify({ kind: "merged", taskId, projectId: task.project_id, branch: task.branch });
      await ensureReply(task, "Merged — your change is in.");
      if (task.thread_id) {
        const { publishStatus } = await import("../lib/stream-bus.js");
        await publishStatus(task.thread_id, "done").catch(() => {});
      }
    } catch (e: any) {
  await query(`update tasks set status='blocked' where id=$1`, [taskId]);
  if (task.thread_id) {
    const { publishStatus } = await import("../lib/stream-bus.js");
    await publishStatus(task.thread_id, "error").catch(() => {});
  }
      await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
        taskId,
        JSON.stringify({ message: `merge failed: ${String(e?.message ?? e).slice(0, 500)}` }),
      ]).catch(() => {});
      await ensureReply(task, "I couldn't merge that cleanly. Nothing was lost; try a smaller change.");
    }
    return;
  }

  
  const failing = results.find((r) => !r.ok);
  if (retry < MAX_RETRY) {
    
    let diffStat = "";
    try {
      const { execSync } = await import("node:child_process");
      diffStat = execSync(`git -C ${workdir} diff ${process.env.LOCAL_MAIN_BRANCH ?? "main"}...HEAD --stat`, { stdio: "pipe" }).toString().slice(-2000);
    } catch {}

    const brief = `Integration FAILED for a teammate task.
Task objective: ${task.objective}
Failing check: ${failing?.name ?? "unknown"}

Failing log:
${(failing?.log ?? "").slice(-2500)}

Diff vs main (stat):
${diffStat}

Diagnose the semantic breakage (e.g. a renamed field/route), edit ONLY the minimal
dependent code so the checks pass, then stop. Do not refactor.`;

    let integratorOk = false;
    let integratorNote = "";
    try {
      const run = await runIntegrator(taskId, workdir, brief);
      integratorOk = run.ok;
      integratorNote = run.note;
      await query(`insert into events (task_id, type, payload) values ($1,'integrator',$2)`, [
        taskId,
        JSON.stringify({ retry: retry + 1, ok: run.ok, note: run.note, port: run.instance?.port ?? null, model: process.env.CREW_MODEL ?? null }),
      ]);
    } catch (e: any) {
      integratorNote = String(e?.message ?? e).slice(0, 200);
    }

    
    if (!integratorOk) {
      const patch = await semanticPatch({
        taskId,
        failingLog: failing?.log ?? "",
        graphSlice: task.objective,
        projectId: task.project_id,
        retry: retry + 1,
      });
      integratorOk = patch.ok;
      integratorNote = patch.note;
      await query(`insert into events (task_id, type, payload) values ($1,'semantic_patch',$2)`, [
        taskId,
        JSON.stringify({ retry: retry + 1, ok: patch.ok, note: patch.note }),
      ]);
    }

    if (integratorOk) {
      
      try {
        const { syncSandboxToBranch } = await import("../lib/sandbox-sync.js");
        await syncSandboxToBranch(taskId, taskId);
      } catch {}
      await redis.rpush(QUEUES.mergeQueue, JSON.stringify({ taskId, retry: retry + 1 }));
      return;
    }
    await notify({ kind: "semantic_patch", taskId, projectId: task.project_id, message: integratorNote });
  }

  await query(`update tasks set status='blocked' where id=$1`, [taskId]);
  await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
    taskId,
    JSON.stringify({ message: `integration failed at ${failing?.name} (retries exhausted)`, log: failing?.log?.slice(-2000) }),
  ]);
  await notify({ kind: "task_blocked", taskId, projectId: task.project_id, message: `integration failed at ${failing?.name}` });
  await ensureReply(task, "I couldn't merge that cleanly. Nothing was lost; try a smaller change.");
}

async function loop() {
  console.log("[merge-worker] waiting on", QUEUES.mergeQueue);
  while (true) {
    const res = await redis.blpop(QUEUES.mergeQueue, 5);
    if (!res) continue;
    try {
      await handleMerge(res[1]);
    } catch (e) {
      console.error("[merge-worker] failed", e);
    }
  }
}

loop();
