
import { existsSync, rmSync } from "node:fs";
import { query } from "./db.js";

export type Thread = { id: string; project_id: string; owner_id: string; created_at?: string };
export type Message = { id: string; thread_id: string; role: "user" | "agent"; content: string; meta?: any; created_at: string };

export async function ensureThread(projectId: string, ownerId: string): Promise<Thread> {
  const existing = (await query<Thread>(`select * from threads where project_id=$1 and owner_id=$2`, [projectId, ownerId]))[0];
  if (existing) return existing;
  const rows = await query<Thread>(`insert into threads (project_id, owner_id) values ($1,$2) returning *`, [projectId, ownerId]);
  return rows[0];
}

export async function postMessage(threadId: string, role: "user" | "agent", content: string, meta: Record<string, any> = {}): Promise<Message> {
  const rows = await query<Message>(
    `insert into messages (thread_id, role, content, meta) values ($1,$2,$3,$4) returning *`,
    [threadId, role, String(content ?? "").slice(0, 20000), JSON.stringify(meta)]
  );
  return rows[0];
}

export async function threadMessages(threadId: string, limit = 500): Promise<Message[]> {
  return query<Message>(
    `select id, thread_id, role, content, meta, created_at from messages where thread_id=$1 order by created_at asc limit ${Number(limit) || 500}`,
    [threadId]
  );
}

function ownerSlug(ownerId: string): string {
  return ownerId.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "teammate";
}



export function threadBranch(projectId: string, ownerId: string): string {
  return `crew/${projectId.slice(0, 8)}/${ownerSlug(ownerId)}`;
}

export function threadWorkdir(threadId: string): string {
  return `.crew/worktrees/thread-${threadId}`;
}

export async function ensureThreadWorktree(
  projectId: string,
  threadId: string,
  ownerId: string
): Promise<{ branch: string; workdir: string }> {
  const { existsSync, mkdirSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const { execSync } = await import("node:child_process");
  const { resolveRepoRoot } = await import("./sandbox.js");
  const { installScopedPushHook } = await import("./git-hooks.js");

  const repoRoot = await resolveRepoRoot(projectId);
  const branch = threadBranch(projectId, ownerId);
  const workdir = threadWorkdir(threadId);
  
  const absWorkdir = resolve(workdir);
  const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();

  if (existsSync(join(absWorkdir, ".git"))) return { branch, workdir };

  mkdirSync(".crew/worktrees", { recursive: true });
  try {
    installScopedPushHook(repoRoot);
  } catch {}

  
  try {
    execSync(`git -C "${repoRoot}" rev-parse --git-dir`, { stdio: "pipe" });
  } catch {
    execSync(`git -C "${repoRoot}" init -b main`, { stdio: "pipe" });
    execSync(`git -C "${repoRoot}" add -A`, { stdio: "pipe" });
    execSync(`git -C "${repoRoot}" -c user.email=crew@local -c user.name=crew commit -m init --allow-empty`, { stdio: "pipe" });
  }

  
  
  try {
    execSync(`git -C ${repoRoot} worktree prune`, { stdio: "pipe" });
    const list = execSync(`git -C ${repoRoot} worktree list --porcelain`, { stdio: "pipe" }).toString();
    for (const block of list.split(/\r?\n\r?\n/)) {
      const wp = (block.match(/^worktree (.+)$/m)?.[1] ?? "").trim();
      const br = (block.match(/^branch (.+)$/m)?.[1] ?? "").trim();
      if (wp && br === `refs/heads/${branch}` && norm(wp) !== norm(absWorkdir)) {
        execSync(`git -C ${repoRoot} worktree remove --force "${wp}"`, { stdio: "pipe" });
      }
    }
  } catch {}

  
  
  
  try {
    if (existsSync(absWorkdir)) {
      let healthy = false;
      try {
        execSync(`git -C "${absWorkdir}" rev-parse --git-dir`, { stdio: "pipe" });
        healthy = true;
      } catch {}
      if (!healthy) rmSync(absWorkdir, { recursive: true, force: true });
    }
  } catch {}

  
  try {
    execSync(`git -C ${repoRoot} worktree add "${absWorkdir}" ${branch}`, { stdio: "pipe" });
  } catch {
    execSync(`git -C ${repoRoot} worktree add "${absWorkdir}" -b ${branch}`, { stdio: "pipe" });
  }
  return { branch, workdir };
}
