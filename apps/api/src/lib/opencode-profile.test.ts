import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { providerOptions } from "./opencode-profile.js";

describe("providerOptions", () => {
  it("builds the apiKey section for opencode-go", () => {
    assert.deepEqual(providerOptions("opencode-go", "sk-x"), { "opencode-go": { options: { apiKey: "sk-x" } } });
  });
  it("returns undefined without provider or key (gating preserved)", () => {
    assert.equal(providerOptions("", "sk-x"), undefined);
    assert.equal(providerOptions("opencode-go", ""), undefined);
  });
});
