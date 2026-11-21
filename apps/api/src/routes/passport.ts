// Creator Passport — evidence of a person's real contributions in a project.
// Derived honestly from tasks, merges and messages. AI-assisted work is labelled
// explicitly; nothing is described as independently certified.
import { Router } from "express";
import { query } from "../lib/db.js";

export const passportRouter = Router();

const ROLE_SKILLS: Record<string, string[]> = {
  developer: ["Programming", "Problem solving"],
  frontend: ["Programming", "Design"],
  backend: ["Programming", "Problem solving"],
  designer: ["Design", "Product thinking"],
  tester: ["Testing", "Problem solving"],
  product: ["Product thinking", "Technical communication"],
  lead: ["Collaboration", "Technical communication"],
};

export async function buildPassport(projectId: string, ownerId: string) {
  const [mrows, tasks, msgs] = await Promise.all([
    query<any>(`select role, experience from crew_members where project_id=$1 and owner_id=$2`, [projectId, ownerId]).catch(() => []),
    query<any>(
      `select id, objective, status, mode, created_at from tasks where project_id=$1 and owner_id=$2 order by created_at desc limit 100`,
      [projectId, ownerId]
    ).catch(() => []),
    query<any>(
      `select count(*)::int as n from messages m join threads t on t.id=m.thread_id
       where t.project_id=$1 and t.owner_id=$2 and m.role='user'`,
      [projectId, ownerId]
    ).catch(() => []),
  ]);

  const role = mrows[0]?.role ?? "developer";
  const experience = mrows[0]?.experience ?? "beginner";
  const ids = tasks.map((t: any) => t.id);
  let fileEvents: any[] = [];
  if (ids.length) {
    fileEvents = await query<any>(
      `select task_id, payload from events where type='sync' and task_id = any($1::uuid[])`,
      [ids]
    ).catch(() => []);
  }
  const filesByTask = new Map<string, string[]>();
  for (const e of fileEvents) {
    const p = typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload;
    if (Array.isArray(p?.files)) filesByTask.set(e.task_id, p.files);
  }

  const contributions = tasks.map((t: any) => ({
    task_id: t.id,
    title: t.objective,
    status: t.status,
    mode: t.mode ?? "build",
    ai_assisted: true,
    files: filesByTask.get(t.id) ?? [],
    at: t.created_at,
  }));

  const merged = tasks.filter((t: any) => t.status === "merged").length;
  const messages = msgs[0]?.n ?? 0;
  const files = contributions.reduce((n, c) => n + c.files.length, 0);

  const skills = new Set<string>(ROLE_SKILLS[role] ?? ROLE_SKILLS.developer);
  if (messages > 0) skills.add("Collaboration");
  if (merged > 0) skills.add("Technical communication");

  return {
    profile: { owner_id: ownerId, role, experience },
    stats: { tasks: tasks.length, merged, messages, files },
    skills: [...skills].map((name) => ({
      name,
      // evidence-based signal, not a grade
      evidence:
        name === "Programming" || name === "Problem solving"
          ? merged
          : name === "Design" || name === "Product thinking"
            ? tasks.length
            : name === "Testing"
              ? tasks.filter((t: any) => t.status === "testing" || t.status === "merged").length
              : messages,
    })),
    contributions,
    disclaimer:
      "Derived from activity in this project. Work is AI-assisted; this is evidence of participation, not a certification.",
    generated_at: new Date().toISOString(),
  };
}

passportRouter.get("/", async (req, res) => {
  const { project_id, owner_id } = req.query as { project_id?: string; owner_id?: string };
  if (!project_id || !owner_id) return res.status(400).json({ error: "project_id + owner_id required" });
  res.json(await buildPassport(project_id, owner_id));
});

passportRouter.get("/export", async (req, res) => {
  const { project_id, owner_id } = req.query as { project_id?: string; owner_id?: string };
  if (!project_id || !owner_id) return res.status(400).json({ error: "project_id + owner_id required" });
  const data = await buildPassport(project_id, owner_id);
  res.setHeader("content-type", "application/json");
  res.setHeader("content-disposition", `attachment; filename="creator-passport-${owner_id}.json"`);
  res.send(JSON.stringify(data, null, 2));
});
