// Resolve the opencode executable. Prefers an explicitly configured or bundled
// binary (packaged app ships its own), and falls back to `opencode` on PATH.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const EXE = process.platform === "win32" ? "opencode.exe" : "opencode";

export function opencodeBin(): string {
  const env = process.env.CREW_OPENCODE_BIN;
  if (env && existsSync(env)) return env;
  const candidates = [
    // Packaged app: <resources>/opencode/opencode.exe
    process.env.CREW_ASSETS ? join(process.env.CREW_ASSETS, "opencode", EXE) : "",
    // Dev: repo build/opencode/opencode.exe
    resolve(process.cwd(), "build", "opencode", EXE),
    resolve(process.cwd(), "..", "..", "build", "opencode", EXE),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return "opencode"; // PATH
}

// Shell-safe form for command strings (quotes paths that contain spaces).
export function opencodeCmd(): string {
  const b = opencodeBin();
  return /\s/.test(b) ? `"${b}"` : b;
}
