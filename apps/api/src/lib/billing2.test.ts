import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costFor } from "./billing.js";

describe("billing cost calculations", () => {
  it("zero tokens = zero cost", () => {
    assert.equal(costFor(0), 0);
  });
  it("scales linearly", () => {
    assert.equal(costFor(2000), costFor(1000) * 2);
  });
  it("known gateway models meter at the flat rate", () => {
    const standard = costFor(1000, "default");
    assert.equal(costFor(1000, "opencode-go/mimo-v2.5"), standard);
    assert.equal(costFor(1000, "opencode-go/deepseek-v4.1-flash"), standard);
  });
});
