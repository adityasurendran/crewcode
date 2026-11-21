import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acquireRunLock, releaseRunLock, renewRunLock, withLock, runLockKey, mergeLockKey, type LockStore } from "./runlock.js";

function memStore(): LockStore & { keys: Map<string, { token: string; ttl: number }> } {
  const keys = new Map<string, { token: string; ttl: number }>();
  return {
    keys,
    async setnxex(key, token, ttl) {
      if (keys.has(key)) return false;
      keys.set(key, { token, ttl });
      return true;
    },
    async renew(key, token, ttl) {
      const v = keys.get(key);
      if (!v || v.token !== token) return false;
      v.ttl = ttl;
      return true;
    },
    async release(key, token) {
      if (keys.get(key)?.token === token) {
        keys.delete(key);
        return true;
      }
      return false;
    },
  };
}

describe("runlock", () => {
  it("second acquire fails while held, succeeds after release", async () => {
    const s = memStore();
    const t1 = await acquireRunLock("task-1", 100, s);
    assert.ok(t1);
    assert.equal(await acquireRunLock("task-1", 100, s), null);
    await releaseRunLock("task-1", t1!, s);
    assert.ok(await acquireRunLock("task-1", 100, s));
  });

  it("a wrong token cannot release or renew", async () => {
    const s = memStore();
    const t1 = await acquireRunLock("task-2", 100, s);
    assert.ok(t1);
    assert.equal(await renewRunLock("task-2", "bogus", 100, s), false);
    await releaseRunLock("task-2", "bogus", s);
    assert.equal(await acquireRunLock("task-2", 100, s), null);
    assert.equal(await renewRunLock("task-2", t1!, 999, s), true);
    assert.equal(s.keys.get("task-2")!.ttl, 999);
    await releaseRunLock("task-2", t1!, s);
  });

  it("withLock runs once and returns a result, releasing after", async () => {
    const s = memStore();
    let calls = 0;
    const r = await withLock("task-3", async () => {
      calls++;
      return "done";
    }, { store: s, heartbeat: false });
    assert.equal(r.acquired, true);
    assert.equal(r.result, "done");
    assert.equal(calls, 1);
    assert.equal(s.keys.has("task-3"), false, "released");
  });

  it("withLock skips the body when the key is held", async () => {
    const s = memStore();
    await acquireRunLock("task-4", 100, s);
    let ran = false;
    const r = await withLock("task-4", async () => {
      ran = true;
      return 1;
    }, { store: s, heartbeat: false });
    assert.equal(r.acquired, false);
    assert.equal(ran, false);
  });

  it("lock keys are namespaced per resource", () => {
    assert.equal(runLockKey("t"), "crew:run:t");
    assert.equal(mergeLockKey("t"), "crew:merge:t");
  });
});
