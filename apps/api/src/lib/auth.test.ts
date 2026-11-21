import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt, hashKey } from "./auth.js";

describe("auth", () => {
  it("decodes valid base64url JWT payload and rejects expired", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "user_1", org_id: "o1", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    const token = `h.${payload}.s`;
    const claims = decodeJwt(token);
    assert.equal(claims?.sub, "user_1");
    const expired = Buffer.from(JSON.stringify({ sub: "u", exp: 1 })).toString("base64url");
    assert.equal(decodeJwt(`h.${expired}.s`), null);
  });
  it("hashes keys deterministically", () => {
    assert.equal(hashKey("abc"), hashKey("abc"));
    assert.notEqual(hashKey("abc"), hashKey("abd"));
  });
});
