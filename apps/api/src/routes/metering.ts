


import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { raw } from "express";
import { verifyStripeSignature } from "./stripe-webhook.js";

export const meteringRouter = Router();


const Usage = z.object({
  project_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
  tokens: z.number().int().positive(),
  model: z.string().default("default"),
  cost_usd: z.number().nonnegative().optional(),
});

meteringRouter.post("/", async (req, res) => {
  const parsed = Usage.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, task_id, tokens, model, cost_usd } = parsed.data;
  const cost = cost_usd ?? (tokens / 1000) * 0.002;

  
  const rows = await query<any>(`select * from projects where id=$1`, [project_id]);
  if (!rows.length) return res.status(404).json({ error: "project not found" });
  const proj = rows[0];
  const remaining = Number(proj.credits_usd ?? 0) - cost;
  await query(`update projects set credits_usd=$2 where id=$1`, [project_id, Math.max(remaining, 0)]);

  if (task_id) {
    await query(`insert into events (task_id, type, payload) values ($1,'usage',$2)`, [
      task_id,
      JSON.stringify({ tokens, model, cost_usd: cost }),
    ]);
  }
  await audit(project_id, "system", "billing.usage", { tokens, model, cost_usd: cost, remaining_credits: Math.max(remaining, 0) });

  res.json({ ok: true, cost_usd: cost, remaining_credits: Math.max(remaining, 0) });
});


meteringRouter.post("/ingest", raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = (req.headers["stripe-signature"] as string) ?? "";
  const payload = req.body as Buffer;
  if (secret) {
    if (!sig || !verifyStripeSignature(payload, sig, secret)) return res.status(400).json({ error: "invalid signature" });
  }
  let event: any;
  try {
    event = JSON.parse(payload.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "bad json" });
  }

  
  
  const customerId = event?.payload?.customer ?? event?.data?.object?.customer;
  if (customerId) {
    const projs = await query<any>(`select id from projects where stripe_customer_id=$1`, [customerId]);
    if (projs[0]) {
      const value = Number(event?.payload?.value ?? event?.data?.object?.value ?? 0);
      await audit(projs[0].id, "stripe", "billing.metering.ingest", { event: event?.type, value, customer: customerId });
    }
  }
  res.json({ received: true });
});
