import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vercelHeaders, vercelProjectUrl, vercelTeamQuery } from "./vercel-deploy.js";

describe("vercel deploy helpers", () => {
  it("builds bearer headers without leaking the token into logs", () => {
    const h = vercelHeaders("tok123");
    assert.equal(h.Authorization, "Bearer tok123");
    assert.equal(h["content-type"], "application/json");
  });
  it("derives the default project URL", () => {
    assert.equal(vercelProjectUrl("my-app"), "https://my-app.vercel.app");
  });
  it("encodes the team query only when set", () => {
    assert.equal(vercelTeamQuery(""), "");
    assert.equal(vercelTeamQuery("team_1"), "?teamId=team_1");
    assert.equal(vercelTeamQuery("a b"), "?teamId=a%20b");
  });
});
