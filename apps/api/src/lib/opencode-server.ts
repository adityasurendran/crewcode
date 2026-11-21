// OpenCode server lifecycle — ensure `opencode serve` is running for SDK calls.
// Start once per worker process; reuse across jobs.
import { execSync, spawn } from "node:child_process";

let serverStarted = false;
const OPENCODE_PORT = Number(process.env.OPENCODE_PORT ?? 4096);

export async function ensureOpenCodeServer(): Promise<void> {
  if (serverStarted) return;
  // Probe first — already running?
  try {
    const res = await fetch(`http://127.0.0.1:${OPENCODE_PORT}/global/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      serverStarted = true;
      return;
    }
  } catch {
    // not running — start it
  }
  try {
    const child = spawn("opencode", ["serve", "--port", String(OPENCODE_PORT)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    // Wait briefly for boot
    await new Promise((r) => setTimeout(r, 2500));
    serverStarted = true;
  } catch (e: any) {
    console.warn("[opencode-server] failed to start:", String(e?.message ?? e).slice(0, 200));
  }
}

export function opencodeServerUrl(): string {
  return `http://127.0.0.1:${OPENCODE_PORT}`;
}
