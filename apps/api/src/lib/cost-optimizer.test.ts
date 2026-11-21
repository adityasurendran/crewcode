import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectModelFor, routeFor, estimateCost } from "./cost-optimizer.js";

describe("cost optimizer tiers", () => {
  it("routes chores cheap and integration heavy", () => {
    assert.equal(selectModelFor("detect_rename"), "tiny");
    assert.equal(selectModelFor("semantic_patch"), "heavy");
    assert.equal(selectModelFor("architectural_decision"), "frontier");
    assert.equal(selectModelFor("unknown_kind"), "standard");
  });
  it("flat metered rate across tiers until gateway pricing lands", () => {
    assert.equal(estimateCost("tiny", 1000), estimateCost("standard", 1000));
    assert.equal(estimateCost("standard", 1000), estimateCost("heavy", 1000));
  });
  it("routeFor returns model + tier", () => {
    const r = routeFor("semantic_patch");
    assert.equal(r.tier, "heavy");
    assert.ok(r.model.startsWith("opencode-go/"));
  });
});
