"use strict";
// Embedded datastore for the desktop app — no Docker. Starts a bundled Postgres
// (embedded-postgres) and Redis (bundled binary) on local ports, and hands back
// connection URLs for the server. Idempotent: reuses an existing data dir.
const { spawn, execFileSync } = require("node:child_process");
const { existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const PG_PORT = Number(process.env.CREW_PG_PORT || 54329);
const REDIS_PORT = Number(process.env.CREW_REDIS_PORT || 6399);
const USER = "crewcode";
const PASS = "crewcode";
const DB = "crewcode";

async function startDatastore({ dataDir, redisExe, log = console.log }) {
  mkdirSync(dataDir, { recursive: true });
  const pgDir = join(dataDir, "pg");
  const redisDir = join(dataDir, "redis");
  mkdirSync(redisDir, { recursive: true });

  // --- Postgres (embedded) ---
  const mod = await import("embedded-postgres");
  const EmbeddedPostgres = mod.default ?? mod;
  const pg = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: USER,
    password: PASS,
    port: PG_PORT,
    persistent: true,
    onLog: () => {},
    onError: (e) => log("[pg] " + String(e).slice(0, 200)),
  });
  if (!existsSync(join(pgDir, "PG_VERSION"))) {
    log("[datastore] initialising postgres…");
    await pg.initialise();
  }
  log("[datastore] starting postgres…");
  await pg.start();
  await pg.createDatabase(DB).catch(() => {});
  const DATABASE_URL = `postgres://${USER}:${PASS}@127.0.0.1:${PG_PORT}/${DB}`;

  // --- Redis (bundled binary) ---
  log("[datastore] starting redis…");
  const redis = spawn(redisExe, ["--port", String(REDIS_PORT), "--save", "", "--appendonly", "no", "--dir", redisDir], {
    stdio: "ignore",
    windowsHide: true,
  });
  const REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;

  const stop = async () => {
    try {
      redis.kill();
    } catch {}
    try {
      await pg.stop();
    } catch {}
  };
  return { DATABASE_URL, REDIS_URL, stop };
}

module.exports = { startDatastore, PG_PORT, REDIS_PORT };
