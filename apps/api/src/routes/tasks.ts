import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { enqueue, QUEUES } from "../lib/queue.js";
import { createSandbox } from "../lib/sandbox.js";

export const tasksRouter = Router();

const CreateTask = z.object({
  project_id: z.string().uuid(),
  owner_id: z.string().min(1),
  objective: z.string().min(4),
  allowlist: z.array(z.string()).default([]),
});

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);
}

// POST /tasks — create task branch + sandbox + enqueue agent job
tasksRouter.post("/", async (req, res) => {
  const parsed = CreateTask.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, owner_id, objective, allowlist } = parsed.data;

  const branch = `crew/${project_id.slice(0, 8)}/${Date.now().toString(36)}-${slug(objective)}`;
  const rows = await query(
    `insert into tasks (project_id, owner_id, objective, status, branch, allowlist)
     values ($1,$2,$3,'queued',$4,$5) returning *`,
    [project_id, owner_id, objective, branch, JSON.stringify(allowlist)]
  );
  const task = rows[0];

  const sandbox = await createSandbox(project_id, task.id, branch);
  await query(`update tasks set sandbox_id=$2, status='running' where id=$1`, [task.id, sandbox.id]);

  // For E2B sandboxes, also clone the repo into the sandbox now.
  if (sandbox.id.startsWith("e2b-")) {
    try {
      const { e2bCreateAndClone } = await import("../lib/e2b-deploy.js");
      await e2bCreateAndClone(project_id, task.id, branch);
    } catch (e: any) {
      await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
        task.id,
        JSON.stringify({ message: `e2b clone failed: ${String(e?.message ?? e).slice(0, 300)}` }),
      ]);
    }
  }

  await enqueue(QUEUES.agentJobs, { taskId: task.id, projectId: project_id, objective, workdir: sandbox.workdir });
  await query(`insert into events (task_id, type, payload) values ($1,'intent',$2)`, [
    task.id,
    JSON.stringify({ objective }),
  ]);

  res.json({ ...task, workdir: sandbox.workdir });
});

// GET /tasks?project_id= — team board feed
tasksRouter.get("/", async (req, res) => {
  const { project_id } = req.query;
  const rows = project_id
    ? await query(`select * from tasks where project_id=$1 order by created_at desc`, [project_id])
    : await query(`select * from tasks order by created_at desc limit 50`);
  res.json(rows);
});

// GET /tasks?org_id= — tenant-scoped list via RLS
tasksRouter.get("/by-org", async (req, res) => {
  const { org_id } = req.query as { org_id?: string };
  if (!org_id) return res.status(400).json({ error: "org_id required" });
  const { queryWithOrg } = await import("../lib/db-rls.js");
  res.json(
    await queryWithOrg(
      `select t.* from tasks t join projects p on p.id=t.project_id where p.org_id=$1 order by t.created_at desc limit 50`,
      [org_id],
      org_id
    )
  );
});

// POST /tasks/:id/events — workers report structured state (never raw chat)
tasksRouter.post("/:id/events", async (req, res) => {
  const { type, payload } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "type required" });
  await query(`insert into events (task_id, type, payload) values ($1,$2,$3)`, [
    req.params.id,
    type,
    JSON.stringify(payload ?? {}),
  ]);
  res.json({ ok: true });
});

// POST /tasks/:id/done — enqueue for integration
tasksRouter.post("/:id/done", async (req, res) => {
  await query(`update tasks set status='testing' where id=$1`, [req.params.id]);
  await enqueue(QUEUES.mergeQueue, { taskId: req.params.id });
  res.json({ ok: true, queued: true });
});
