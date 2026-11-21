import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const notifySettingsRouter = Router();


notifySettingsRouter.get("/", async (req, res) => {
  const { org_id } = req.query as { org_id?: string };
  if (!org_id) return res.status(400).json({ error: "org_id required" });
  const rows = await query<any>(`select * from org_notify_settings where org_id=$1`, [org_id]).catch(() => []);
  res.json(rows[0] ?? { org_id, slack_webhook_url: "", email_on_blocked: true, email_on_merged: true });
});


notifySettingsRouter.post("/", async (req, res) => {
  const parsed = z.object({
    org_id: z.string().uuid(),
    slack_webhook_url: z.string().url().or(z.literal("")).default(""),
    email_on_blocked: z.boolean().default(true),
    email_on_merged: z.boolean().default(true),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { org_id, slack_webhook_url, email_on_blocked, email_on_merged } = parsed.data;
  await query(
    `insert into org_notify_settings (org_id, slack_webhook_url, email_on_blocked, email_on_merged)
     values ($1,$2,$3,$4)
     on conflict (org_id) do update set slack_webhook_url=$2, email_on_blocked=$3, email_on_merged=$4`,
    [org_id, slack_webhook_url, email_on_blocked, email_on_merged]
  ).catch(() => {
    
  });
  await audit(org_id, "user", "notify.settings.updated", { slack: !!slack_webhook_url, blocked: email_on_blocked, merged: email_on_merged });
  res.json({ ok: true });
});
