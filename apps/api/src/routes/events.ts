import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";

export const eventsRouter = Router();

// GET /events?project_id=&org_id=&limit= — recent structured events, never raw chat
eventsRouter.get("/", async (req, res) => {
  const { project_id, org_id, limit } = req.query as { project_id?: string; org_id?: string; limit?: string };
  const n = Math.min(Number(limit) || 100, 500);
  if (org_id) {
    res.json(
      await queryWithOrg(
        `select e.* from events e join tasks t on t.id=e.task_id join projects p on p.id=t.project_id where p.org_id=$1 order by e.created_at desc limit $2`,
        [org_id, n],
        org_id
      )
    );
    return;
  }
  const rows = project_id
    ? await query(
        `select e.* from events e join tasks t on t.id=e.task_id where t.project_id=$1 order by e.created_at desc limit $2`,
        [project_id, n]
      )
    : await query(`select * from events order by created_at desc limit $1`, [n]);
  res.json(rows);
});

// GET /events/stream — SSE for live board. Polls Postgres every 2s (Phase 0).
// Phase 1: switch to Redis pub/sub from workers for instant push.
eventsRouter.get("/stream", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  let since = new Date().toISOString();
  const timer = setInterval(async () => {
    try {
      const rows = project_id
        ? await query(
            `select e.* from events e join tasks t on t.id=e.task_id where t.project_id=$1 and e.created_at > $2 order by e.created_at asc limit 50`,
            [project_id, since]
          )
        : await query(`select * from events where created_at > $1 order by created_at asc limit 50`, [since]);
      if (rows.length) {
        since = rows[rows.length - 1].created_at;
        for (const r of rows) {
          res.write(`data: ${JSON.stringify(r)}\n\n`);
        }
      }
    } catch {
      // db hiccup — keep stream alive
    }
  }, 2000);
  req.on("close", () => clearInterval(timer));
});
