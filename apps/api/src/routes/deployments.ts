import { Router } from "express";
import { query } from "../lib/db.js";

export const deploymentsRouter = Router();

// GET /deployments?project_id= — recent preview/prod deployment status
deploymentsRouter.get("/", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  const n = 30;
  if (project_id) {
    res.json(
      await query<any>(
        `select a.kind, a.uri, a.meta, a.created_at, t.objective, t.status as task_status
         from artifacts a join tasks t on t.id=a.task_id
         where t.project_id=$1 and a.kind in ('preview','pr','integration_report')
         order by a.created_at desc limit $2`,
        [project_id, n]
      )
    );
    return;
  }
  res.json(
    await query<any>(
      `select a.kind, a.uri, a.meta, a.created_at from artifacts a where a.kind in ('preview','pr') order by a.created_at desc limit $1`,
      [n]
    )
  );
});
