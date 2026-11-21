// Applies infra/*.sql in order: schema.sql first, then migration-*.sql sorted.
// Idempotent (IF NOT EXISTS + schema_migrations). Bundled as CommonJS for the
// desktop app, where it reads SQL from CREW_INFRA (resources) instead of its dir.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

function infraDir() {
  if (process.env.CREW_INFRA) return process.env.CREW_INFRA;
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return "infra";
  }
}

async function main() {
  const here = infraDir();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres://crewcode:crewcode@localhost:5432/crewcode",
  });

  await pool.query(`create table if not exists schema_migrations (filename text primary key, applied_at timestamptz default now())`);

  const files = ["schema.sql", ...readdirSync(here).filter((f) => /^migration-.*\.sql$/.test(f)).sort()];

  let applied = 0;
  for (const f of files) {
    const done = await pool.query(`select 1 from schema_migrations where filename=$1`, [f]);
    if (done.rowCount) continue;
    await pool.query(readFileSync(join(here, f), "utf8"));
    await pool.query(`insert into schema_migrations (filename) values ($1)`, [f]);
    applied++;
    console.log(`applied ${f}`);
  }
  console.log(applied ? `done: ${applied} new file(s)` : "done: database already current");
  await pool.end();
}

main().catch((e) => {
  console.error("migrate failed:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
