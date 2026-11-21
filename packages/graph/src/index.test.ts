import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sliceForTask } from "./index.js";

describe("graph slice", () => {
  it("includes scope + routes", () => {
    const s = sliceForTask(
      { projectId: "p", routes: ["app/login/page.tsx"], components: [], schema: [], dependencies: { next: "14" }, tasksActive: [], generatedAt: "" },
      ["src/auth"]
    );
    assert.match(s, /src\/auth/);
    assert.match(s, /login/);
  });
});
