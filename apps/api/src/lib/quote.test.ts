import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { quoteForShell } from "./agent-pool.js";

describe("quoteForShell", () => {
  it("escapes double quotes", () => {
    assert.equal(quoteForShell('say "hi"'), 'say \\"hi\\"');
  });
  it("collapses newlines/tabs so cmd.exe keeps trailing flags", () => {
    const q = quoteForShell('line one\n\nFollow-up: do X\tand Y');
    assert.ok(!q.includes("\n") && !q.includes("\t"), q);
    assert.ok(q.includes("Follow-up: do X and Y"), q);
  });
  it("caps length", () => {
    assert.ok(quoteForShell("x".repeat(9000)).length <= 4000);
  });
});
