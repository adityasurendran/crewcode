import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const orgMembersRouter = Router({ mergeParams: true });

// GET /orgs/:id/members — list members with roles
orgMembersRouter.get("/", async (req, res) => {
  const orgId = String((req.params as any).id ?? "");
  res.json(await query<any>(`select u.email, m.role from memberships m join users u on u.id=m.user_id where m.org_id=$1`, [orgId]));
});

// POST /orgs/:id/members {email, role}
orgMembersRouter.post("/", async (req, res) => {
  const orgId = String((req.params as any).id ?? "");
  const parsed = z.object({ email: z.string().email(), role: z.enum(["owner", "member", "viewer"]).default("member") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { email, role } = parsed.data;
  await query(`insert into users (id, email) values ($1,$1) on conflict (id) do nothing`, [email]);
  await query(`insert into memberships (org_id, user_id, role) values ($1,$2,$3) on conflict do nothing`, [orgId, email, role]);
  await audit(orgId, email, "org.member.added", { role });
  res.json({ ok: true });
});

// DELETE /orgs/:id/members/:email
orgMembersRouter.delete("/:email", async (req, res) => {
  const orgId = String((req.params as any).id ?? "");
  const email = String((req.params as any).email ?? "");
  await query(`delete from memberships where org_id=$1 and user_id=$2`, [orgId, email]);
  await audit(orgId, email, "org.member.removed", {});
  res.json({ ok: true });
});
