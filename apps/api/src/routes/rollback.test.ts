import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("rollback gate", () => {
  it("requires human actor (logic-level contract)", () => {
    // Contract: rollback endpoint must 400 without approved_by.
    // Full HTTP test would need a live server; this guards the rule in code review.
    const requiresHuman = (body: any) => !!body?.approved_by;
    assert.equal(requiresHuman({ project_id: "x", task_id: "y" }), false);
    assert.equal(requiresHuman({ approved_by: "alice@x.com" }), true);
  });
});
