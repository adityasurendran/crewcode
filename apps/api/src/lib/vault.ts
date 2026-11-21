// Vault abstraction — agents NEVER call this directly.
// Only capabilities proxy (server-side) may resolve secrets.
// Providers: env:// (dev), doppler://, aws-sm://, crewvault:// (CrewCode's own
// encrypted store — paste-a-key UX, never shown again). Raw keys never leave
// this module, never enter LLM prompts, never written to events/artifacts.
export type VaultRef = { provider: string; name: string };

export function parseVaultRef(ref: string): VaultRef {
  // format: "doppler://PROJECT/CONFIG/KEY" or "aws-sm://arn-or-name" or "env://KEY"
  // or "crewvault://<uuid>"
  const i = ref.indexOf("://");
  if (i < 0) return { provider: "env", name: ref };
  return { provider: ref.slice(0, i), name: ref.slice(i + 3) };
}

export async function resolveSecret(ref: string): Promise<string> {
  const { provider, name } = parseVaultRef(ref);
  if (provider === "env") {
    const v = process.env[name];
    if (!v) throw new Error(`missing env secret ${name} (dev fallback)`);
    return v;
  }
  if (provider === "doppler") {
    // Real Doppler via server-side token — never exposed to agents.
    const { resolveDopplerSecret } = await import("./doppler.js");
    return resolveDopplerSecret(ref);
  }
  if (provider === "aws-sm") {
    const { resolveAwsSmSecret } = await import("./aws-sm.js");
    return resolveAwsSmSecret(ref);
  }
  if (provider === "crewvault") {
    const { query } = await import("./db.js");
    const { decryptSecret } = await import("./secrets.js");
    const rows = await query<any>(`select enc from vault_secrets where id=$1`, [name]).catch(() => []);
    if (!rows.length) throw new Error("stored secret not found (was it deleted?)");
    const plain = decryptSecret(rows[0].enc);
    if (!plain) throw new Error("stored secret unreadable");
    return plain;
  }
  throw new Error(`unknown vault provider ${provider}`);
}

// Redact secrets from any log/event payload before persisting.
export function redactSecrets(input: string): string {
  return input
    .replace(/sk-(live|test)-[A-Za-z0-9-_]+/g, "[REDACTED_STRIPE]")
    .replace(/sk-ant-[A-Za-z0-9-_]+/g, "[REDACTED_ANTHROPIC]")
    .replace(/sk-[A-Za-z0-9-_]{10,}/g, "[REDACTED_KEY]")
    .replace(/supabase_[A-Za-z0-9-_=.]+/gi, "[REDACTED_SUPABASE]");
}
