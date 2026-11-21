import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { costFor } from "../lib/billing.js";

export const orgBillingRouter = Router();

// GET /org-billing?org_id= — cost across all projects in an org, by project + by owner
orgBillingRouter.get("/", async (req, res) => {
  const parsed = z.object({ org_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "org_id required" });
  const { org_id } = parsed.data;

  const projects = await queryWithOrg<any>(`select id, name, credits_usd from projects where org_id=$1`, [org_id], org_id);
  const tasks = await queryWithOrg<any>(
    `select t.id, t.owner_id, t.tokens_used, t.status, p.id as pid, p.name as pname
     from tasks t join projects p on p.id=t.project_id where p.org_id=$1`,
    [org_id],
    org_id
  );

  let totalTokens = 0;
  let totalCost = 0;
  const byProject: Record<string, { tokens: number; cost: number; tasks: number; credits_usd: number }> = {};
  const byOwner: Record<string, { tokens: number; cost: number; tasks: number }> = {};

  for (const t of tasks) {
    totalTokens += t.tokens_used;
    totalCost += costFor(t.tokens_used);
    const p = (byProject[t.pname] ??= { tokens: 0, cost: 0, tasks: 0, credits_usd: 0 });
    p.tokens += t.tokens_used;
    p.cost += costFor(t.tokens_used);
    p.tasks += 1;
    const o = (byOwner[t.owner_id] ??= { tokens: 0, cost: 0, tasks: 0 });
    o.tokens += t.tokens_used;
    o.cost += costFor(t.tokens_used);
    o.tasks += 1;
  }
  for (const pr of projects) {
    if (byProject[pr.name]) byProject[pr.name].credits_usd = Number(pr.credits_usd ?? 0);
  }

  res.json({
    org_id,
    projects: projects.length,
    tasks: tasks.length,
    total_tokens: totalTokens,
    total_cost_usd: totalCost,
    by_project: byProject,
    by_owner: byOwner,
  });
});
