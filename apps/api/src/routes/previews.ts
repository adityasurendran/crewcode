import { Router } from "express";
import { query } from "../lib/db.js";
import { deployPreview, promoteToProd } from "../lib/previews.js";

export const previewsRouter = Router();


previewsRouter.post("/", async (req, res) => {
  const { task_id } = req.body ?? {};
  if (!task_id) return res.status(400).json({ error: "task_id required" });
  const workdir = `.crew/worktrees/${task_id}`;
  try {
    const r = await deployPreview(task_id, workdir);
    res.json({ ok: true, ...r });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 1000) });
  }
});


previewsRouter.get("/", async (req, res) => {
  const { task_id } = req.query;
  const rows = task_id
    ? await query(`select * from artifacts where task_id=$1 and kind='preview' order by created_at desc`, [task_id])
    : await query(`select * from artifacts where kind='preview' order by created_at desc limit 50`);
  res.json(rows);
});


previewsRouter.post("/promote", async (req, res) => {
  const { project_id, task_id, approved_by } = req.body ?? {};
  if (!project_id || !task_id || !approved_by) return res.status(400).json({ error: "project_id + task_id + approved_by required" });
  res.json(await promoteToProd(project_id, task_id, approved_by));
});
