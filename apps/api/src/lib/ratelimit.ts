// Redis sliding-window rate limits — per actor + per route.
// Defaults: 60 task-creates/hour, 300 capability calls/hour, 600 reads/hour.
// Exceeding returns 429 with retry_after. Uses Redis INCR+EXPIRE (fixed window, Phase 0).
import type { Request, Response, NextFunction } from "express";
import { redis } from "./queue.js";

const LIMITS: Record<string, { max: number; windowSec: number }> = {
  "POST:/tasks": { max: 60, windowSec: 3600 },
  "POST:/capabilities": { max: 300, windowSec: 3600 },
  default: { max: 600, windowSec: 3600 },
};

function keyFor(req: Request, rule: string): string {
  const actor = ((req as any).actor ?? req.ip ?? "anon").toString().replace(/[^a-zA-Z0-9-_:.]/g, "_");
  return `crew:rl:${rule}:${actor}`;
}

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  // Skip when Redis unavailable (dev without docker) — fail open, log once.
  try {
    const routeKey = `${req.method}:${req.path.split("/").slice(0, 2).join("/")}`;
    const rule = LIMITS[routeKey] ?? LIMITS[`${req.method}:${req.path}`] ?? LIMITS.default;
    const ruleName = LIMITS[routeKey] ? routeKey : LIMITS[`${req.method}:${req.path}`] ? `${req.method}:${req.path}` : "default";
    const k = keyFor(req, ruleName);
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, rule.windowSec);
    if (n > rule.max) {
      const ttl = await redis.ttl(k);
      return res.status(429).json({ error: "rate limited", retry_after_sec: ttl });
    }
    next();
  } catch {
    next();
  }
}
