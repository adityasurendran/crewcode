





import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query } from "./db.js";
import { decryptSecret, encryptSecret, maskKey } from "./secrets.js";

export type ProviderSettings = { provider: string; model: string; has_key: boolean; key_masked: string };




export function providerOptions(provider: string, apiKey: string): Record<string, unknown> | undefined {
  if (!provider || !apiKey) return undefined;
  return { [provider]: { options: { apiKey } } };
}

const PROFILE_DIR = ".crew/opencode";


const ASSETS = process.env.CREW_ASSETS ?? process.cwd();
const PROMPT_DIR_CANDIDATES = [
  join(ASSETS, "opencode-crew", "prompts"),
  "opencode-crew/prompts",
  "apps/api/opencode-crew/prompts",
];

function readPrompt(name: string): string {
  for (const dir of PROMPT_DIR_CANDIDATES) {
    const p = join(dir, `${name}.md`);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return `You are the CrewCode ${name} agent.`;
}

export async function getProviderSettings(): Promise<ProviderSettings> {
  const rows = await query<any>(`select key, value from app_settings where key in ('provider','model','api_key')`).catch(() => []);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const key = map.api_key ? decryptSecret(map.api_key) : "";
  return {
    
    provider: map.provider || "opencode-go",
    model: map.model || "opencode-go/mimo-v2.6-pro",
    has_key: !!key,
    key_masked: key ? maskKey(key) : "",
  };
}

async function rawKey(): Promise<string> {
  const rows = await query<any>(`select value from app_settings where key='api_key'`).catch(() => []);
  return rows[0]?.value ? decryptSecret(rows[0].value) : "";
}

export async function setProviderSettings(input: { provider: string; model: string; apiKey?: string }): Promise<ProviderSettings> {
  const upsert = (k: string, v: string) =>
    query(`insert into app_settings (key, value, updated_at) values ($1,$2,now()) on conflict (key) do update set value=$2, updated_at=now()`, [k, v]);
  await upsert("provider", input.provider);
  await upsert("model", input.model);
  if (input.apiKey && input.apiKey.trim()) await upsert("api_key", encryptSecret(input.apiKey.trim()));
  return getProviderSettings();
}

export async function clearProviderKey(): Promise<void> {
  await query(`delete from app_settings where key='api_key'`).catch(() => {});
}


function permissions(role: "crew" | "integrator") {
  return {
    read: { "**/.env": "deny", "**/.env.*": "deny", "**/auth.json": "deny", "*": "allow" },
    edit: "allow",
    webfetch: "deny",
    websearch: "deny",
    task: role === "integrator" ? "allow" : "deny",
    bash: {
      "git push --force*": "deny",
      "git push -f*": "deny",
      "git push origin main*": "deny",
      "git push origin master*": "deny",
      "git reset --hard*": "deny",
      "rm -rf /*": "deny",
      "sudo*": "deny",
      "*": "allow",
    },
  };
}

function buildConfig(opts: { role: "crew" | "integrator"; provider: string; model: string; apiKey: string; owner?: string }) {
  const { role, provider, model, apiKey, owner } = opts;
  const prompt = readPrompt(role === "integrator" ? "integrator" : "crew");
  const mcpServer = join(ASSETS, "opencode-crew", "mcp", "crewcode-mcp.mjs");
  const base = {
    $schema: "https://opencode.ai/config.json",
    share: "disabled",
    autoupdate: false,
    enabled_providers: provider ? [provider] : undefined,
    model,
    small_model: model,
    provider: providerOptions(provider, apiKey),
    
    mcp: existsSync(mcpServer)
      ? {
          crewcode: {
            type: "local",
            command: ["node", mcpServer],
            environment: { CREW_API: process.env.API_BASE ?? "http://localhost:4100", ...(owner ? { CREW_OWNER: owner } : {}) },
            enabled: true,
          },
        }
      : undefined,
    default_agent: role,
    permission: permissions(role),
    agent: {
      [role]: {
        model,
        description: role === "integrator" ? "CrewCode central integration agent" : "CrewCode teammate agent",
        prompt,
        permission: permissions(role),
      },
    },
  };
  return base;
}

export async function buildProfile(role: "crew" | "integrator", owner?: string): Promise<{ path: string; model: string; configured: boolean }> {
  const s = await getProviderSettings();
  const key = s.has_key ? await rawKey() : "";
  const configured = !!s.provider && !!s.model;
  const cfg = buildConfig({ role, provider: s.provider, model: s.model || "opencode-go/deepseek-v4.1-flash", apiKey: key, owner });
  mkdirSync(PROFILE_DIR, { recursive: true });
  const safeOwner = owner ? `-${owner.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 32)}` : "";
  const path = join(PROFILE_DIR, `${role}${safeOwner}.jsonc`);
  writeFileSync(path, JSON.stringify(cfg, null, 2), "utf8");
  return { path, model: cfg.model, configured };
}


export async function profileEnv(role: "crew" | "integrator", owner?: string): Promise<{ OPENCODE_CONFIG: string; [k: string]: string }> {
  const { path, model } = await buildProfile(role, owner);
  return { OPENCODE_CONFIG: path, CREW_MODEL: model };
}
