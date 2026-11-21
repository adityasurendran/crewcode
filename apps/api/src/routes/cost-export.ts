import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { costFor } from "../lib/billing.js";

export const costExportRouter = Router();

// GET /cost-export?org_id= — full cost breakdown for invoices / finance
costExportRouter.get("/", async (req, res) => {
  const { org_id } = req.query as { org_id?: string };
  if (!org_id) return res.status(400).json({ error: "org_id required" });
  const projects = await queryWithOrg<any>(`select id, name, credits_usd from projects where org_id=$1`, [org_id], org_id);
  const tasks = await queryWithOrg<any>(
    `select t.id, t.owner_id, t.tokens_used, t.status, t.priority, p.name as pname
     from tasks t join projects p on p.id=t.project_id where p.org_id=$1`,
    [org_id],
    org_id
  );
  const lines = tasks.map((t) => ({
    project: t.pname,
    task_id: t.id,
    owner: t.owner_id,
    tokens: t.tokens_used,
    cost_usd: costFor(t.tokens_used),
    status: t.status,
  }));
  const totals = {
    projects: projects.length,
    tasks: tasks.length,
    tokens: lines.reduce((s, l) => s + l.tokens, 0),
    cost_usd: lines.reduce((s, l) => s + l.cost_usd, 0),
  };
  res.json({ org_id, generated_at: new Date().toISOString(), totals, lines });
});

// PATCH /tasks/:id/assign {owner_id} — reassign task to another teammate
costExportRouter.patch("/tasks/:id/assign", async (req, res) => {
  const { owner_id } = req.body ?? {};
  if (!owner_id) return res.status(400).json({ error: "owner_id required" });
  await query(`update tasks set owner_id=$2 where id=$1`, [String((req.params as any).id ?? ""), owner_id]);
  res.json({ ok: true, owner_id });
});
