import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectModelFor, TIER_MODEL } from "./cost-optimizer.js";

describe("semantic patch model routing", () => {
  it("routes semantic_patch to heavy by default (opencode-go only)", () => {
    const tier = selectModelFor("semantic_patch");
    assert.equal(tier, "heavy");
    assert.ok(TIER_MODEL[tier].startsWith("opencode-go/"));
  });
  it("detect_rename stays tiny (cheap chores)", () => {
    assert.equal(selectModelFor("detect_rename"), "tiny");
  });
});
