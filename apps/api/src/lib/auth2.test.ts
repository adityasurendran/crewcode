import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashKey, decodeJwt } from "./auth.js";

describe("auth key + jwt", () => {
  it("hashKey is deterministic and salted by input", () => {
    assert.equal(hashKey("ck_abc"), hashKey("ck_abc"));
    assert.notEqual(hashKey("ck_abc"), hashKey("ck_abd"));
  });
  it("decodeJwt handles malformed tokens", () => {
    assert.equal(decodeJwt("not-a-jwt"), null);
    assert.equal(decodeJwt("a.b"), null);
    assert.equal(decodeJwt(""), null);
  });
  it("decodeJwt accepts well-formed payload", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    const claims = decodeJwt(`h.${payload}.s`);
    assert.equal(claims?.sub, "u1");
  });
});
