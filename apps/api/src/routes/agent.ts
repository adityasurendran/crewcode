



import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { enqueue, QUEUES } from "../lib/queue.js";
import { notify } from "../lib/notify.js";

export const agentRouter = Router();

const Chat = z.object({
  task_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  actor: z.string().min(1).default("user"),
});

agentRouter.post("/chat", async (req, res) => {
  const parsed = Chat.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { task_id, message, actor } = parsed.data;

  const tasks = await query<any>(`select * from tasks where id=$1`, [task_id]);
  if (!tasks.length) return res.status(404).json({ error: "task not found" });
  const task = tasks[0];
  if (task.status === "merged") return res.status(409).json({ error: "task already merged — create a new one" });

  
  await query(`insert into events (task_id, type, payload) values ($1,'user_message',$2)`, [
    task_id,
    JSON.stringify({ actor, message: message.slice(0, 1500) }),
  ]);

  
  await enqueue(QUEUES.agentJobs, {
    taskId: task.id,
    projectId: task.project_id,
    objective: `${task.objective}\n\nFollow-up from ${actor}: ${message.slice(0, 500)}`,
    workdir: `.crew/worktrees/${task.id}`,
  });
  await query(`update tasks set status='running' where id=$1 and status not in ('merged','blocked')`, [task_id]);
  await notify({ kind: "task_done", taskId: task_id, projectId: task.project_id, objective: task.objective });

  res.json({ ok: true, task_id, queued: true });
});


agentRouter.get("/conversation/:task_id", async (req, res) => {
  const id = String((req.params as any).task_id ?? "");
  const events = await query<any>(
    `select type, payload, created_at from events where task_id=$1 order by created_at asc limit 100`,
    [id]
  );
  res.json(events);
});
