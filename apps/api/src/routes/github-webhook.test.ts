import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyGithubSignature(payload: Buffer, sig: string, secret: string): boolean {
  if (!sig?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = sig.slice(7);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

describe("github webhook signature", () => {
  it("accepts valid HMAC and rejects bad", () => {
    const secret = "whsec_gh";
    const payload = Buffer.from(JSON.stringify({ action: "closed", pull_request: { merged: true } }));
    const sig = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    assert.equal(verifyGithubSignature(payload, sig, secret), true);
    assert.equal(verifyGithubSignature(payload, "sha256=dead", secret), false);
    assert.equal(verifyGithubSignature(payload, "", secret), false);
  });
});
