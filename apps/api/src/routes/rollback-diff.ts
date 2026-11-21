// Rollback diff endpoint — returns the diff for a rollback before confirming.
// GET /rollback/diff?task_id=&project_id= — show what will be reverted.
import { Router } from "express";
import { query } from "../lib/db.js";

export const rollbackDiffRouter = Router();

rollbackDiffRouter.get("/", async (req, res) => {
  const { task_id } = req.query as { task_id?: string };
  if (!task_id) return res.status(400).json({ error: "task_id required" });

  const t = (await query<any>(`select project_id from tasks where id=$1`, [task_id]).catch(() => []))[0];
  const { resolveRepoRoot } = await import("../lib/sandbox.js");
  const root = await resolveRepoRoot(t?.project_id);
  const { execSync } = await import("node:child_process");
  let rev = "";
  try {
    rev = execSync(`git -C ${root} log --grep="crew: merge ${task_id}" -1 --format=%H`, { stdio: "pipe" }).toString().trim();
  } catch {
    return res.status(404).json({ error: "no merge commit for this task" });
  }
  if (!rev) return res.status(404).json({ error: "no merge commit for this task" });

  let diff = "";
  try {
    diff = execSync(`git -C ${root} show ${rev} --stat --format=short`, { stdio: "pipe" }).toString();
  } catch {
    diff = "(diff unavailable)";
  }

  // Store as artifact for audit trail.
  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'rollback_diff',$2,$3)`, [
    task_id,
    `git:${rev}`,
    JSON.stringify({ commit: rev }),
  ]).catch(() => {});

  res.json({ commit: rev, stat: diff.slice(0, 4000), preview_url: `/preview/${task_id}` });
});
