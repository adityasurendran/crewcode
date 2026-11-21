// Doppler vault provider — real secrets server-side only.
// Format: doppler://PROJECT/CONFIG/SECRET_NAME
// Requires DOPPLER_TOKEN (service token with read scope).
import { resolveSecret, parseVaultRef } from "./vault.js";

const DOPPLER_API = "https://api.doppler.com/v3/configs/config/secrets";

export async function resolveDopplerSecret(ref: string): Promise<string> {
  const { name } = parseVaultRef(ref);
  const [project, config, key] = name.split("/");
  if (!project || !config || !key) {
    throw new Error(`invalid doppler ref — expected doppler://PROJECT/CONFIG/KEY, got ${ref}`);
  }
  const token = process.env.DOPPLER_TOKEN;
  if (!token) throw new Error("DOPPLER_TOKEN missing — set it for doppler:// refs");

  const url = `${DOPPLER_API}?project=${encodeURIComponent(project)}&config=${encodeURIComponent(config)}&name=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`doppler ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j: any = await res.json();
  const val = j?.secret?.raw;
  if (typeof val !== "string" || !val) throw new Error(`doppler: empty secret for ${key}`);
  return val;
}

// Hook into vault.ts resolver — keep the vault_ref contract stable.
export async function resolveViaVault(ref: string): Promise<string> {
  if (ref.startsWith("doppler://")) return resolveDopplerSecret(ref);
  return resolveSecret(ref);
}
