import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { provider } from "./previews.js";

describe("preview provider selection", () => {
  it("trims and validates PREVIEW_PROVIDER", () => {
    const prev = process.env.PREVIEW_PROVIDER;
    process.env.PREVIEW_PROVIDER = "vercel ";
    assert.equal(provider(), "vercel");
    process.env.PREVIEW_PROVIDER = "bogus";
    assert.equal(provider(), "stub");
    if (prev === undefined) delete process.env.PREVIEW_PROVIDER;
    else process.env.PREVIEW_PROVIDER = prev;
  });
});
