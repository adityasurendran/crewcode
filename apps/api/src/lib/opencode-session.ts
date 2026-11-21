// OpenCode session runner — real SDK sessions in the task workdir.
// Spawns/reuses opencode serve, creates a session per task, streams objective,
// returns structured completion. Falls back to `opencode run` if SDK/session fails.
import { ensureOpenCodeServer, opencodeServerUrl } from "./opencode-server.js";
import { opencodeCmd } from "./opencode-bin.js";

export type SessionResult = { ok: boolean; note: string; sessionId?: string };

export async function runOpenCodeSession(workdir: string, objective: string, systemContext?: string): Promise<SessionResult> {
  await ensureOpenCodeServer().catch(() => {});
  const base = opencodeServerUrl();
  try {
    const sdk: any = await import("@opencode-ai/sdk");
    const create = sdk.createOpencodeClient ?? sdk.default?.createOpencodeClient;
    if (typeof create !== "function") return { ok: false, note: "sdk create not found" };
    const client = create({ baseUrl: base });

    // Create a session rooted in the task workdir.
    const session = await client.session.create({ directory: workdir });
    const sessionId = session?.id ?? session?.sessionID;
    if (!sessionId) return { ok: false, note: "no session id" };

    const prompt = systemContext ? `${systemContext}\n\n${objective}` : objective;
    await client.session.prompt({
      sessionID: sessionId,
      parts: [{ type: "text", text: prompt }],
    });

    return { ok: true, note: "session completed", sessionId };
  } catch (e: any) {
    return { ok: false, note: `session failed: ${String(e?.message ?? e).slice(0, 300)}` };
  }
}

// Shell fallback — used when SDK session unavailable.
export async function runOpenCodeShell(workdir: string, objective: string): Promise<SessionResult> {
  const { execSync } = await import("node:child_process");
  try {
    execSync(`${opencodeCmd()} run "${objective.replace(/"/g, "'")}"`, {
      cwd: workdir,
      stdio: "pipe",
      timeout: 600_000,
      env: { ...process.env, OPENCODE_PERMISSION: "deny:git push,deny:read:.env*" },
    });
    return { ok: true, note: "shell completed" };
  } catch (e: any) {
    return { ok: false, note: `shell failed: ${String(e?.message ?? e).slice(0, 300)}` };
  }
}
