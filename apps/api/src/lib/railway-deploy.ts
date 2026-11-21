

import { query } from "./db.js";
import { audit } from "./audit.js";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

async function gql(token: string, q: string, vars: Record<string, any> = {}) {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  if (!res.ok) throw new Error(`railway ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  if (j.errors?.length) throw new Error(`railway: ${JSON.stringify(j.errors).slice(0, 400)}`);
  return j.data;
}

export async function railwayDeployTask(taskId: string, workdir: string): Promise<{ url: string; deploymentId?: string; status: string }> {
  const task = (await query<any>(`select * from tasks where id=$1`, [taskId]))[0];
  if (!task) throw new Error("task not found");
  const proj = (await query<any>(`select * from projects where id=$1`, [task.project_id]))[0];
  const token = process.env.RAILWAY_TOKEN ?? "";
  if (!token) throw new Error("RAILWAY_TOKEN missing");

  const serviceId = proj?.railway_service_id ?? "";
  const envId = proj?.railway_env_id ?? "";
  if (!serviceId) throw new Error("project missing railway_service_id — set in Project settings");

  const branch = task.branch;
  const data = await gql(
    token,
    `mutation($envId:String!,$serviceId:String!,$branch:String!){
      deploy(input:{ environmentId:$envId, serviceId:$serviceId, source:{ branch:$branch } }) { id status }
    }`,
    { envId: envId || "prod", serviceId, branch }
  );
  const deployment = data?.deploy;
  const url = `https://${serviceId}.up.railway.app`;
  await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'preview',$2,$3)`, [
    taskId,
    url,
    JSON.stringify({ provider: "railway", deployment_id: deployment?.id, branch, status: deployment?.status }),
  ]);
  await audit(task.project_id, "system", "preview.railway.deployed", { task_id: taskId, url, deployment_id: deployment?.id });
  return { url, deploymentId: deployment?.id, status: deployment?.status ?? "queued" };
}

export async function railwayDeploymentStatus(deploymentId: string): Promise<{ status: string; detail: any }> {
  const token = process.env.RAILWAY_TOKEN ?? "";
  if (!token) return { status: "unknown", detail: { error: "no token" } };
  try {
    const data = await gql(token, `query($id:ID!){ deployment(id:$id){ id status } }`, { id: deploymentId });
    return { status: data?.deployment?.status ?? "unknown", detail: data?.deployment ?? null };
  } catch (e: any) {
    return { status: "error", detail: { error: String(e?.message ?? e).slice(0, 200) } };
  }
}
