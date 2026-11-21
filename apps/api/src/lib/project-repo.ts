// Each project gets its own writable git repo. The packaged starter lives in
// the read-only app resources; a project's working copy belongs in the user's
// data dir so projects never share files or merge into each other.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { execSync } from "node:child_process";
import { query } from "./db.js";

export const PROJECT_REPO_PREFIX = ".crew/projects/";

function safeId(projectId: string) {
  return String(projectId).replace(/[^a-zA-Z0-9-]/g, "");
}

function templateRoot() {
  return resolve(process.env.CREW_ASSETS ?? process.cwd(), "templates", "next-supabase");
}

export function isManagedRepo(repoUrl?: string): boolean {
  return !!repoUrl && (repoUrl.startsWith(PROJECT_REPO_PREFIX) || repoUrl.startsWith(PROJECT_REPO_PREFIX.replace(/\//g, sep)));
}

export async function ensureProjectRepo(projectId: string, repoUrl?: string): Promise<string> {
  // Remote repositories are cloned by the sandbox provider, not managed here.
  if (repoUrl && (/^https?:\/\//i.test(repoUrl) || repoUrl.startsWith("git@"))) return repoUrl;
  // An explicit local checkout already on disk stays where it is.
  if (repoUrl && isAbsolute(repoUrl) && existsSync(repoUrl)) return repoUrl;

  const id = safeId(projectId);
  const dir = join(process.cwd(), ".crew", "projects", id);
  const already = existsSync(join(dir, ".git"));

  if (!already) {
    mkdirSync(dir, { recursive: true });
    const tpl = templateRoot();
    if (existsSync(tpl)) {
      cpSync(tpl, dir, {
        recursive: true,
        force: true,
        filter: (src) => {
          const base = src.split(sep).pop() ?? "";
          return base !== ".git" && base !== ".next" && base !== "node_modules";
        },
      });
    }
    try {
      execSync(`git -C "${dir}" rev-parse --git-dir`, { stdio: "pipe" });
    } catch {
      execSync(`git -C "${dir}" init -b main`, { stdio: "pipe" });
      execSync(`git -C "${dir}" add -A`, { stdio: "pipe" });
      execSync(`git -C "${dir}" -c user.email=crew@local -c user.name=crew commit -m init --allow-empty`, {
        stdio: "pipe",
      });
    }
  }

  const stored = `${PROJECT_REPO_PREFIX}${id}`;
  await query(`update projects set repo_url=$1 where id=$2 and repo_url is distinct from $1`, [stored, projectId]).catch(() => {});
  return dir;
}
