


import { query } from "./db.js";
import { audit } from "./audit.js";

const FLY_API = "https://api.machines.dev/v1/apps";

async function flyGraphQL(token: string, queryStr: string, variables: Record<string, any> = {}) {
  const res = await fetch(`${FLY_API}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: queryStr, variables }),
  });
  if (!res.ok) throw new Error(`fly ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  if (j.errors?.length) throw new Error(`fly graphql: ${JSON.stringify(j.errors).slice(0, 400)}`);
  return j.data;
}

export async function flyDeployPreview(taskId: string, workdir: string): Promise<{ url: string; appId: string }> {
  const tasks = await query<any>(`select * from tasks where id=$1`, [taskId]);
  if (!tasks.length) throw new Error("task not found");
  const task = tasks[0];
  const proj = (await query<any>(`select * from projects where id=$1`, [task.project_id]))[0];

  const token = process.env.FLY_API_TOKEN ?? "";
  if (!token) throw new Error("FLY_API_TOKEN missing — set env://FLY_API_TOKEN or connect fly in /connections");

  const branch = task.branch;
  const appId = proj?.fly_app_id ?? "";
  if (!appId) throw new Error("project missing fly_app_id — set via /projects or /connections (provider=fly)");

  try {
    const data = await flyGraphQL(
      token,
      `mutation($appId:String!,$branch:String!){ createMachine(input:{ appId:$appId, region:"ord", config:{ image:"flyio/hellofly", env:{ CREW_TASK_BRANCH:$branch } } }) { id } }`,
      { appId, branch }
    );
    const machine = data?.createMachine;
    const url = `https://${appId}.fly.dev`;
    await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'preview',$2,$3)`, [
      taskId,
      url,
      JSON.stringify({ provider: "fly", machine_id: machine?.id, branch }),
    ]);
    await audit(task.project_id, "system", "preview.fly.deployed", { task_id: taskId, url, machine_id: machine?.id });
    return { url, appId };
  } catch (e: any) {
    throw new Error(`fly deploy failed: ${String(e?.message ?? e).slice(0, 500)}`);
  }
}

export async function flyPromote(projectId: string, taskId: string, approvedBy: string) {
  await audit(projectId, approvedBy, "prod.fly.promoted", { task_id: taskId, note: "wire main branch deploy in Phase 1" });
  return { ok: true, note: "promote to prod: set Fly app source branch=main" };
}
