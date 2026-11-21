// Billing — token meters -> USD. Rates per 1K tokens (tune per model).
// Phase 0: Postgres counters + computed cost. Phase 1: Stripe meters + budgets UI.
import { query } from "./db.js";

export const RATES: Record<string, number> = {
  default: 0.002, // $2 / 1M blended — the metered rate until gateway pricing lands
  "opencode-go/deepseek-v4.1-flash": 0.002,
  "opencode-go/mimo-v2.5": 0.002,
  "opencode-go/mimo-v2.6-pro": 0.002,
  "opencode-go/mimo-v2.6-flash": 0.002,
  "opencode-go/kimi-k3": 0.002,
};

export function costFor(tokens: number, model = "default"): number {
  return (tokens / 1000) * (RATES[model] ?? RATES.default);
}

export async function projectBilling(projectId: string) {
  const tasks = await query(
    `select id, owner_id, status, tokens_used, budget_tokens from tasks where project_id=$1`,
    [projectId]
  );
  const byOwner: Record<string, { tokens: number; cost: number; tasks: number }> = {};
  let totalTokens = 0;
  for (const t of tasks) {
    totalTokens += t.tokens_used;
    const o = (byOwner[t.owner_id] ??= { tokens: 0, cost: 0, tasks: 0 });
    o.tokens += t.tokens_used;
    o.tasks += 1;
  }
  for (const o of Object.values(byOwner)) o.cost = costFor(o.tokens);
  return {
    project_id: projectId,
    tasks: tasks.length,
    total_tokens: totalTokens,
    total_cost_usd: costFor(totalTokens),
    by_owner: byOwner,
    rows: tasks.map((t: any) => ({ ...t, cost_usd: costFor(t.tokens_used) })),
  };
}
