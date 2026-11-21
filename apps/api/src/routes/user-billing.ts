import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { costFor } from "../lib/billing.js";

export const userBillingRouter = Router();

// GET /user-billing?user_id=&org_id= — cost for one user across projects
userBillingRouter.get("/", async (req, res) => {
  const parsed = z.object({ user_id: z.string().min(1), org_id: z.string().uuid().optional() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "user_id required" });
  const { user_id, org_id } = parsed.data;

  const tasks = org_id
    ? await queryWithOrg<any>(
        `select t.id, t.tokens_used, t.status, p.name as pname from tasks t join projects p on p.id=t.project_id where t.owner_id=$1 and p.org_id=$2`,
        [user_id, org_id],
        org_id
      )
    : await query<any>(`select t.id, t.tokens_used, t.status, p.name as pname from tasks t join projects p on p.id=t.project_id where t.owner_id=$1`, [user_id]);

  let totalTokens = 0;
  let totalCost = 0;
  const byProject: Record<string, { tokens: number; cost: number; tasks: number }> = {};
  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    totalTokens += t.tokens_used;
    const c = costFor(t.tokens_used);
    totalCost += c;
    const p = (byProject[t.pname] ??= { tokens: 0, cost: 0, tasks: 0 });
    p.tokens += t.tokens_used;
    p.cost += c;
    p.tasks += 1;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }

  res.json({
    user_id,
    org_id: org_id ?? null,
    tasks: tasks.length,
    total_tokens: totalTokens,
    total_cost_usd: totalCost,
    by_project: byProject,
    by_status: byStatus,
  });
});
