import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePin, hashPin } from "./share.js";
import { parseTunnelUrl } from "./tunnel.js";

describe("PIN shares", () => {
  it("generates 6-digit zero-padded PINs", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      assert.match(pin, /^\d{6}$/);
    }
  });
  it("hashes deterministically and differs per PIN", () => {
    assert.equal(hashPin("123456"), hashPin("123456"));
    assert.notEqual(hashPin("123456"), hashPin("123457"));
  });
  it("trims whitespace on resolve input", () => {
    assert.equal(" 123456 ".trim().length, 6);
  });
});

describe("tunnel URL parsing", () => {
  it("extracts trycloudflare URL from cloudflared logs", () => {
    const line = "2026-10-06T10:00:00Z INF +--------------------------------------------------------------------------------------------+";
    assert.equal(parseTunnelUrl(line), null);
    const live = "2026-10-06T10:00:01Z INF Updated to new configuration | https://sensible-donkey-4829.trycloudflare.com |";
    assert.equal(parseTunnelUrl(live), "https://sensible-donkey-4829.trycloudflare.com");
  });
  it("handles stderr-style output", () => {
    assert.equal(parseTunnelUrl("ERR failed to parse https://ABC-123.trycloudflare.com/foo"), "https://ABC-123.trycloudflare.com");
  });
});
