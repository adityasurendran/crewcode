import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./index.js";

describe("worker prompt", () => {
  it("scopes agent and forbids secrets/deploy", () => {
    const p = buildSystemPrompt(
      { taskId: "t1", projectId: "p1", objective: "Add login", workdir: "/tmp/x", allowlist: ["src/auth"] },
      "CTX"
    );
    assert.match(p, /src\/auth/);
    assert.match(p, /never raw env keys/i);
    assert.match(p, /Never run git push/);
  });
});
