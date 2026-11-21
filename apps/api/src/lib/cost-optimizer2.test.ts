import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectModelFor, routeFor, TIER_MODEL, TIER_COST_PER_1K } from "./cost-optimizer.js";

describe("cost optimizer routing", () => {
  it("maps kinds to sensible tiers", () => {
    assert.equal(selectModelFor("event_classify"), "tiny");
    assert.equal(selectModelFor("chore_patch"), "cheap");
    assert.equal(selectModelFor("semantic_patch"), "heavy");
    assert.equal(selectModelFor("architectural_decision"), "frontier");
    assert.equal(selectModelFor("random"), "standard");
  });
  it("routeFor returns consistent model", () => {
    const r = routeFor("semantic_patch");
    assert.equal(r.model, TIER_MODEL.heavy);
    assert.equal(r.tier, "heavy");
  });
  it("cost per 1K is the flat metered rate on every tier", () => {
    for (const t of ["tiny", "cheap", "standard", "heavy", "frontier"] as const) {
      assert.equal(TIER_COST_PER_1K[t], 0.002);
    }
  });
});
