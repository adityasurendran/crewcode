// Sandbox provider interface — E2B default, local-worktree for dev only.
// Prod rule: agents never see secrets, never touch host git directly.
import { isAbsolute, resolve, sep } from "node:path";
export type Sandbox = { id: string; workdir: string; branch: string };

// Relative repo paths ("templates/next-supabase") resolve against the app's
// assets dir in the packaged app, or the repo root in dev. Project repos live
// under the writable data dir (cwd), not inside the app bundle.
function absRepo(p: string): string {
  if (isAbsolute(p)) return p;
  const local = p === ".crew" || p.startsWith(".crew/") || p.startsWith(`.crew${sep}`);
  return resolve(local ? process.cwd() : (process.env.CREW_ASSETS ?? process.cwd()), p);
}

// The repo for local worktrees comes from the PROJECT row (explicit override
// first), so every project builds/merges in its own repo — never a hardcoded
// single template dir.
export async function resolveRepoRoot(projectId?: string, override?: string): Promise<string> {
  if (override) return absRepo(override);
  if (projectId) {
    try {
      const { query } = await import("./db.js");
      const proj = (await query<any>(`select repo_url from projects where id=$1`, [projectId]))[0];
      if (proj?.repo_url) {
        const { ensureProjectRepo } = await import("./project-repo.js");
        return await ensureProjectRepo(projectId, proj.repo_url);
      }
      // No repo_url yet: give the project its own starter repo.
      const { ensureProjectRepo } = await import("./project-repo.js");
      return await ensureProjectRepo(projectId);
    } catch {}
  }
  return absRepo(process.env.LOCAL_REPO_ROOT ?? process.env.TARGET_REPO_URL ?? "templates/next-supabase");
}

function provider() {
  return process.env.SANDBOX_PROVIDER ?? "local-worktree";
}

export async function createSandbox(
  projectId: string,
  taskId: string,
  branch: string,
  repoRoot?: string
): Promise<Sandbox> {
  const p = provider();
  if (p === "e2b") {
    const key = process.env.E2B_API_KEY;
    if (!key) throw new Error("E2B_API_KEY missing — set SANDBOX_PROVIDER=local-worktree for dev");
    // Resolve repo URL: explicit param > project row > TARGET_REPO_URL env.
    let url = repoRoot ?? "";
    if (!url) {
      try {
        const { query } = await import("./db.js");
        const proj = (await query<any>(`select repo_url from projects where id=$1`, [projectId]))[0];
        url = proj?.repo_url ?? process.env.TARGET_REPO_URL ?? "";
      } catch {
        url = process.env.TARGET_REPO_URL ?? "";
      }
    }
    let E2B: any;
    try {
      E2B = await import("@e2b/code-interpreter");
    } catch {
      throw new Error("E2B dep missing — run: npm install @e2b/code-interpreter -w crewcode-api");
    }
    const Sbx = E2B.Sandbox ?? E2B.default?.Sandbox;
    const sbx = await Sbx.create({ apiKey: key, timeoutMs: 600_000 });
    if (url) {
      let authed = url;
      const token = process.env.GITHUB_TOKEN;
      if (token && url.includes("github.com")) authed = url.replace("https://", `https://x-access-token:${token}@`);
      await sbx.commands.run(`git clone --depth 50 ${authed} /home/user/repo`);
      await sbx.commands.run(`git -C /home/user/repo checkout -b ${branch}`);
    } else {
      await sbx.commands.run(`mkdir -p /home/user/repo && cd /home/user/repo && git init -b ${branch}`);
    }
    // No secrets injected. Workdir is inside sandbox; control plane syncs diffs out via git.
    return { id: `e2b-${sbx.sandboxId ?? sbx.id ?? taskId}`, workdir: "e2b:/home/user/repo", branch };
  }
  if (p === "daytona") {
    throw new Error(
      "Daytona needs an account + DAYTONA_API_KEY (https://www.daytona.io). Set SANDBOX_PROVIDER=e2b or local-worktree instead."
    );
  }

  // DEV ONLY: operate on the TARGET project repo, never crewcode itself.
  const root = await resolveRepoRoot(projectId, repoRoot);
  const { execSync } = await import("node:child_process");
  const { existsSync, mkdirSync, cpSync } = await import("node:fs");
  const workdir = `.crew/worktrees/${taskId}`;
  try {
    // Ensure target repo is a git repo with a main branch.
    execSync(`git -C ${root} rev-parse --git-dir`, { stdio: "pipe" });
  } catch {
    execSync(`git -C ${root} init -b main`, { stdio: "pipe" });
    execSync(`git -C ${root} add -A`, { stdio: "pipe" });
    execSync(`git -C ${root} -c user.email=crew@local -c user.name=crew commit -m "init" --allow-empty`, { stdio: "pipe" });
  }
  try {
    // Scoped-push guard: agents may push only crew/* (never main) — enforced by git.
    const { installScopedPushHook } = await import("./git-hooks.js");
    installScopedPushHook(root);
    execSync(`git -C ${root} worktree add ../../.crew/worktrees/${taskId} -b ${branch}`, { stdio: "pipe" });
    return { id: `local-${taskId}`, workdir, branch };
  } catch {
    // Fallback: plain filesystem copy when git worktree unavailable (Windows edge).
    mkdirSync(".crew/worktrees", { recursive: true });
    if (!existsSync(workdir)) cpSync(root, workdir, { recursive: true });
    return { id: `local-copy-${taskId}`, workdir, branch };
  }
}

export async function destroySandbox(s: Sandbox, repoRoot?: string) {
  if (s.id.startsWith("e2b-")) {
    try {
      const E2B: any = await import("@e2b/code-interpreter");
      const Sbx = E2B.Sandbox ?? E2B.default?.Sandbox;
      await Sbx.kill(s.id.replace(/^e2b-/, ""));
    } catch {
      // already dead / dep missing — nothing to do
    }
    return;
  }
  if (s.id.startsWith("local-")) {
    const { execSync } = await import("node:child_process");
    try {
      const root = repoRoot ?? "templates/next-supabase";
      execSync(`git -C ${root} worktree remove --force ../../.crew/worktrees/${s.id.replace(/^local-(copy-)?/, "")}`, { stdio: "pipe" });
    } catch {
      const { rmSync } = await import("node:fs");
      rmSync(s.workdir, { recursive: true, force: true });
    }
    return;
  }
  // Unknown sandbox kinds have nothing to tear down (Daytona is not implemented).
}
