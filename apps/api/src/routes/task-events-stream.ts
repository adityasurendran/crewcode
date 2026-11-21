// SSE stream for a single task's events (live agent feed).
import { Router } from "express";
import { query } from "../lib/db.js";

export const taskEventsStreamRouter = Router();

taskEventsStreamRouter.get("/:task_id/stream", async (req, res) => {
  const taskId = String((req.params as any).task_id ?? "");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  let since = new Date().toISOString();
  const timer = setInterval(async () => {
    try {
      const rows = await query<any>(`select * from events where task_id=$1 and created_at > $2 order by created_at asc limit 20`, [taskId, since]);
      if (rows.length) {
        since = rows[rows.length - 1].created_at;
        for (const r of rows) res.write(`data: ${JSON.stringify(r)}\n\n`);
      }
    } catch {}
  }, 1500);
  req.on("close", () => clearInterval(timer));
});
