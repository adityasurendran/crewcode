import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { costFor } from "../lib/billing.js";

export const dashboardRouter = Router();


dashboardRouter.get("/", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id required" });

  const tasks = await query<any>(`select * from tasks where project_id=$1 order by created_at desc limit 100`, [project_id]);
  const events = await query<any>(
    `select e.* from events e join tasks t on t.id=e.task_id where t.project_id=$1 order by e.created_at desc limit 30`,
    [project_id]
  );
  const artifacts = await query<any>(`select * from artifacts where task_id in (select id from tasks where project_id=$1) order by created_at desc limit 20`, [project_id]);

  const totalTokens = tasks.reduce((s: number, t: any) => s + (t.tokens_used ?? 0), 0);
  const totalCost = costFor(totalTokens);
  const byStatus: Record<string, number> = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

  const running = tasks.filter((t: any) => t.status === "running" || t.status === "testing");
  const blocked = tasks.filter((t: any) => t.status === "blocked");

  res.json({
    project_id,
    tasks: {
      total: tasks.length,
      by_status: byStatus,
      running: running.map((t: any) => ({ id: t.id, objective: t.objective, owner: t.owner_id, status: t.status })),
      blocked: blocked.map((t: any) => ({ id: t.id, objective: t.objective, owner: t.owner_id })),
    },
    cost: { total_tokens: totalTokens, total_cost_usd: totalCost },
    recent_events: events,
    recent_artifacts: artifacts,
  });
});
