// Vercel preview deploys — trigger via Deploy Hook, resolve URL via API.
// Needs VERCEL_TOKEN (env); project settings: vercel_project_id,
// vercel_team_id (optional), vercel_deploy_hook_url.
// Hook: Vercel → Project → Settings → Git → Deploy Hooks. The hook builds the
// connected git repo, so this fits GitHub-imported projects; local-only repos
// get a clear error telling exactly what to set.
import { query } from "./db.js";
import { audit } from "./audit.js";

const VERCEL_API = "https://api.vercel.com";

export function vercelHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export function vercelProjectUrl(projectName: string): string {
  return `https://${projectName}.vercel.app`;
}

export function vercelTeamQuery(teamId: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function api(token: string, path: string): Promise<any> {
  const res = await fetch(`${VERCEL_API}${path}`, { headers: vercelHeaders(token) });
  if (!res.ok) throw new Error(`vercel ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

export async function vercelDeployTask(taskId: string, _workdir: string): Promise<{ url: string; deploymentId?: string; status: string }> {
  const task = (await query<any>(`select * from tasks where id=$1`, [taskId]))[0];
  if (!task) throw new Error("task not found");
  const proj = (await query<any>(`select * from projects where id=$1`, [task.project_id]))[0];
  const token = process.env.VERCEL_TOKEN ?? "";
  if (!token) throw new Error("VERCEL_TOKEN missing");
  const projectId = proj?.vercel_project_id ?? "";
  const teamId = proj?.vercel_team_id ?? "";
  const hook = proj?.vercel_deploy_hook_url ?? "";
  if (!projectId) throw new Error("project missing vercel_project_id — set in Project settings");
  if (!hook) {
    throw new Error(
      "project missing vercel_deploy_hook_url — Vercel → Project → Settings → Git → Deploy Hooks, then paste it in Project settings"
    );
  }

  const trig = await fetch(hook, { method: "POST" });
  if (!trig.ok) throw new Error(`vercel hook ${trig.status}: ${(await trig.text()).slice(0, 300)}`);
  const trigJson: any = await trig.json().catch(() => null);
  const deploymentId = trigJson?.job?.id ?? undefined;

  const tq = vercelTeamQuery(teamId);
  const p: any = await api(token, `/v9/projects/${encodeURIComponent(projectId)}${tq}`).catch(() => null);
  const alias = p?.alias?.[0]?.domain ?? p?.targets?.production?.alias?.[0] ?? "";
  const url = alias ? `https://${alias}` : vercelProjectUrl(p?.name ?? projectId);

  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'preview',$2,$3)`, [
    taskId,
    url,
    JSON.stringify({ provider: "vercel", deployment_id: deploymentId, branch: task.branch, status: "queued" }),
  ]);
  await audit(task.project_id, "system", "preview.vercel.deployed", { task_id: taskId, url, deployment_id: deploymentId });
  return { url, deploymentId, status: "queued" };
}

export async function vercelDeploymentStatus(
  deploymentId: string,
  teamId = ""
): Promise<{ status: string; detail: any }> {
  const token = process.env.VERCEL_TOKEN ?? "";
  if (!token) return { status: "unknown", detail: { error: "no token" } };
  try {
    const d: any = await api(token, `/v13/deployments/${encodeURIComponent(deploymentId)}${vercelTeamQuery(teamId)}`);
    return { status: d?.state ?? d?.status ?? "unknown", detail: d ?? null };
  } catch (e: any) {
    return { status: "error", detail: { error: String(e?.message ?? e).slice(0, 200) } };
  }
}
