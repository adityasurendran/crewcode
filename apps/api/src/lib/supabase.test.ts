import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeSpec, checkStorageRef } from "./providers.js";

describe("supabase writeSpec", () => {
  it("builds insert specs with row caps", () => {
    const s = writeSpec("orders", "insert", [{ id: 1 }]);
    assert.equal(s.method, "POST");
    assert.equal(s.path, "/rest/v1/orders");
    assert.ok((s.body ?? "").includes('"id":1'));
    assert.throws(() => writeSpec("orders", "insert", []), /non-empty/);
    assert.throws(() => writeSpec("orders", "insert", new Array(101).fill({})), /capped/);
  });
  it("builds scoped update/delete specs and refuses unscoped ones", () => {
    const u = writeSpec("orders", "update", { total: 9 }, "id=eq.1");
    assert.equal(u.method, "PATCH");
    assert.equal(u.path, "/rest/v1/orders?id=eq.1");
    const d = writeSpec("orders", "delete", undefined, "id=eq.1");
    assert.equal(d.method, "DELETE");
    assert.throws(() => writeSpec("orders", "update", { a: 1 }), /filter/);
    assert.throws(() => writeSpec("orders", "delete"), /filter/);
    assert.throws(() => writeSpec("orders", "update", [{ a: 1 }], "id=eq.1"), /values object/);
  });
  it("rejects bad table names and ops", () => {
    assert.throws(() => writeSpec("orders;drop", "insert", [{}]), /table/);
    assert.throws(() => writeSpec("", "insert", [{}]), /table/);
    assert.throws(() => writeSpec("orders", "upsert" as any, [{}]), /unknown op/);
  });
});

describe("checkStorageRef", () => {
  it("accepts sane refs and rejects escapes", () => {
    checkStorageRef("avatars", "u1/pic.png");
    assert.throws(() => checkStorageRef("a/b", "x"), /bucket/);
    assert.throws(() => checkStorageRef("avatars", "../etc"), /must not contain/);
    assert.throws(() => checkStorageRef("", "x"), /bucket/);
  });
});
