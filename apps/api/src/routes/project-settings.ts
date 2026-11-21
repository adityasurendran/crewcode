import { Router } from "express";
import { query } from "../lib/db.js";
import { z } from "zod";
import { audit } from "../lib/audit.js";

export const projectsSettingsRouter = Router();

// GET /projects/:id/settings — deployment provider config
projectsSettingsRouter.get("/:id/settings", async (req, res) => {
  const rows = await query<any>(`select * from projects where id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "project not found" });
  res.json(rows[0]);
});

// PATCH /projects/:id/settings {railway_*, fly_app_id, vercel_*, stripe_customer_id?}
projectsSettingsRouter.patch("/:id/settings", async (req, res) => {
  const allowed = ["railway_service_id", "railway_env_id", "fly_app_id", "vercel_project_id", "vercel_team_id", "vercel_deploy_hook_url", "stripe_customer_id"];
  const updates: Record<string, any> = {};
  for (const k of allowed) {
    if (typeof req.body?.[k] === "string" || req.body?.[k] === null) updates[k] = req.body[k];
  }
  if (typeof req.body?.require_approval === "boolean") updates.require_approval = req.body.require_approval;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "no valid fields" });
  const sets = Object.keys(updates).map((k, i) => `${k}=$${i + 2}`).join(", ");
  const vals = Object.values(updates);
  await query(`update projects set ${sets} where id=$1`, [req.params.id, ...vals]);
  await audit(req.params.id, "user", "project.settings.updated", updates);
  res.json({ ok: true });
});

// Migration guard: ensure columns exist (best-effort, dev convenience)
projectsSettingsRouter.post("/:id/migrate", async (_req, res) => {
  await query(`alter table projects add column if not exists railway_service_id text`).catch(() => {});
  await query(`alter table projects add column if not exists railway_env_id text`).catch(() => {});
  await query(`alter table projects add column if not exists fly_app_id text`).catch(() => {});
  await query(`alter table projects add column if not exists vercel_project_id text`).catch(() => {});
  await query(`alter table projects add column if not exists vercel_team_id text`).catch(() => {});
  await query(`alter table projects add column if not exists vercel_deploy_hook_url text`).catch(() => {});
  res.json({ ok: true });
});
