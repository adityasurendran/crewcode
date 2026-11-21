import { query } from "./db.js";

// Token/cost budgets — hard kill-switch per task, per project.
// Phase 0: Postgres counters. Phase 1: Redis sliding window + Stripe meters.
export async function checkBudget(taskId: string): Promise<{ ok: boolean; used: number; budget: number }> {
  const rows = await query(`select tokens_used, budget_tokens from tasks where id=$1`, [taskId]);
  if (!rows.length) throw new Error("task not found");
  const { tokens_used, budget_tokens } = rows[0];
  return { ok: tokens_used < budget_tokens, used: tokens_used, budget: budget_tokens };
}

export async function addUsage(taskId: string, tokens: number) {
  await query(`update tasks set tokens_used = tokens_used + $2 where id=$1`, [taskId, tokens]);
  const c = await checkBudget(taskId);
  if (!c.ok) {
    await query(`update tasks set status='blocked' where id=$1`, [taskId]);
    await query(`insert into events (task_id, type, payload) values ($1,'error',$2)`, [
      taskId,
      JSON.stringify({ message: `token budget exceeded ${c.used}/${c.budget}` }),
    ]);
    throw new Error(`budget exceeded for task ${taskId}`);
  }
}
