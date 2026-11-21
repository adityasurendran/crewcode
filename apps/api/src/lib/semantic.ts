



import { safeErr } from "./providers.js";
import { audit } from "./audit.js";
import { redactSecrets } from "./vault.js";
import { opencodeComplete } from "./opencode-complete.js";

export type Conflict = { field: string; from: string; to: string };



export function detectRenames(failingLog: string): Conflict[] {
  const renames: Conflict[] = [];
  
  const patterns = [
    /(?:property |column |field )['"`]?(\w+)['"`]?(?:\s+does not exist|\s+is not defined|undefined)/gi,
    /Cannot read properties of undefined \(reading ['"`](\w+)['"`]\)/gi,
  ];
  const seen = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(failingLog))) {
      const field = m[1];
      if (field && !seen.has(field)) {
        seen.add(field);
        renames.push({ field, from: field, to: `${field}_id` }); 
      }
    }
  }
  return renames;
}

export async function semanticPatch(opts: {
  taskId: string;
  failingLog: string;
  graphSlice: string;
  projectId: string;
  retry: number;
}): Promise<{ ok: boolean; note: string; code?: string }> {
  const renames = detectRenames(opts.failingLog);
  const renameList = renames.map((r) => `  ${r.from} -> ${r.to}`).join("\n") || "  (none auto-detected — infer from log)";

  const prompt = `Integration failed for task ${opts.taskId}.
Suspected field renames (schema-owner may have changed these):
${renameList}

Failing log (last 3000 chars):
${redactSecrets(opts.failingLog.slice(-3000))}

Project slice:
${opts.graphSlice}

Return ONLY the minimal file patches as JSON array:
[{ "path": "src/auth/login.tsx", "find": "user.id", "replace": "user.user_id" }]
No prose. No refactors. If nothing to patch return [].`;

  try {
    
    
    const workdir = `.crew/worktrees/${opts.taskId}`;
    const { text } = await opencodeComplete(prompt, { cwd: workdir, timeoutMs: 300_000 });
    const patches: any[] = JSON.parse(text.trim().replace(/```json/g, "").replace(/```/g, "").trim());
    if (!Array.isArray(patches) || !patches.length) {
      return { ok: false, note: `LLM returned no patches (retry ${opts.retry}/2) — blocked for human` };
    }
    
    const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
    let applied = 0;
    for (const p of patches) {
      const fp = `${workdir}/${p.path}`;
      if (!existsSync(fp)) continue;
      const src = readFileSync(fp, "utf8");
      if (src.includes(p.find)) {
        writeFileSync(fp, src.split(p.find).join(p.replace));
        applied++;
      }
    }
    await audit(opts.projectId, "integration", "semantic.patch.applied", { task_id: opts.taskId, applied, patches: patches.length });
    return { ok: applied > 0, note: `applied ${applied}/${patches.length} patches (retry ${opts.retry}/2)`, code: text.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, note: `semantic patch error: ${safeErr(e)} (retry ${opts.retry}/2)` };
  }
}
