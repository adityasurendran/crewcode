

import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";

export const crewRouter = Router();

export const CREW_ROLES = ["developer", "frontend", "backend", "designer", "tester", "product", "lead"] as const;
export const CREW_LEVELS = ["beginner", "intermediate", "advanced"] as const;

crewRouter.get("/", async (req, res) => {
  try {
    const { project_id } = req.query as { project_id?: string };
    if (!project_id) return res.status(400).json({ error: "project_id required" });

  const [owners, members, stats, msgCounts] = await Promise.all([
    query<any>(`select distinct owner_id from threads where project_id=$1`, [project_id]).catch(() => []),
    query<any>(`select * from crew_members where project_id=$1`, [project_id]).catch(() => []),
    query<any>(
      `select owner_id, count(*)::int as tasks, count(*) filter (where status='merged')::int as merged
       from tasks where project_id=$1 group by owner_id`,
      [project_id]
    ).catch(() => []),
    query<any>(
      `select t.owner_id, count(m.id)::int as messages from messages m
       join threads t on t.id=m.thread_id where t.project_id=$1 and m.role='user' group by t.owner_id`,
      [project_id]
    ).catch(() => []),
  ]);

  const byOwner = new Map(members.map((m: any) => [m.owner_id, m]));
  const statMap = new Map(stats.map((s: any) => [s.owner_id, s]));
  const msgMap = new Map(msgCounts.map((s: any) => [s.owner_id, s]));
  const all = new Set<string>([
    ...owners.map((o: any) => o.owner_id),
    ...members.map((m: any) => m.owner_id),
    ...stats.map((s: any) => s.owner_id),
  ]);

  res.json(
    [...all]
      .map((owner_id) => ({
        owner_id,
        role: byOwner.get(owner_id)?.role ?? "developer",
        experience: byOwner.get(owner_id)?.experience ?? "beginner",
        tasks: statMap.get(owner_id)?.tasks ?? 0,
        merged: statMap.get(owner_id)?.merged ?? 0,
        messages: msgMap.get(owner_id)?.messages ?? 0,
      }))
      .sort((a, b) => b.merged - a.merged)
  );
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

crewRouter.put("/", async (req, res) => {
  const parsed = z
    .object({
      project_id: z.string().uuid(),
      owner_id: z.string().min(1),
      role: z.enum(CREW_ROLES),
      experience: z.enum(CREW_LEVELS),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, owner_id, role, experience } = parsed.data;
  try {
    await query(
      `insert into crew_members (project_id, owner_id, role, experience) values ($1,$2,$3,$4)
       on conflict (project_id, owner_id) do update set role=$3, experience=$4, updated_at=now()`,
      [project_id, owner_id, role, experience]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});



crewRouter.post("/leave", async (req, res) => {
  const parsed = z.object({ project_id: z.string().uuid(), owner_id: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, owner_id } = parsed.data;
  try {
    await query(
      `delete from messages where thread_id in (select id from threads where project_id=$1 and owner_id=$2)`,
      [project_id, owner_id]
    );
    await query(`delete from threads where project_id=$1 and owner_id=$2`, [project_id, owner_id]);
    await query(`delete from crew_members where project_id=$1 and owner_id=$2`, [project_id, owner_id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});
