import { Router } from "express";
import { listInstances, stopInstance, ensureInstance, runIntegrator, INTEGRATOR_OWNER } from "../lib/agent-pool.js";
import { query } from "../lib/db.js";

export const agentsRouter = Router();


agentsRouter.get("/instances", async (_req, res) => {
  try {
    res.json({ instances: await listInstances() });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 300) });
  }
});


agentsRouter.post("/instances/ensure", async (req, res) => {
  const { owner_id, role } = req.body ?? {};
  if (!owner_id) return res.status(400).json({ error: "owner_id required" });
  try {
    res.json(await ensureInstance(String(owner_id), role === "integrator" ? "integrator" : "crew"));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 300) });
  }
});


agentsRouter.post("/instances/stop", async (req, res) => {
  const { owner_id } = req.body ?? {};
  if (!owner_id) return res.status(400).json({ error: "owner_id required" });
  await stopInstance(String(owner_id));
  res.json({ ok: true });
});


agentsRouter.post("/integrator/run", async (req, res) => {
  const { task_id, instruction } = req.body ?? {};
  if (!task_id) return res.status(400).json({ error: "task_id required" });
  const task = (await query<any>(`select * from tasks where id=$1`, [task_id]).catch(() => []))[0];
  if (!task) return res.status(404).json({ error: "task not found" });
  const workdir = `.crew/worktrees/${task_id}`;
  const brief =
    instruction ??
    `Integrate the teammate task "${task.objective}" so it merges cleanly with main. Diagnose and fix any semantic breakage with minimal edits.`;
  try {
    const run = await runIntegrator(String(task_id), workdir, brief);
    await query(`insert into events (task_id, type, payload) values ($1,'integrator',$2)`, [
      task_id,
      JSON.stringify({ manual: true, ok: run.ok, note: run.note, port: run.instance?.port ?? null }),
    ]).catch(() => {});
    res.json({ owner: INTEGRATOR_OWNER, ok: run.ok, note: run.note, attached: run.attached, port: run.instance?.port ?? null, session: run.sessionId });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 400) });
  }
});
