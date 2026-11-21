// Deployment status polling — check Railway/Fly/Vercel for live deployment state.
// GET /deployments/:id/status — polls provider for a preview/prod deployment.
import { Router } from "express";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const deploymentStatusRouter = Router();

deploymentStatusRouter.get("/:id/status", async (req, res) => {
  const id = String((req.params as any).id ?? "");
  const arts = await query<any>(`select * from artifacts where id=$1`, [id]);
  if (!arts.length) return res.status(404).json({ error: "artifact not found" });
  const art = arts[0];
  const meta = typeof art.meta === "string" ? JSON.parse(art.meta) : art.meta ?? {};
  const provider = meta.provider ?? "stub";

  let status = "unknown";
  let detail: any = { provider };

  if (provider === "railway") {
    const deploymentId = meta.deployment_id;
    if (deploymentId) {
      try {
        const { railwayDeploymentStatus } = await import("../lib/railway-deploy.js");
        const s = await railwayDeploymentStatus(deploymentId);
        status = s.status;
        detail.deployment = s.detail;
      } catch (e: any) {
        status = "error";
        detail.error = String(e?.message ?? e).slice(0, 200);
      }
    } else {
      status = "live"; // stub assumes live
    }
  } else if (provider === "fly") {
    const machineId = meta.machine_id;
    const projRows = await query<any>(`select p.fly_app_id from tasks t join projects p on p.id=t.project_id where t.id=$1`, [art.task_id]).catch(() => []);
    const appId = meta.app_id ?? projRows[0]?.fly_app_id ?? "";
    if (machineId && appId) {
      try {
        const { flyMachineStatus } = await import("../lib/fly-deploy.js");
        const s = await flyMachineStatus(appId, machineId);
        status = s.status;
        detail.machine = s.detail;
      } catch (e: any) {
        status = "error";
        detail.error = String(e?.message ?? e).slice(0, 200);
      }
    } else {
      status = "live";
    }
  } else if (provider === "vercel") {
    const deploymentId = meta.deployment_id;
    const projRows = await query<any>(`select p.vercel_team_id from tasks t join projects p on p.id=t.project_id where t.id=$1`, [art.task_id]).catch(() => []);
    const teamId = projRows[0]?.vercel_team_id ?? "";
    if (deploymentId) {
      try {
        const { vercelDeploymentStatus } = await import("../lib/vercel-deploy.js");
        const s = await vercelDeploymentStatus(deploymentId, teamId);
        status = s.status;
        detail.deployment = s.detail;
      } catch (e: any) {
        status = "error";
        detail.error = String(e?.message ?? e).slice(0, 200);
      }
    } else {
      status = "queued"; // hook fired, id not captured
    }
  } else {
    status = "live"; // stub / local-docker assumed live
  }

  await query(`insert into events (task_id, type, payload) values ($1,'deploy_status',$2)`, [
    art.task_id,
    JSON.stringify({ artifact_id: id, provider, status }),
  ]).catch(() => {});

  res.json({ artifact_id: id, provider, status, url: art.uri, detail });
});
