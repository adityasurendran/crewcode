

import { isAbsolute, resolve, sep } from "node:path";
export type Sandbox = { id: string; workdir: string; branch: string };




function absRepo(p: string): string {
  if (isAbsolute(p)) return p;
  const local = p === ".crew" || p.startsWith(".crew/") || p.startsWith(`.crew${sep}`);
  return resolve(local ? process.cwd() : (process.env.CREW_ASSETS ?? process.cwd()), p);
}




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
    
    return { id: `e2b-${sbx.sandboxId ?? sbx.id ?? taskId}`, workdir: "e2b:/home/user/repo", branch };
  }
  if (p === "daytona") {
    throw new Error(
      "Daytona needs an account + DAYTONA_API_KEY (https://www.daytona.io). Set SANDBOX_PROVIDER=e2b or local-worktree instead."
    );
  }

  
  const root = await resolveRepoRoot(projectId, repoRoot);
  const { execSync } = await import("node:child_process");
  const { existsSync, mkdirSync, cpSync } = await import("node:fs");
  const workdir = `.crew/worktrees/${taskId}`;
  try {
    
    execSync(`git -C ${root} rev-parse --git-dir`, { stdio: "pipe" });
  } catch {
    execSync(`git -C ${root} init -b main`, { stdio: "pipe" });
    execSync(`git -C ${root} add -A`, { stdio: "pipe" });
    execSync(`git -C ${root} -c user.email=crew@local -c user.name=crew commit -m "init" --allow-empty`, { stdio: "pipe" });
  }
  try {
    
    const { installScopedPushHook } = await import("./git-hooks.js");
    installScopedPushHook(root);
    execSync(`git -C ${root} worktree add ../../.crew/worktrees/${taskId} -b ${branch}`, { stdio: "pipe" });
    return { id: `local-${taskId}`, workdir, branch };
  } catch {
    
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
  
}
