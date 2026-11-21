import { Router } from "express";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";

export const artifactsRouter = Router();


artifactsRouter.get("/", async (req, res) => {
  const { task_id, org_id, kind, limit } = req.query as Record<string, string>;
  const n = Math.min(Number(limit) || 50, 200);
  if (org_id) {
    res.json(
      await queryWithOrg(
        `select a.* from artifacts a join tasks t on t.id=a.task_id join projects p on p.id=t.project_id
         where p.org_id=$1 ${kind ? "and a.kind=$3" : ""} order by a.created_at desc limit $2`,
        kind ? [org_id, n, kind] : [org_id, n],
        org_id
      )
    );
    return;
  }
  if (task_id) {
    res.json(await query<any>(`select * from artifacts where task_id=$1 order by created_at desc limit $2`, [task_id, n]));
    return;
  }
  res.json(await query<any>(`select * from artifacts order by created_at desc limit $1`, [n]));
});
