import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyStripeSignature(payload: Buffer, sig: string, secret: string): boolean {
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

describe("stripe signature edge cases", () => {
  it("rejects missing v1", () => {
    const payload = Buffer.from("{}");
    assert.equal(verifyStripeSignature(payload, "t=123", "s"), false);
  });
  it("rejects stale timestamp", () => {
    const payload = Buffer.from("{}");
    const old = Math.floor(Date.now() / 1000) - 9999;
    const v1 = createHmac("sha256", "s").update(`${old}.${payload}`).digest("hex");
    assert.equal(verifyStripeSignature(payload, `t=${old},v1=${v1}`, "s"), false);
  });
  it("accepts fresh valid signature", () => {
    const secret = "whsec_x";
    const payload = Buffer.from('{"type":"checkout.session.completed"}');
    const t = Math.floor(Date.now() / 1000).toString();
    const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret), true);
  });
});
