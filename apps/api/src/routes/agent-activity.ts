import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";

export const agentActivityRouter = Router();



agentActivityRouter.get("/", async (req, res) => {
  const { project_id, org_id, owner_id, limit } = req.query as Record<string, string>;
  const n = Math.min(Number(limit) || 50, 200);

  let rows: any[];
  if (org_id) {
    rows = await queryWithOrg<any>(
      `select t.id, t.owner_id, t.objective, t.status, t.priority, t.tokens_used, t.budget_tokens, t.branch,
              p.name as project_name,
              (select e.type || ': ' || coalesce(e.payload->>'message', e.payload->>'objective', '')
                 from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event,
              (select e.created_at from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event_at
       from tasks t join projects p on p.id=t.project_id
       where p.org_id=$1 ${owner_id ? "and t.owner_id=$3" : ""}
       order by t.status='running' desc, t.priority asc, t.created_at desc limit $2`,
      org_id ? (owner_id ? [org_id, n, owner_id] : [org_id, n]) : [n],
      org_id
    );
  } else if (project_id) {
    rows = await query<any>(
      `select t.id, t.owner_id, t.objective, t.status, t.priority, t.tokens_used, t.budget_tokens, t.branch,
              (select e.type || ': ' || coalesce(e.payload->>'message', e.payload->>'objective', '')
                 from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event,
              (select e.created_at from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event_at
       from tasks t
       where t.project_id=$1 ${owner_id ? "and t.owner_id=$3" : ""}
       order by t.status='running' desc, t.priority asc, t.created_at desc limit $2`,
      owner_id ? [project_id, n, owner_id] : [project_id, n]
    );
  } else {
    rows = await query<any>(
      `select t.id, t.owner_id, t.objective, t.status, t.priority, t.tokens_used, t.budget_tokens, t.branch,
              (select e.type || ': ' || coalesce(e.payload->>'message', e.payload->>'objective', '')
                 from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event,
              (select e.created_at from events e where e.task_id=t.id order by e.created_at desc limit 1) as last_event_at
       from tasks t
       order by t.status='running' desc, t.priority asc, t.created_at desc limit $1`,
      [n]
    );
  }

  res.json({ agents: rows });
});
