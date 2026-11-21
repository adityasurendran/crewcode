import { Router } from "express";
import { query } from "../lib/db.js";

export const auditFilterRouter = Router();

// GET /audit/filter?action=&actor=&from=&to=&project_id=&limit=
auditFilterRouter.get("/", async (req, res) => {
  const { action, actor, from, to, project_id, limit } = req.query as Record<string, string>;
  const n = Math.min(Number(limit) || 100, 500);
  let sql = `select * from audit_log where 1=1`;
  const params: any[] = [];
  if (action) { params.push(action); sql += ` and action=$${params.length}`; }
  if (actor) { params.push(actor); sql += ` and actor=$${params.length}`; }
  if (from) { params.push(from); sql += ` and created_at >= $${params.length}`; }
  if (to) { params.push(to); sql += ` and created_at <= $${params.length}`; }
  if (project_id) { params.push(project_id); sql += ` and project_id=$${params.length}`; }
  params.push(n);
  sql += ` order by created_at desc limit $${params.length}`;
  res.json(await query<any>(sql, params));
});
