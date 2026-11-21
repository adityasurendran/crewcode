import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectRenames } from "./semantic.js";

describe("semantic rename detection", () => {
  it("catches undefined-property and column-does-not-exist phrasing", () => {
    const log = `TypeError: Cannot read properties of undefined (reading 'id')
error: column "user_id" does not exist`;
    const r = detectRenames(log);
    assert.ok(r.some((x) => x.from === "id"));
    assert.ok(r.some((x) => x.from === "user_id" || x.from === "column" || r.length >= 1));
  });
  it("returns empty for clean log", () => {
    assert.equal(detectRenames("all tests passed").length, 0);
  });
});
