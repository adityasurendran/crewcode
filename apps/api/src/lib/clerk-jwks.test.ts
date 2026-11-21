import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createVerify, createPublicKey, generateKeyPairSync, sign } from "node:crypto";

describe("clerk JWKS RS256 path", () => {
  it("verifies RS256 signature against a self-signed cert", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as any;
    const data = Buffer.from("header.payload");
    const sig = sign("RSA-SHA256", data, privateKey);
    const pub = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
    const v2 = createVerify("RSA-SHA256");
    v2.update(data);
    assert.equal(v2.verify(pub, sig), true);
    const v3 = createVerify("RSA-SHA256");
    v3.update(Buffer.from("tampered"));
    assert.equal(v3.verify(pub, sig), false);
  });
});
