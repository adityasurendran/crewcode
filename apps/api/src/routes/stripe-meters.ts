


import { Router } from "express";
import { z } from "zod";
import { resolveSecret } from "../lib/vault.js";
import { audit } from "../lib/audit.js";
import { raw } from "express";
import { verifyStripeSignature } from "./stripe-webhook.js";

export const stripeMetersRouter = Router();

const MeterEvent = z.object({
  event_key: z.string().min(1).max(64),
  stripe_customer_id: z.string().min(1),
  value: z.number().nonnegative(),
  payload: z.record(z.any()).optional(),
});


stripeMetersRouter.post("/events", async (req, res) => {
  const parsed = MeterEvent.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { event_key, stripe_customer_id, value, payload } = parsed.data;

  
  let key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    try {
      key = await resolveSecret("env://STRIPE_SECRET_KEY");
    } catch {
      return res.status(400).json({ error: "STRIPE_SECRET_KEY not configured" });
    }
  }

  const res2 = await fetch("https://api.stripe.com/v1/billing/meter_events", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      event_name: event_key,
      payload: JSON.stringify({ stripe_customer_id, value, ...(payload ?? {}) }),
      value: String(value),
      timestamp: String(Math.floor(Date.now() / 1000)),
    }),
  });
  if (!res2.ok) return res.status(502).json({ error: `stripe meter ${res2.status}: ${(await res2.text()).slice(0, 400)}` });
  const j: any = await res2.json();
  await audit(null, "system", "billing.stripe_meter.event", { event_key, value, id: j?.identifier ?? j?.id });
  res.json({ ok: true, id: j?.identifier ?? j?.id });
});


stripeMetersRouter.post("/webhook", raw({ type: "application/json" }), async (req, res) => {
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
  const customerId = event?.data?.object?.customer ?? event?.payload?.customer;
  if (customerId) {
    const { query } = await import("../lib/db.js");
    const projs = await query<any>(`select id from projects where stripe_customer_id=$1`, [customerId]);
    if (projs[0]) {
      const value = Number(event?.data?.object?.value ?? event?.payload?.value ?? 0);
      await audit(projs[0].id, "stripe", "billing.meter.ingested", { value, customer: customerId, type: event?.type });
    }
  }
  res.json({ received: true });
});
