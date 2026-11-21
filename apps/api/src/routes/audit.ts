import { Router } from "express";
import { query } from "../lib/db.js";

export const auditRouter = Router();

// GET /audit?project_id=&limit= — observability feed. Redacted already at write time.
auditRouter.get("/", async (req, res) => {
  const { project_id, limit } = req.query as { project_id?: string; limit?: string };
  const n = Math.min(Number(limit) || 100, 500);
  const rows = project_id
    ? await query(`select * from audit_log where project_id=$1 order by created_at desc limit $2`, [project_id, n])
    : await query(`select * from audit_log order by created_at desc limit $1`, [n]);
  res.json(rows);
});
