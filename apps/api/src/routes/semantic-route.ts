import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { routeFor, TIER_MODEL, TIER_COST_PER_1K } from "../lib/cost-optimizer.js";
import { audit } from "../lib/audit.js";

export const semanticRouteRouter = Router();


semanticRouteRouter.get("/", async (req, res) => {
  const { task_id } = req.query as { task_id?: string };
  if (!task_id) return res.status(400).json({ error: "task_id required" });
  const task = (await query<any>(`select * from tasks where id=$1`, [task_id]))[0];
  if (!task) return res.status(404).json({ error: "task not found" });

  let tier = "heavy";
  let source = "default";
  try {
    const maps = await query<any>(`select tier from cost_mapping where project_id=$1 and kind='semantic_patch'`, [task.project_id]).catch(() => []);
    if (maps[0]?.tier) {
      tier = maps[0].tier;
      source = "project_override";
    }
  } catch {}
  const model = TIER_MODEL[tier as keyof typeof TIER_MODEL] ?? "opencode-go/mimo-v2.6-pro";
  res.json({ task_id, kind: "semantic_patch", tier, model, source, cost_per_1k: TIER_COST_PER_1K[tier as keyof typeof TIER_COST_PER_1K] });
});


semanticRouteRouter.patch("/", async (req, res) => {
  const parsed = z.object({ task_id: z.string().uuid(), tier: z.enum(["tiny", "cheap", "standard", "heavy", "frontier"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { task_id, tier } = parsed.data;
  const task = (await query<any>(`select * from tasks where id=$1`, [task_id]))[0];
  if (!task) return res.status(404).json({ error: "task not found" });
  await query(
    `insert into cost_mapping (project_id, kind, tier) values ($1,'semantic_patch',$2)
     on conflict (project_id, kind) do update set tier=$2`,
    [task.project_id, tier]
  ).catch(() => {});
  await audit(task.project_id, "user", "semantic_route.overridden", { task_id, tier });
  res.json({ ok: true, tier, model: TIER_MODEL[tier] });
});
