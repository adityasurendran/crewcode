// Chat threads — the primary interface. A message runs the owner's agent and
// auto-merges the result. "Tasks" still exist underneath (branches + merge) but
// are never surfaced to the user.
import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { enqueue, QUEUES } from "../lib/queue.js";
import { ensureThread, postMessage, threadMessages, ensureThreadWorktree } from "../lib/threads.js";
import { subscribe, publishStatus } from "../lib/stream-bus.js";

export const threadsRouter = Router();

// Guests build too — but their identity is derived from their token, so a guest
// can't post as the host (or as another guest).
function effectiveOwner(req: any, requested: string | undefined): string {
  if (req?.guest && req?.guestId) return `guest-${String(req.guestId).slice(0, 16)}`;
  return String(requested ?? "").trim();
}

// GET /threads?project_id=&owner_id= — the thread + full conversation
threadsRouter.get("/", async (req, res) => {
  const { project_id, owner_id } = req.query as { project_id?: string; owner_id?: string };
  const owner = effectiveOwner(req, owner_id);
  if (!project_id || !owner) return res.status(400).json({ error: "project_id + owner_id required" });
  const thread = await ensureThread(project_id, owner);
  const latest = (await query<any>(
    `select id, status, objective, created_at from tasks where thread_id=$1 order by created_at desc limit 1`,
    [thread.id]
  ).catch(() => []))[0] ?? null;
  res.json({ thread, messages: await threadMessages(thread.id), latest_task: latest });
});

// POST /threads/message {project_id, owner_id, message} — send → agent builds → merges
threadsRouter.post("/message", async (req, res) => {
  const parsed = z
    .object({
      project_id: z.string().uuid(),
      owner_id: z.string().min(1).optional(),
      message: z.string().min(1).max(4000),
      mode: z.enum(["build", "learn", "review"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, message } = parsed.data;
  const mode = parsed.data.mode ?? "build";
  const owner_id = effectiveOwner(req, parsed.data.owner_id);
  if (!owner_id) return res.status(400).json({ error: "owner_id required" });

  const thread = await ensureThread(project_id, owner_id);
  const userMsg = await postMessage(thread.id, "user", message, { owner: owner_id, mode });

  // One persistent branch + worktree per person — every message builds on the
  // last, and the agent's session stays valid. (No per-message task branches.)
  let branch: string;
  let workdir: string;
  try {
    ({ branch, workdir } = await ensureThreadWorktree(project_id, thread.id, owner_id));
  } catch (e: any) {
    await postMessage(thread.id, "agent", `I couldn't start on that: ${String(e?.message ?? e).slice(0, 300)}`, { error: true });
    return res.status(500).json({ error: "could not start the agent" });
  }

  // Hidden work unit on the person's own branch (the user never sees tasks).
  const rows = await query(
    `insert into tasks (project_id, owner_id, objective, status, branch, allowlist, thread_id, mode)
     values ($1,$2,$3,'queued',$4,'[]',$5,$6) returning *`,
    [project_id, owner_id, message, branch, thread.id, mode]
  );
  const task = rows[0];
  await query(`update tasks set status='running' where id=$1`, [task.id]);

  const MODE_PREFIX: Record<string, string> = {
    build: "",
    learn:
      "LEARN MODE: Do NOT modify any files. Explain in beginner-friendly language how this would work and the exact steps to implement it. Finish with a short numbered plan.",
    review:
      "REVIEW MODE: Do NOT modify files. Review the current project relevant to this request, point out bugs and risks, and suggest concrete improvements.",
  };
  const agentObjective = mode === "build" ? message : `${MODE_PREFIX[mode]}\n\nRequest: ${message}`;

  await enqueue(QUEUES.agentJobs, {
    taskId: task.id,
    projectId: project_id,
    objective: agentObjective,
    workdir,
    sessionKey: thread.id, // keep one continuous agent session per person
    threadId: thread.id,
    ownerId: owner_id,
  });
  await query(`insert into events (task_id, type, payload) values ($1,'intent',$2)`, [
    task.id,
    JSON.stringify({ objective: message, via: "chat" }),
  ]);
  // Immediate feedback so the chat shows activity before the worker picks it up.
  await publishStatus(thread.id, "thinking");

  res.json({ ok: true, thread_id: thread.id, message: userMsg, task_id: task.id });
});

// GET /threads/:id/stream — SSE of new messages (agent replies arrive here)
threadsRouter.get("/:id/stream", async (req, res) => {
  const id = String((req.params as any).id ?? "");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  // Live deltas + status from the worker (Redis pub/sub) → SSE events.
  const unsub = subscribe(id, (p) => {
    if (p?.stage) res.write(`event: status\ndata: ${JSON.stringify({ stage: p.stage })}\n\n`);
    else if (typeof p?.text === "string") res.write(`event: delta\ndata: ${JSON.stringify({ text: p.text })}\n\n`);
  });

  let last = "1970-01-01T00:00:00.000Z";
  const sent = new Set<string>();
  const tick = async () => {
    try {
      const rows = await query<any>(
        `select id, role, content, meta, created_at from messages where thread_id=$1 order by created_at asc limit 500`,
        [id]
      );
      for (const m of rows) {
        if (sent.has(m.id)) continue;
        sent.add(m.id);
        res.write(`data: ${JSON.stringify(m)}\n\n`);
      }
    } catch {}
  };
  const iv = setInterval(tick, 1000);
  req.on("close", () => {
    clearInterval(iv);
    unsub();
  });
});
