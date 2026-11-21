import { Router } from "express";
import { query } from "../lib/db.js";

export const taskDetailRouter = Router({ mergeParams: true });


taskDetailRouter.get("/detail", async (req, res) => {
  const id = String((req.params as any).id ?? "");
  const tasks = await query<any>(`select * from tasks where id=$1`, [id]);
  if (!tasks.length) return res.status(404).json({ error: "task not found" });
  const events = await query<any>(`select * from events where task_id=$1 order by created_at desc limit 50`, [id]);
  const artifacts = await query<any>(`select id, kind, uri, meta, created_at from artifacts where task_id=$1 order by created_at desc limit 20`, [id]);
  res.json({ task: tasks[0], events, artifacts });
});

taskDetailRouter.get("/", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  const rows = project_id
    ? await query<any>(`select * from tasks where project_id=$1 order by created_at desc`, [project_id])
    : await query<any>(`select * from tasks order by created_at desc limit 50`);
  res.json(rows);
});
