// Preview deploys — 1 URL per task + 1 prod slot per project.
// Phase 0: local Docker (if available) else stub URL + static artifact.
// Phase 1: Railway/Fly/Cloudflare Containers via provider tokens in Vault.
// Approve gate: only `main` green + explicit approve promotes to prod.
import { query } from "./db.js";
import { audit } from "./audit.js";

export type PreviewProvider = "local-docker" | "railway" | "fly" | "vercel" | "stub" | "e2b";
const KNOWN_PROVIDERS: PreviewProvider[] = ["local-docker", "railway", "fly", "vercel", "stub", "e2b"];
export function provider(): PreviewProvider {
  const p = (process.env.PREVIEW_PROVIDER ?? "stub").trim();
  if (!(KNOWN_PROVIDERS as string[]).includes(p)) {
    console.warn(`[preview] unknown PREVIEW_PROVIDER "${p.slice(0, 40)}" — using stub`);
    return "stub";
  }
  return p as PreviewProvider;
}

export function previewUrlFor(taskId: string): string {
  const base = process.env.PREVIEW_BASE_URL ?? "http://localhost:3200";
  return `${base}/p/${taskId.slice(0, 8)}`;
}

export async function deployPreview(taskId: string, workdir: string): Promise<{ url: string; provider: PreviewProvider }> {
  const p = provider();
  const tasks = await query(`select * from tasks where id=$1`, [taskId]);
  const task = tasks[0];
  if (!task) throw new Error("task not found");

  if (p === "railway") {
    const { railwayDeployTask } = await import("./railway-deploy.js");
    const r = await railwayDeployTask(taskId, workdir);
    return { url: r.url, provider: "railway" };
  }
  if (p === "e2b") {
    const { e2bCreateAndClone } = await import("./e2b-deploy.js");
    const tasks = await query<any>(`select * from tasks where id=$1`, [taskId]);
    const t = tasks[0];
    const r = await e2bCreateAndClone(t.project_id, taskId, t.branch);
    return { url: `e2b://${r.sandboxId}${r.workdir}`, provider: "e2b" };
  }
  if (p === "fly") {
    const { flyDeployTask } = await import("./fly-deploy.js");
    const r = await flyDeployTask(taskId, workdir);
    return { url: r.url, provider: "fly" };
  }
  if (p === "vercel") {
    const { vercelDeployTask } = await import("./vercel-deploy.js");
    const r = await vercelDeployTask(taskId, workdir);
    return { url: r.url, provider: "vercel" };
  }
  if (p === "local-docker") {
    const { execSync } = await import("node:child_process");
    try {
      execSync(`docker build -t crew-preview-${taskId.slice(0, 8)} ${workdir}`, { stdio: "pipe", timeout: 300_000 });
    } catch (e: any) {
      throw new Error(`docker build failed: ${String(e?.message ?? e).slice(0, 1000)}`);
    }
  }
  const url = previewUrlFor(taskId);
  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'preview',$2,$3)`, [
    taskId,
    url,
    JSON.stringify({ provider: p }),
  ]);
  await query(`insert into events (task_id, type, payload) values ($1,'preview',$2)`, [
    taskId,
    JSON.stringify({ url }),
  ]);
  await audit(task.project_id, "system", "preview.deployed", { task_id: taskId, url, provider: p });
  return { url, provider: p };
}

export async function promoteToProd(projectId: string, taskId: string, approvedBy: string) {
  // Human approve gate — required for prod. No auto-prod from agents.
  // Records the promotion as an artifact so the deploy history is complete;
  // the live prod deploy itself is provider-specific (Railway/Fly).
  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'prod_promotion','main',$2)`, [
    taskId,
    JSON.stringify({ project_id: projectId, approved_by: approvedBy }),
  ]);
  await audit(projectId, approvedBy, "prod.promoted", { task_id: taskId });
  await query(`insert into events (task_id, type, payload) values ($1,'promoted',$2)`, [
    taskId,
    JSON.stringify({ by: approvedBy }),
  ]);
  return { ok: true };
}
