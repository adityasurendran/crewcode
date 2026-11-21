import { query } from "./db.js";
import { redactSecrets } from "./vault.js";

export async function audit(projectId: string | null, actor: string, action: string, meta: unknown = {}) {
  try {
    const clean = JSON.parse(redactSecrets(JSON.stringify(meta)).slice(0, 8000));
    await query(`insert into audit_log (project_id, actor, action, meta) values ($1,$2,$3,$4)`, [
      projectId,
      actor,
      action,
      JSON.stringify(clean),
    ]);
  } catch {
    
  }
}
