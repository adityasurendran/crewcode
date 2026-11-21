import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickSession } from "./agent-pool.js";

const NOW = 1791440364000;

describe("pickSession", () => {
  it("ignores long-lived stranger sessions even when newest", () => {
    const sessions = [
      { id: "ses_mine", directory: "C:\\Users\\Aditya\\Documents\\crewcode", created: NOW - 999_999, updated: NOW },
      { id: "ses_task", directory: "C:\\proj\\.crew\\worktrees\\abc", created: NOW - 1000, updated: NOW - 500 },
    ];
    assert.equal(pickSession(sessions, "C:\\proj\\.crew\\worktrees\\abc", NOW - 2000), "ses_task");
  });
  it("returns null when nothing was born during this run", () => {
    const sessions = [{ id: "ses_old", directory: "C:\\proj", created: NOW - 600_000, updated: NOW }];
    assert.equal(pickSession(sessions, "C:\\proj", NOW), null);
  });
  it("prefers the directory match over a newer stranger", () => {
    const sessions = [
      { id: "ses_stranger", directory: "C:\\other", created: NOW - 100, updated: NOW },
      { id: "ses_mine", directory: "C:\\proj\\.crew\\worktrees\\abc", created: NOW - 2000, updated: NOW - 1000 },
    ];
    assert.equal(pickSession(sessions, "C:\\proj\\.crew\\worktrees\\abc", NOW - 5000), "ses_mine");
  });
  it("returns null instead of a stranger when nothing matches", () => {
    const sessions = [
      { id: "ses_stranger", directory: "C:\\other", created: NOW - 100, updated: NOW },
      { id: "ses_old", directory: "C:\\proj\\.crew\\worktrees\\abc", created: NOW - 600_000, updated: NOW },
    ];
    assert.equal(pickSession(sessions, "C:\\proj\\.crew\\worktrees\\abc", NOW - 5000), null);
  });
  it("returns null on ambiguous overlap instead of guessing", () => {
    const sessions = [
      { id: "ses_a", directory: "C:\\proj\\.crew\\worktrees\\abc", created: NOW - 1000, updated: NOW - 500 },
      { id: "ses_b", directory: "C:\\proj\\.crew\\worktrees\\abc", created: NOW - 800, updated: NOW - 100 },
    ];
    assert.equal(pickSession(sessions, "C:\\proj\\.crew\\worktrees\\abc", NOW - 5000), null);
  });
  it("handles garbage input", () => {
    assert.equal(pickSession(null as any, "C:\\x", NOW), null);
    assert.equal(pickSession([], "C:\\x", NOW), null);
  });
});
