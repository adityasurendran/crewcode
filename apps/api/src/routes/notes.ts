
import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";

export const notesRouter = Router();

notesRouter.get("/", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id required" });
  const rows = await query<any>(`select content, updated_by, updated_at from notes where project_id=$1`, [project_id]);
  res.json(rows[0] ?? { content: "", updated_by: null, updated_at: null });
});

notesRouter.put("/", async (req, res) => {
  const parsed = z
    .object({ project_id: z.string().uuid(), content: z.string().max(20000), updated_by: z.string().max(120).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, content, updated_by } = parsed.data;
  await query(
    `insert into notes (project_id, content, updated_by, updated_at) values ($1,$2,$3,now())
     on conflict (project_id) do update set content=$2, updated_by=$3, updated_at=now()`,
    [project_id, content, updated_by ?? null]
  );
  res.json({ ok: true });
});


notesRouter.get("/stream", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  let last: string | null = null;
  const tick = async () => {
    try {
      const rows = await query<any>(`select content, updated_by, updated_at from notes where project_id=$1`, [project_id]);
      const n = rows[0];
      if (n && n.updated_at !== last) {
        last = n.updated_at;
        res.write(`data: ${JSON.stringify(n)}\n\n`);
      }
    } catch {}
  };
  const iv = setInterval(tick, 1000);
  req.on("close", () => clearInterval(iv));
});
