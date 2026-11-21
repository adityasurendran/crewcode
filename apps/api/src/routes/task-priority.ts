import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";

export const taskPriorityRouter = Router();


taskPriorityRouter.patch("/:id/priority", async (req, res) => {
  const parsed = z.object({ priority: z.number().int().min(1).max(5) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  await query(`update tasks set priority=$2 where id=$1`, [req.params.id, parsed.data.priority]);
  res.json({ ok: true, priority: parsed.data.priority });
});


taskPriorityRouter.get("/queue", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (project_id) {
    res.json(
      await query<any>(
        `select * from tasks where project_id=$1 order by priority asc, created_at asc`,
        [project_id]
      )
    );
    return;
  }
  res.json(await query<any>(`select * from tasks order by priority asc, created_at asc limit 50`));
});
