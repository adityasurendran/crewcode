import { Router } from "express";
import { query } from "../lib/db.js";

export const costHistoryRouter = Router();

// GET /cost-history?project_id=&days=30 — daily cost trend for dashboards
costHistoryRouter.get("/", async (req, res) => {
  const { project_id, days } = req.query as { project_id?: string; days?: string };
  const n = Math.min(Number(days) || 30, 90);
  if (!project_id) return res.status(400).json({ error: "project_id required" });
  const rows = await query<any>(
    `select date_trunc('day', t.created_at)::date as day,
            sum(t.tokens_used)::int as tokens,
            count(*)::int as tasks
     from tasks t where t.project_id=$1 and t.created_at > now() - ($2 || ' days')::interval
     group by 1 order by 1`,
    [project_id, n]
  );
  // Convert tokens to cost
  const { costFor } = await import("../lib/billing.js");
  res.json({ project_id, days: n, points: rows.map((r) => ({ ...r, cost_usd: costFor(r.tokens) })) });
});
