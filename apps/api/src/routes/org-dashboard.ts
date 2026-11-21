import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { costFor } from "../lib/billing.js";

export const orgDashboardRouter = Router();


orgDashboardRouter.get("/", async (req, res) => {
  const { org_id } = req.query as { org_id?: string };
  if (!org_id) return res.status(400).json({ error: "org_id required" });

  const projects = await queryWithOrg<any>(`select id, name, credits_usd from projects where org_id=$1`, [org_id], org_id);
  const tasks = await queryWithOrg<any>(
    `select t.id, t.owner_id, t.objective, t.status, t.priority, t.tokens_used, p.name as pname
     from tasks t join projects p on p.id=t.project_id where p.org_id=$1
     order by t.created_at desc limit 200`,
    [org_id],
    org_id
  );

  const totalTokens = tasks.reduce((s: number, t: any) => s + (t.tokens_used ?? 0), 0);
  const totalCost = costFor(totalTokens);
  const byStatus: Record<string, number> = {};
  const byOwner: Record<string, { tasks: number; tokens: number; cost: number }> = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const o = (byOwner[t.owner_id] ??= { tasks: 0, tokens: 0, cost: 0 });
    o.tasks += 1;
    o.tokens += t.tokens_used ?? 0;
    o.cost += costFor(t.tokens_used ?? 0);
  }

  const running = tasks.filter((t: any) => t.status === "running" || t.status === "testing");
  const blocked = tasks.filter((t: any) => t.status === "blocked");

  res.json({
    org_id,
    projects: projects.map((p: any) => ({ id: p.id, name: p.name, credits_usd: p.credits_usd })),
    tasks: {
      total: tasks.length,
      by_status: byStatus,
      by_owner: byOwner,
      running: running.map((t: any) => ({ id: t.id, objective: t.objective, owner: t.owner_id, project: t.pname, status: t.status })),
      blocked: blocked.map((t: any) => ({ id: t.id, objective: t.objective, owner: t.owner_id, project: t.pname })),
    },
    cost: { total_tokens: totalTokens, total_cost_usd: totalCost },
  });
});
