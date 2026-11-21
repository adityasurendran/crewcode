// Database import — bring an existing Postgres/Supabase database the way
// GitHub import brings existing code. The URL is vaulted server-side (never
// logged, never sent to agents); the schema snapshot becomes a db_schema
// artifact + prompt context so agents generate code against real tables.
import { query } from "./db.js";
import { encryptSecret } from "./secrets.js";
import { audit } from "./audit.js";

export type ParsedDbUrl = { host: string; port: string; database: string; user: string; redacted: string };

// Pure — unit-tested. Throws on anything that is not a Postgres URL.
export function parseDatabaseUrl(raw: string): ParsedDbUrl {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("invalid database URL: empty");
  if (/\s/.test(s)) throw new Error("invalid database URL: must not contain spaces");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("invalid database URL: must look like postgres://user:pass@host:5432/dbname");
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error(`invalid database URL: protocol must be postgres:// (got ${u.protocol})`);
  }
  if (!u.hostname) throw new Error("invalid database URL: missing host");
  const database = u.pathname.replace(/^\//, "").split("/")[0];
  if (!database) throw new Error("invalid database URL: missing database name");
  const port = u.port || "5432";
  const user = decodeURIComponent(u.username || "");
  const redacted = `postgres://${user ? `${encodeURIComponent(user)}@` : ""}${u.hostname}:${port}/${database}`;
  return { host: u.hostname, port, database, user, redacted };
}

export type DbSchemaTable = { schema: string; table: string; rows_est: number; columns: { name: string; type: string }[] };

export async function importDatabase(
  projectId: string,
  databaseUrl: string
): Promise<{ tables: number; columns: number; host: string; database: string }> {
  const parsed = parseDatabaseUrl(databaseUrl);

  // Vault the full URL (password included) — only a ref is stored elsewhere.
  const saved = await query<any>(`insert into vault_secrets (project_id, provider, enc) values ($1,'postgres',$2) returning id`, [
    projectId,
    encryptSecret(databaseUrl.trim()),
  ]);
  const vaultRef = `crewvault://${saved[0].id}`;
  await query(
    `insert into api_connections (project_id, provider, vault_ref, scopes)
     values ($1,'postgres',$2,$3)
     on conflict do nothing`,
    [projectId, vaultRef, JSON.stringify({ database: parsed.database, host: parsed.host })]
  );

  // Connect once (short timeouts — never hang a request) and snapshot the schema.
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl.trim(), connectionTimeoutMillis: 8000, statement_timeout: 15000 });
  try {
    const tables = await pool.query(
      `select table_schema, table_name from information_schema.tables
       where table_type='BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
       order by 1,2 limit 200`
    );
    const cols = await pool.query(
      `select table_schema, table_name, column_name, data_type from information_schema.columns
       where table_schema not in ('pg_catalog','information_schema')
       order by table_schema, table_name, ordinal_position limit 5000`
    );
    const sizes = await pool.query(
      `select n.nspname as schema, c.relname as table, c.reltuples::int as rows_est
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema')`
    ).catch(() => ({ rows: [] as any[] }));
    const sizeMap = new Map<string, number>();
    for (const r of (sizes as any).rows ?? []) sizeMap.set(`${r.schema}.${r.table}`, Math.max(0, Number(r.rows_est ?? 0)));
    const byTable = new Map<string, DbSchemaTable>();
    for (const t of tables.rows) {
      byTable.set(`${t.table_schema}.${t.table_name}`, {
        schema: t.table_schema, table: t.table_name,
        rows_est: sizeMap.get(`${t.table_schema}.${t.table_name}`) ?? 0,
        columns: [],
      });
    }
    for (const c of cols.rows) {
      const t = byTable.get(`${c.table_schema}.${c.table_name}`);
      if (t && t.columns.length < 100) t.columns.push({ name: c.column_name, type: c.data_type });
    }
    const schema = [...byTable.values()];
    const columnCount = schema.reduce((n, t) => n + t.columns.length, 0);
    await query(`insert into artifacts (task_id, kind, uri, meta) values (NULL,'db_schema',$1,$2)`, [
      parsed.redacted,
      JSON.stringify({ project_id: projectId, host: parsed.host, database: parsed.database, tables: schema.length, columns: columnCount, schema }),
    ]);
    await audit(projectId, "user", "db.imported", { host: parsed.host, database: parsed.database, tables: schema.length });
    return { tables: schema.length, columns: columnCount, host: parsed.host, database: parsed.database };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Markdown context appended to the agent prompt so generated code matches real tables.
// Schema only — credentials never leave the vault.
export async function dbSchemaContext(projectId: string): Promise<string> {
  try {
    const rows = await query<any>(
      `select meta from artifacts where kind='db_schema' and meta->>'project_id'=$1 order by created_at desc limit 1`,
      [projectId]
    );
    const m = typeof rows[0]?.meta === "string" ? JSON.parse(rows[0].meta) : rows[0]?.meta;
    const schema: DbSchemaTable[] = m?.schema ?? [];
    if (!schema.length) return "";
    const lines = schema.slice(0, 40).map((t) => {
      const cols = t.columns
        .slice(0, 25)
        .map((c) => `${c.name} ${c.type}`)
        .join(", ");
      return `- ${t.schema}.${t.table} (${cols})${t.rows_est ? ` ~${t.rows_est} rows` : ""}`;
    });
    return `\n\n## Linked database (imported schema — generate code against these tables; credentials stay server-side)\n${m.host ?? ""}/${m.database ?? ""}\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}
