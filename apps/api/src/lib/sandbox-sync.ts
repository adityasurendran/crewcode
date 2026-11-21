// E2B sandbox diff sync — pull changed files back from sandbox, commit to task branch.
// Called by agent worker after runJob completes. Local path works already.
import { query } from "./db.js";
import { resolveRepoRoot } from "./sandbox.js";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export async function syncSandboxToBranch(taskId: string, sandboxId: string, dirOverride?: string): Promise<{ ok: boolean; files: string[]; note: string }> {
  const rows = await query(`select * from tasks where id=$1`, [taskId]);
  if (!rows.length) throw new Error("task not found");
  const task = rows[0];
  const workdir = task.sandbox_id?.startsWith("e2b-")
    ? null // E2B path: use filesystem if control plane syncs into .crew/sync/<taskId>
    : dirOverride ?? `.crew/worktrees/${taskId}`;

  if (workdir && existsSync(workdir)) {
    // LOCAL: git add + commit on task branch.
    const git = (cmd: string) => execSync(cmd, { cwd: workdir, stdio: "pipe" });
    try {
      // Stage everything first so UNTRACKED (new) files are detected too —
      // `git diff --name-only` alone ignores new files.
      git(`git add -A`);
      const staged = git(`git diff --cached --name-only`).toString();
      const files = staged.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!files.length) return { ok: true, files: [], note: "no changes" };
      git(`git -c user.email=crew@local -c user.name=crew commit -m "agent: ${taskId.slice(0, 8)}"`);
      // Push to remote if configured
      try {
        git(`git push -u origin ${task.branch}`);
      } catch {
        return { ok: true, files, note: "committed locally, push skipped (no remote)" };
      }
      return { ok: true, files, note: "committed + pushed" };
    } catch (e: any) {
      return { ok: false, files: [], note: `local sync failed: ${String(e.message).slice(0, 300)}` };
    }
  }

  // E2B path: expects control plane to have synced files into .crew/sync/<taskId>/
  const syncDir = `.crew/sync/${taskId}`;
  if (!existsSync(syncDir)) return { ok: false, files: [], note: `e2b sync dir missing ${syncDir}` };
  const root = await resolveRepoRoot(task.project_id); // project's own repo
  const branchDir = `.crew/worktrees/${taskId}`;
  if (!existsSync(branchDir)) {
    // create worktree from repo root
    execSync(`git -C ${root} worktree add ${branchDir} -b ${task.branch}`, { stdio: "pipe" });
  }
  // Copy synced files into worktree, commit
  const { cpSync } = await import("node:fs");
  cpSync(syncDir, branchDir, { recursive: true });
  const git = (cmd: string) => execSync(cmd, { cwd: branchDir, stdio: "pipe" });
  git(`git add -A`);
  git(`git -c user.email=crew@local -c user.name=crew commit -m "agent: ${taskId.slice(0, 8)} (e2b)"`);
  try {
    git(`git push -u origin ${task.branch}`);
  } catch {
    return { ok: true, files: ["(e2b)"], note: "e2b commit local, push skipped" };
  }
  return { ok: true, files: ["(e2b)"], note: "e2b committed + pushed" };
}
