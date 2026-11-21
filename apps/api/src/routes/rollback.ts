

import { Router } from "express";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const rollbackRouter = Router();



rollbackRouter.post("/", async (req, res) => {
  const { project_id, task_id, approved_by } = req.body ?? {};
  if (!approved_by) return res.status(400).json({ error: "approved_by required (human gate)" });

  const { resolveRepoRoot } = await import("../lib/sandbox.js");
  const root = await resolveRepoRoot(project_id);
  const { execSync } = await import("node:child_process");
  let rev: string | undefined;

  try {
    if (task_id) {
      const msg = `crew: merge ${task_id}`;
      rev = execSync(`git -C ${root} log --grep="${msg}" -1 --format=%H`, { stdio: "pipe" }).toString().trim();
    } else {
      rev = execSync(`git -C ${root} log --grep="crew: merge" -1 --format=%H`, { stdio: "pipe" }).toString().trim();
    }
  } catch {
    return res.status(404).json({ error: "no matching merge commit found on main" });
  }
  if (!rev) return res.status(404).json({ error: "no merge commit to revert" });

  try {
    execSync(`git -C ${root} revert --no-edit ${rev}`, { stdio: "pipe" });
  } catch (e: any) {
    return res.status(500).json({ error: `revert failed: ${String(e?.message ?? e).slice(0, 500)}` });
  }

  if (task_id) {
    await query(`update tasks set status='blocked' where id=$1`, [task_id]);
    await query(`insert into events (task_id, type, payload) values ($1,'rolled_back',$2)`, [
      task_id,
      JSON.stringify({ reverted_commit: rev, by: approved_by }),
    ]);
    
    try {
      const { deployPreview } = await import("../lib/previews.js");
      await deployPreview(task_id, `.crew/worktrees/${task_id}`);
    } catch {
      
    }
  }
  await audit(project_id ?? null, approved_by, "rollback.revert", { reverted_commit: rev, task_id });
  res.json({ ok: true, reverted_commit: rev, note: "preview redeploys on next /previews call" });
});
