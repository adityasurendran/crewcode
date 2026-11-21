// Fly.io deploy improvements — create/trigger machines with proper env vars.
// Uses FLY_API_TOKEN; app IDs come from project settings (fly_app_id).
import { query } from "./db.js";
import { audit } from "./audit.js";

const FLY_API = "https://api.machines.dev/v1";

async function flyGraphQL(token: string, q: string, vars: Record<string, any> = {}) {
  const res = await fetch(`${FLY_API}/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  if (!res.ok) throw new Error(`fly ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  if (j.errors?.length) throw new Error(`fly: ${JSON.stringify(j.errors).slice(0, 400)}`);
  return j.data;
}

export async function flyDeployTask(taskId: string, workdir: string): Promise<{ url: string; machineId?: string; status: string }> {
  const task = (await query<any>(`select * from tasks where id=$1`, [taskId]))[0];
  if (!task) throw new Error("task not found");
  const proj = (await query<any>(`select * from projects where id=$1`, [task.project_id]))[0];
  const token = process.env.FLY_API_TOKEN ?? "";
  if (!token) throw new Error("FLY_API_TOKEN missing");

  const appId = proj?.fly_app_id ?? "";
  if (!appId) throw new Error("project missing fly_app_id — set in Project settings");

  const branch = task.branch;
  const data = await flyGraphQL(
    token,
    `mutation($appId:String!,$branch:String!){
      createMachine(input:{ appId:$appId, region:"ord", config:{ image:"flyio/hellofly", env:{ CREW_TASK_BRANCH:$branch } } }) { id }
    }`,
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
  return { url, machineId: machine?.id, status: "created" };
}

export async function flyMachineStatus(appId: string, machineId: string): Promise<{ status: string; detail: any }> {
  const token = process.env.FLY_API_TOKEN ?? "";
  if (!token) return { status: "unknown", detail: { error: "no token" } };
  try {
    const res = await fetch(`${FLY_API}/apps/${appId}/machines/${machineId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { status: "error", detail: { error: `fly ${res.status}` } };
    const j: any = await res.json();
    return { status: j?.state ?? "unknown", detail: j ?? null };
  } catch (e: any) {
    return { status: "error", detail: { error: String(e?.message ?? e).slice(0, 200) } };
  }
}
