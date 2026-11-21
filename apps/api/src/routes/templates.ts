import { Router } from "express";
import { query } from "../lib/db.js";

export const templatesRouter = Router();




templatesRouter.get("/list", async (_req, res) => {
  res.json(await query<any>(`select slug, name, repo_url, description from templates where active=true order by name`));
});


templatesRouter.get("/:slug", async (req, res) => {
  const rows = await query<any>(`select * from templates where slug=$1`, [String((req.params as any).slug ?? "")]);
  if (!rows.length) return res.status(404).json({ error: "template not found" });
  res.json(rows[0]);
});
