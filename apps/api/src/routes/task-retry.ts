import { Router } from "express";
import { query } from "../lib/db.js";
import { enqueue, QUEUES } from "../lib/queue.js";
import { audit } from "../lib/audit.js";

export const taskRetryRouter = Router();


taskRetryRouter.post("/:id/retry", async (req, res) => {
  const id = String((req.params as any).id ?? "");
  const { note } = req.body ?? {};
  const tasks = await query<any>(`select * from tasks where id=$1`, [id]);
  if (!tasks.length) return res.status(404).json({ error: "task not found" });
  const task = tasks[0];
  if (task.status === "merged") return res.status(409).json({ error: "task already merged" });

  await query(`update tasks set status='running' where id=$1`, [id]);
  await query(`insert into events (task_id, type, payload) values ($1,'retry',$2)`, [
    id,
    JSON.stringify({ note: note ?? "manual retry", previous_status: task.status }),
  ]);
  await enqueue(QUEUES.agentJobs, {
    taskId: task.id,
    projectId: task.project_id,
    objective: task.objective,
    workdir: `.crew/worktrees/${task.id}`,
  });
  await audit(task.project_id, "user", "task.retried", { task_id: id, note });
  res.json({ ok: true, task_id: id, status: "running" });
});


taskRetryRouter.post("/:id/cancel", async (req, res) => {
  const id = String((req.params as any).id ?? "");
  const tasks = await query<any>(`select * from tasks where id=$1`, [id]);
  if (!tasks.length) return res.status(404).json({ error: "task not found" });
  const task = tasks[0];
  if (task.status === "merged") return res.status(409).json({ error: "task already merged" });

  await query(`update tasks set status='blocked' where id=$1`, [id]);
  await query(`insert into events (task_id, type, payload) values ($1,'cancelled',$2)`, [
    id,
    JSON.stringify({ reason: "manual cancel" }),
  ]);
  await audit(task.project_id, "user", "task.cancelled", { task_id: id });
  res.json({ ok: true, task_id: id, status: "blocked" });
});
