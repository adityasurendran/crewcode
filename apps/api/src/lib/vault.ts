




export type VaultRef = { provider: string; name: string };

export function parseVaultRef(ref: string): VaultRef {
  
  
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


export function redactSecrets(input: string): string {
  return input
    .replace(/sk-(live|test)-[A-Za-z0-9-_]+/g, "[REDACTED_STRIPE]")
    .replace(/sk-ant-[A-Za-z0-9-_]+/g, "[REDACTED_ANTHROPIC]")
    .replace(/sk-[A-Za-z0-9-_]{10,}/g, "[REDACTED_KEY]")
    .replace(/supabase_[A-Za-z0-9-_=.]+/gi, "[REDACTED_SUPABASE]");
}
