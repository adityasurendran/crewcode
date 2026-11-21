import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRepoUrl } from "./github.js";
import { previewUrlFor } from "./previews.js";

describe("github sync", () => {
  it("parses https + ssh + short forms", () => {
    assert.deepEqual(parseRepoUrl("https://github.com/acme/crewcode"), { owner: "acme", repo: "crewcode" });
    assert.deepEqual(parseRepoUrl("git@github.com:acme/crewcode.git"), { owner: "acme", repo: "crewcode" });
    assert.deepEqual(parseRepoUrl("acme/crewcode"), { owner: "acme", repo: "crewcode" });
    assert.throws(() => parseRepoUrl("not a repo !!!"));
  });
});

describe("previews", () => {
  it("issues stable per-task URL", () => {
    const a = previewUrlFor("abcdef12-3456-7890-abcd-ef1234567890");
    assert.match(a, /\/p\/abcdef12/);
  });
});
