import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";

export const connectionsRouter = Router();

const PROVIDERS = ["supabase", "stripe", "openai", "github", "postgres", "resend", "custom"] as const;

const Upsert = z.object({
  project_id: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  
  
  vault_ref: z.string().min(1).optional(),
  api_key: z.string().min(8).optional(),
  scopes: z.record(z.any()).default({}),
});


connectionsRouter.get("/", async (req, res) => {
  const { project_id } = req.query;
  const rows = project_id
    ? await query(`select id, project_id, provider, vault_ref, scopes, created_at from api_connections where project_id=$1`, [project_id])
    : await query(`select id, project_id, provider, scopes, created_at from api_connections limit 50`);
  res.json(
    rows.map((r: any) => ({ ...r, vault_ref: r.vault_ref ? String(r.vault_ref).split("://")[0] + "://***" : undefined }))
  );
});

connectionsRouter.post("/", async (req, res) => {
  const parsed = Upsert.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const { project_id, provider, scopes } = parsed.data;
  let vault_ref = parsed.data.vault_ref ?? "";

  
  const raw = (parsed.data.api_key ?? (!vault_ref.includes("://") ? vault_ref : "")).trim();
  if (raw) {
    const { encryptSecret } = await import("../lib/secrets.js");
    const saved = await query<any>(
      `insert into vault_secrets (project_id, provider, enc) values ($1,$2,$3) returning id`,
      [project_id, provider, encryptSecret(raw)]
    );
    vault_ref = `crewvault://${saved[0].id}`;
  }
  if (!vault_ref) return res.status(400).json({ error: "a key is required" });
  const rows = await query(
    `insert into api_connections (project_id, provider, vault_ref, scopes)
     values ($1,$2,$3,$4)
     on conflict do nothing returning id, project_id, provider, scopes`,
    [project_id, provider, vault_ref, JSON.stringify(scopes)]
  );
  await audit(project_id, "user", "connections.upsert", { provider });
  res.json(rows[0] ?? { ok: true });
});




const ImportDb = z.object({ project_id: z.string().uuid(), database_url: z.string().min(1) });
connectionsRouter.post("/import-db", async (req, res) => {
  const parsed = ImportDb.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  try {
    res.json({ ok: true, ...(await importDatabase(parsed.data.project_id, parsed.data.database_url)) });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.startsWith("invalid ")) return res.status(400).json({ error: msg.slice(0, 300) });
    console.error("[connections] import-db failed:", msg.slice(0, 300));
    res.status(500).json({ error: "could not import the database — check host, port and credentials" });
  }
});

import { importDatabase } from "../lib/db-import.js";

connectionsRouter.delete("/:id", async (req, res) => {  const rows = await query(`select project_id, provider, vault_ref from api_connections where id=$1`, [req.params.id]);
  await query(`delete from api_connections where id=$1`, [req.params.id]);
  
  const ref = String(rows[0]?.vault_ref ?? "");
  if (ref.startsWith("crewvault://")) {
    await query(`delete from vault_secrets where id=$1`, [ref.slice("crewvault://".length)]).catch(() => {});
  }
  if (rows[0]) await audit(rows[0].project_id, "user", "connections.revoked", { provider: rows[0].provider });
  res.json({ ok: true });
});
