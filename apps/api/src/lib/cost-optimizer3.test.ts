import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectModelFor, routeFor, TIER_MODEL, TIER_COST_PER_1K } from "./cost-optimizer.js";

describe("cost optimizer full routing", () => {
  it("all tiers have models and costs", () => {
    for (const tier of ["tiny", "cheap", "standard", "heavy", "frontier"] as const) {
      assert.ok(TIER_MODEL[tier], `missing model for ${tier}`);
      assert.ok(TIER_COST_PER_1K[tier] > 0, `missing cost for ${tier}`);
    }
  });
  it("routing is deterministic", () => {
    assert.equal(selectModelFor("semantic_patch"), selectModelFor("semantic_patch"));
    assert.equal(routeFor("semantic_patch").model, routeFor("semantic_patch").model);
  });
  it("unknown kinds default to standard", () => {
    assert.equal(selectModelFor("something_random"), "standard");
  });
});
