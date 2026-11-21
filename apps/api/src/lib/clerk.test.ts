import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyClerkJwt } from "./clerk.js";

describe("clerk JWT verify", () => {
  it("decodes valid payload in dev mode (no JWKS)", async () => {
    process.env.CLERK_JWT_VERIFIER = "";
    process.env.CLERK_JWKS_URL = "";
    const payload = Buffer.from(JSON.stringify({ sub: "user_clerk", org_id: "org1", exp: Math.floor(Date.now() / 1000) + 120 })).toString("base64url");
    const token = `eyJhbGciOiJSUzI1NiJ9.${payload}.sig`;
    const claims = await verifyClerkJwt(token);
    assert.equal(claims?.sub, "user_clerk");
    assert.equal(claims?.org_id, "org1");
  });
  it("rejects expired tokens even in dev mode", async () => {
    process.env.CLERK_JWT_VERIFIER = "";
    const payload = Buffer.from(JSON.stringify({ sub: "u", exp: 1 })).toString("base64url");
    const claims = await verifyClerkJwt(`h.${payload}.s`);
    assert.equal(claims, null);
  });
});
