

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const EXE = process.platform === "win32" ? "opencode.exe" : "opencode";

export function opencodeBin(): string {
  const env = process.env.CREW_OPENCODE_BIN;
  if (env && existsSync(env)) return env;
  const candidates = [
    
    process.env.CREW_ASSETS ? join(process.env.CREW_ASSETS, "opencode", EXE) : "",
    
    resolve(process.cwd(), "build", "opencode", EXE),
    resolve(process.cwd(), "..", "..", "build", "opencode", EXE),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return "opencode"; 
}


export function opencodeCmd(): string {
  const b = opencodeBin();
  return /\s/.test(b) ? `"${b}"` : b;
}
