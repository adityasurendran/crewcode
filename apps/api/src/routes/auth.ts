import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { createProjectKey } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const authRouter = Router();


authRouter.post("/keys", async (req, res) => {
  const parsed = z.object({ project_id: z.string().uuid(), created_by: z.string().email().or(z.string().min(1)) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, created_by } = parsed.data;
  await query(`insert into users (id, email) values ($1,$2) on conflict (id) do nothing`, [created_by, created_by.includes("@") ? created_by : `${created_by}@local`]);
  const { key, prefix } = await createProjectKey(project_id, created_by);
  await audit(project_id, created_by, "auth.key.created", { prefix });
  res.json({ key, prefix, note: "store now — never shown again" });
});

authRouter.get("/me", async (req, res) => {
  res.json({ actor: (req as any).actor ?? "anon" });
});
