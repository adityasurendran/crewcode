import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "./stripe-webhook.js";

describe("stripe webhook signature", () => {
  it("accepts valid HMAC", () => {
    const secret = "whsec_test";
    const payload = Buffer.from(JSON.stringify({ type: "checkout.session.completed" }));
    const t = Math.floor(Date.now() / 1000).toString();
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret), true);
  });
  it("rejects bad sig / stale ts", () => {
    const payload = Buffer.from("{}");
    assert.equal(verifyStripeSignature(payload, "t=abc,v1=dead", "s"), false);
    const old = Math.floor(Date.now() / 1000) - 9999;
    assert.equal(verifyStripeSignature(payload, `t=${old},v1=xx`, "s"), false);
  });
});
