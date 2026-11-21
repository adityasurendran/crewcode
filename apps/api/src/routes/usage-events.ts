import { Router } from "express";
import { query } from "../lib/db.js";

export const usageEventsRouter = Router();

// GET /usage-events?task_id=&project_id=&limit= — token usage events for dashboards
usageEventsRouter.get("/", async (req, res) => {
  const { task_id, project_id, limit } = req.query as Record<string, string>;
  const n = Math.min(Number(limit) || 50, 200);
  if (task_id) {
    res.json(await query<any>(`select * from events where task_id=$1 and type='usage' order by created_at desc limit $2`, [task_id, n]));
    return;
  }
  if (project_id) {
    res.json(
      await query<any>(
        `select e.* from events e join tasks t on t.id=e.task_id where t.project_id=$1 and e.type='usage' order by e.created_at desc limit $2`,
        [project_id, n]
      )
    );
    return;
  }
  res.json(await query<any>(`select * from events where type='usage' order by created_at desc limit $1`, [n]));
});
