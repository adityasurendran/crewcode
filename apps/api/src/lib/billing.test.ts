import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costFor } from "./billing.js";

describe("billing", () => {
  it("prices tokens and sums", () => {
    assert.equal(costFor(0), 0);
    assert.ok(costFor(1_000_000) > 1 && costFor(1_000_000) < 5);
    assert.equal(costFor(1000, "opencode-go/mimo-v2.5"), costFor(1000, "default"));
  });
});
