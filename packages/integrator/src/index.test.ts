import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldAutoMerge } from "./index.js";

describe("integrator gate", () => {
  it("auto-merges only when all checks pass", () => {
    assert.equal(shouldAutoMerge([{ name: "typecheck", ok: true, log: "" }]), true);
    assert.equal(
      shouldAutoMerge([
        { name: "typecheck", ok: true, log: "" },
        { name: "unit", ok: false, log: "FAIL" },
      ]),
      false
    );
    assert.equal(shouldAutoMerge([]), false);
  });
});
