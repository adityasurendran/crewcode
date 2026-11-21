import { Router } from "express";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const apiKeysRouter = Router();


apiKeysRouter.get("/", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id required" });
  const rows = await query<any>(`select id, prefix, created_by, created_at from project_api_keys where project_id=$1 order by created_at desc`, [project_id]);
  res.json(rows);
});


apiKeysRouter.post("/", async (req, res) => {
  const { project_id, created_by } = req.body ?? {};
  if (!project_id || !created_by) return res.status(400).json({ error: "project_id + created_by required" });
  const { createProjectKey } = await import("../lib/auth.js");
  const { key, prefix } = await createProjectKey(project_id, created_by);
  await audit(project_id, created_by, "auth.key.created", { prefix });
  res.json({ key, prefix, note: "store now — never shown again" });
});


apiKeysRouter.delete("/:id", async (req, res) => {
  const rows = await query<any>(`select project_id, prefix from project_api_keys where id=$1`, [req.params.id]);
  await query(`delete from project_api_keys where id=$1`, [req.params.id]);
  if (rows[0]) await audit(rows[0].project_id, "user", "auth.key.revoked", { prefix: rows[0].prefix });
  res.json({ ok: true });
});
