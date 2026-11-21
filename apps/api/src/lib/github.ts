


import { resolveSecret } from "./vault.js";
import { audit } from "./audit.js";

export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  
  const m =
    repoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/) ||
    repoUrl.match(/^\s*([^/]+)\/([^/]+)\s*$/);
  if (!m) throw new Error(`unparseable repo: ${repoUrl}`);
  return { owner: m[1], repo: m[2] };
}

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`github ${path} -> ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

export async function getGithubToken(projectId?: string): Promise<string> {
  
  if (projectId) {
    try {
      const { query } = await import("./db.js");
      const rows = await query(`select vault_ref from api_connections where project_id=$1 and provider='github'`, [projectId]);
      if (rows[0]?.vault_ref) return await resolveSecret(rows[0].vault_ref);
    } catch {}
  }
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return await resolveSecret("env://GITHUB_TOKEN");
  } catch {
    throw new Error("GITHUB_TOKEN missing — connect GitHub in project settings (vault)");
  }
}


export async function cloneForSandbox(repoUrl: string, destDir: string, branch = "main"): Promise<string> {
  const { execSync } = await import("node:child_process");
  const token = await getGithubToken().catch(() => null);
  const authed = token ? repoUrl.replace("https://", `https://x-access-token:${token}@`) : repoUrl;
  execSync(`git clone --depth 50 -b ${branch} ${authed} ${destDir}`, { stdio: "pipe" });
  return destDir;
}

export async function createPR(opts: {
  projectId: string;
  repoUrl: string;
  head: string;
  base?: string;
  title: string;
  body?: string;
}) {
  const token = await getGithubToken(opts.projectId);
  const { owner, repo } = parseRepoUrl(opts.repoUrl);
  const pr: any = await gh(`/repos/${owner}/${repo}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({ head: opts.head, base: opts.base ?? "main", title: opts.title, body: opts.body ?? "", draft: true }),
  });
  await audit(opts.projectId, "system", "github.pr.opened", { head: opts.head, pr: pr.number, url: pr.html_url });
  return { number: pr.number, url: pr.html_url };
}

export async function getPRChecks(repoUrl: string, prNumber: number) {
  const token = await getGithubToken();
  const { owner, repo } = parseRepoUrl(repoUrl);
  const pr: any = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
  const checks: any = await gh(`/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`, token).catch(() => ({ check_runs: [] }));
  return { state: pr.mergeable_state, merged: pr.merged, checks: checks.check_runs?.map((c: any) => ({ name: c.name, status: c.status, conclusion: c.conclusion })) ?? [] };
}
