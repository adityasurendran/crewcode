import { Router } from "express";
import { query } from "../lib/db.js";

export const rateLimitRouter = Router();


rateLimitRouter.get("/", async (req, res) => {
  const { actor } = req.query as { actor?: string };
  const { redis } = await import("../lib/queue.js");
  const keys = await redis.keys(`crew:rl:*${actor ? `:${actor.replace(/[^a-zA-Z0-9-_:.]/g, "_")}` : ""}`);
  const out: Record<string, { count: number; ttl_sec: number }> = {};
  for (const k of keys.slice(0, 50)) {
    const count = Number(await redis.get(k).catch(() => 0));
    const ttl = Number(await redis.ttl(k).catch(() => -1));
    out[k] = { count, ttl_sec: ttl };
  }
  res.json({ actor: actor ?? null, limits: out });
});
