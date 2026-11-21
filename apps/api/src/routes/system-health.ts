import { Router } from "express";
import { query } from "../lib/db.js";
import { redis } from "../lib/queue.js";

export const systemHealthRouter = Router();

// GET /health/detailed — full system status for ops dashboards
systemHealthRouter.get("/detailed", async (_req, res) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Postgres
  try {
    await query(`select 1`);
    checks.postgres = { ok: true };
  } catch (e: any) {
    checks.postgres = { ok: false, detail: String(e?.message ?? e).slice(0, 200) };
  }

  // Redis
  try {
    await redis.ping();
    checks.redis = { ok: true };
  } catch (e: any) {
    checks.redis = { ok: false, detail: String(e?.message ?? e).slice(0, 200) };
  }

  // E2B (config only — don't create sandbox)
  checks.e2b = { ok: !!process.env.E2B_API_KEY, detail: process.env.E2B_API_KEY ? "configured" : "E2B_API_KEY not set" };

  // Providers (config only)
  checks.stripe = { ok: !!process.env.STRIPE_SECRET_KEY, detail: process.env.STRIPE_SECRET_KEY ? "configured" : "not configured" };
  checks.github = { ok: !!process.env.GITHUB_TOKEN, detail: process.env.GITHUB_TOKEN ? "configured" : "not configured" };
  checks.railway = { ok: !!process.env.RAILWAY_TOKEN, detail: process.env.RAILWAY_TOKEN ? "configured" : "not configured" };
  checks.fly = { ok: !!process.env.FLY_API_TOKEN, detail: process.env.FLY_API_TOKEN ? "configured" : "not configured" };

  // Task counts by status
  let taskCounts: Record<string, number> = {};
  try {
    const rows = await query<any>(`select status, count(*)::int as n from tasks group by status`);
    for (const r of rows) taskCounts[r.status] = r.n;
  } catch {}

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    service: "crewcode-api",
    time: new Date().toISOString(),
    checks,
    tasks: taskCounts,
    version: "0.1.0",
  });
});
