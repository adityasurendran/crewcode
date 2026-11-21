import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { selectModelFor, TIER_MODEL, TIER_COST_PER_1K, routeFor } from "../lib/cost-optimizer.js";
import { audit } from "../lib/audit.js";

export const costOptimizerRouter = Router();


costOptimizerRouter.get("/tiers", (_req, res) => {
  res.json({ tiers: TIER_MODEL, costs_per_1k: TIER_COST_PER_1K });
});


costOptimizerRouter.get("/route", (req, res) => {
  const { kind } = req.query as { kind?: string };
  if (!kind) return res.status(400).json({ error: "kind required" });
  const r = routeFor(kind);
  res.json({ kind, tier: r.tier, model: r.model, cost_per_1k: TIER_COST_PER_1K[r.tier] });
});


costOptimizerRouter.patch("/mapping", async (req, res) => {
  const parsed = z.object({ project_id: z.string().uuid(), kind: z.string().min(1), tier: z.enum(["tiny", "cheap", "standard", "heavy", "frontier"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, kind, tier } = parsed.data;
  await query(
    `insert into cost_mapping (project_id, kind, tier) values ($1,$2,$3)
     on conflict (project_id, kind) do update set tier=$3`,
    [project_id, kind, tier]
  ).catch(async () => {
    await query(`create table if not exists cost_mapping (project_id uuid, kind text, tier text, primary key (project_id, kind))`).catch(() => {});
    await query(`insert into cost_mapping (project_id, kind, tier) values ($1,$2,$3)`, [project_id, kind, tier]).catch(() => {});
  });
  await audit(project_id, "user", "cost.mapping.updated", { kind, tier });
  res.json({ ok: true, kind, tier, model: TIER_MODEL[tier] });
});


costOptimizerRouter.get("/mapping", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id required" });
  const rows = await query<any>(`select kind, tier from cost_mapping where project_id=$1`, [project_id]).catch(() => []);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.kind] = r.tier;
  res.json(out);
});
