

import { query } from "./db.js";
import { audit } from "./audit.js";
import { pullFromSandbox } from "./e2b-pull.js";

export type E2BDeployResult = { sandboxId: string; workdir: string; branch: string };

export async function e2bCreateAndClone(projectId: string, taskId: string, branch: string, repoUrl?: string): Promise<E2BDeployResult> {
  const key = process.env.E2B_API_KEY;
  if (!key) throw new Error("E2B_API_KEY missing — set it for SANDBOX_PROVIDER=e2b");

  let E2B: any;
  try {
    E2B = await import("@e2b/code-interpreter");
  } catch {
    throw new Error("e2b dep missing — npm install @e2b/code-interpreter -w crewcode-api");
  }
  const Sbx = E2B.Sandbox ?? E2B.default?.Sandbox;
  const sbx = await Sbx.create({ apiKey: key, timeoutMs: 600_000 });
  const sandboxId = sbx.sandboxId ?? sbx.id ?? taskId;
  const workdir = "/home/user/repo";

  const proj = (await query<any>(`select repo_url from projects where id=$1`, [projectId]))[0];
  const url = repoUrl ?? proj?.repo_url ?? "";
  if (url) {
    
    let authed = url;
    const token = process.env.GITHUB_TOKEN;
    if (token && url.includes("github.com")) authed = url.replace("https://", `https://x-access-token:${token}@`);
    await sbx.commands.run(`git clone --depth 50 ${authed} ${workdir}`);
    await sbx.commands.run(`git -C ${workdir} checkout -b ${branch}`);
  } else {
    await sbx.commands.run(`mkdir -p ${workdir} && cd ${workdir} && git init -b ${branch}`);
  }

  await query(`update tasks set sandbox_id=$2 where id=$1`, [taskId, `e2b-${sandboxId}`]);
  await audit(projectId, "system", "sandbox.e2b.created", { task_id: taskId, sandbox_id: sandboxId, branch });
  return { sandboxId, workdir, branch };
}

export async function e2bRunAgent(sandboxId: string, workdir: string, objective: string): Promise<{ ok: boolean; note: string }> {
  let E2B: any;
  try {
    E2B = await import("@e2b/code-interpreter");
  } catch {
    throw new Error("e2b dep missing");
  }
  const Sbx = E2B.Sandbox ?? E2B.default?.Sandbox;
  const sbx = await Sbx.connect(sandboxId);
  
  const out = await sbx.commands.run(
    `cd ${workdir} && (command -v opencode >/dev/null && opencode run "${objective.replace(/"/g, "'").replace(/[\r\n\t]+/g, " ").slice(0, 4000)}" || echo "opencode not installed in sandbox")`,
    { timeoutMs: 600_000 }
  );
  return { ok: out.exitCode === 0, note: out.stdout?.slice(0, 2000) ?? "" };
}

export async function e2bSyncBack(sandboxId: string, taskId: string, workdir = "/home/user/repo"): Promise<string[]> {
  return pullFromSandbox(sandboxId, taskId, workdir);
}
