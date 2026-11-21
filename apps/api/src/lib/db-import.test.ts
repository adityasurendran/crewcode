import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDatabaseUrl } from "./db-import.js";

describe("parseDatabaseUrl", () => {
  it("parses a full Postgres URL and redacts the password", () => {
    const p = parseDatabaseUrl("postgres://app:s3cret@db.example.com:5433/shop");
    assert.equal(p.host, "db.example.com");
    assert.equal(p.port, "5433");
    assert.equal(p.database, "shop");
    assert.equal(p.user, "app");
    assert.ok(!p.redacted.includes("s3cret"), "password must not appear in redacted form");
    assert.ok(p.redacted.includes("db.example.com"));
  });
  it("defaults the port and accepts postgresql://", () => {
    const p = parseDatabaseUrl("postgresql://u@127.0.0.1/mydb");
    assert.equal(p.port, "5432");
    assert.equal(p.database, "mydb");
  });
  it("rejects non-postgres schemes", () => {
    assert.throws(() => parseDatabaseUrl("mysql://u:p@h/db"), /postgres/);
    assert.throws(() => parseDatabaseUrl("https://example.com/x"), /postgres/);
  });
  it("rejects missing host or database", () => {
    assert.throws(() => parseDatabaseUrl("postgres:///dbname"), /host/);
    assert.throws(() => parseDatabaseUrl("postgres://u@h"), /database/);
    assert.throws(() => parseDatabaseUrl(""), /empty/);
    assert.throws(() => parseDatabaseUrl("not a url"), /spaces|must look like/);
  });
});
