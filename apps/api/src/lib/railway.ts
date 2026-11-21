


import { query } from "./db.js";
import { audit } from "./audit.js";
import { resolveSecret } from "./vault.js";

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

async function railwayGraphQL(token: string, queryStr: string, variables: Record<string, any> = {}) {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: queryStr, variables }),
  });
  if (!res.ok) throw new Error(`railway ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  if (j.errors?.length) throw new Error(`railway graphql: ${JSON.stringify(j.errors).slice(0, 400)}`);
  return j.data;
}

export async function railwayDeployPreview(taskId: string, workdir: string): Promise<{ url: string; projectId: string }> {
  const tasks = await query<any>(`select * from tasks where id=$1`, [taskId]);
  if (!tasks.length) throw new Error("task not found");
  const task = tasks[0];
  const proj = (await query<any>(`select * from projects where id=$1`, [task.project_id]))[0];

  
  let token = process.env.RAILWAY_TOKEN ?? "";
  if (!token && proj?.railway_service_id) {
    
  }
  if (!token) throw new Error("RAILWAY_TOKEN missing — set env://RAILWAY_TOKEN or connect railway in /connections");

  
  
  
  
  
  
  const branch = task.branch;
  const serviceId = proj?.railway_service_id ?? "";
  if (!serviceId) {
    throw new Error("project missing railway_service_id — set via /projects or /connections (provider=railway)");
  }

  try {
    const data = await railwayGraphQL(
      token,
      `mutation($env:String!,$serviceId:ID!,$branch:String!){ deploy(input:{ environmentId:$env, serviceId:$serviceId, source:{ branch:$branch } }) { id status } }`,
      { env: proj?.railway_env_id ?? "prod", serviceId, branch }
    );
    const deployment = data?.deploy;
    const url = `https://${serviceId}.up.railway.app`;
    await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'preview',$2,$3)`, [
      taskId,
      url,
      JSON.stringify({ provider: "railway", deployment_id: deployment?.id, branch }),
    ]);
    await audit(task.project_id, "system", "preview.railway.deployed", { task_id: taskId, url, deployment_id: deployment?.id });
    return { url, projectId: serviceId };
  } catch (e: any) {
    throw new Error(`railway deploy failed: ${String(e?.message ?? e).slice(0, 500)}`);
  }
}

export async function railwayPromote(projectId: string, taskId: string, approvedBy: string) {
  
  await audit(projectId, approvedBy, "prod.railway.promoted", { task_id: taskId, note: "wire main branch deploy in Phase 1" });
  return { ok: true, note: "promote to prod: set Railway service source branch=main" };
}
