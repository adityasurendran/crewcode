import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const orgsRouter = Router();

orgsRouter.get("/", async (_req, res) => {
  res.json(await query(`select * from orgs order by created_at desc limit 50`));
});

orgsRouter.post("/", async (req, res) => {
  const parsed = z.object({ name: z.string().min(2), owner_email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { name, owner_email } = parsed.data;
  const orgs = await query(`insert into orgs (name) values ($1) returning *`, [name]);
  const org = orgs[0];
  await query(`insert into users (id, email) values ($1,$1) on conflict (id) do nothing`, [owner_email]);
  await query(`insert into memberships (org_id, user_id, role) values ($1,$2,'owner') on conflict do nothing`, [org.id, owner_email]);
  await audit(org.id, owner_email, "org.created", { name });
  res.json({ ...org, owner: owner_email });
});

orgsRouter.get("/:id/members", async (req, res) => {
  res.json(await query(`select u.email, m.role from memberships m join users u on u.id=m.user_id where m.org_id=$1`, [req.params.id]));
});

orgsRouter.post("/:id/members", async (req, res) => {
  const { email, role = "member" } = req.body ?? {};
  if (!email || !["owner", "member", "viewer"].includes(role)) return res.status(400).json({ error: "email + valid role required" });
  await query(`insert into users (id, email) values ($1,$1) on conflict (id) do nothing`, [email]);
  await query(`insert into memberships (org_id, user_id, role) values ($1,$2,$3) on conflict do nothing`, [req.params.id, email, role]);
  await audit(req.params.id, email, "org.member.added", { role });
  res.json({ ok: true });
});

orgsRouter.delete("/:id/members/:email", async (req, res) => {
  await query(`delete from memberships where org_id=$1 and user_id=$2`, [req.params.id, req.params.email]);
  await audit(req.params.id, req.params.email, "org.member.removed", {});
  res.json({ ok: true });
});
