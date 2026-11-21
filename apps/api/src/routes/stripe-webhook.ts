

import { Router } from "express";
import { raw } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const stripeRouter = Router();

export function verifyStripeSignature(payload: Buffer, sig: string, secret: string): boolean {
  const parts: Record<string, string> = {};
  for (const p of sig.split(",")) {
    const [k, v] = p.split("=");
    if (k && v) parts[k] = v;
  }
  if (!parts.t || !parts.v1) return false;
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts.v1, "hex"));
  } catch {
    return false;
  }
}


stripeRouter.post("/webhook", raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = (req.headers["stripe-signature"] as string) ?? "";
  const payload = req.body as Buffer;
  if (secret) {
    if (!sig || !verifyStripeSignature(payload, sig, secret)) {
      return res.status(400).json({ error: "invalid signature" });
    }
  }
  let event: any;
  try {
    event = JSON.parse(payload.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "bad json" });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data?.object;
      const projectId = session?.metadata?.project_id;
      if (projectId) {
        await audit(projectId, "stripe", "billing.checkout.completed", {
          session_id: session?.id,
          amount: session?.amount_total,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      await audit(null, "stripe", "billing.subscription.deleted", { customer: event.data?.object?.customer });
      break;
    }
    default:
      break;
  }
  res.json({ received: true });
});
