// E2B live file pull — list + download changed files from sandbox into .crew/sync/<taskId>/.
// Uses real @e2b/code-interpreter (files.read) now that dep is installed.
export async function pullFromSandbox(sandboxId: string, taskId: string, sandboxWorkdir = "/home/user/repo"): Promise<string[]> {
  let E2B: any;
  try {
    E2B = await import("@e2b/code-interpreter");
  } catch {
    throw new Error("e2b dep missing — npm install @e2b/code-interpreter -w crewcode-api");
  }
  const Sbx = E2B.Sandbox ?? E2B.default?.Sandbox;
  const sbx = await Sbx.connect(sandboxId);
  const out = await sbx.commands.run(`cd ${sandboxWorkdir} && git status --porcelain && git diff --name-only`);
  const files = out.stdout
    .split("\n")
    .map((l: string) => l.trim().replace(/^[MADRU?]\s*/, "").split(" ")[0])
    .filter(Boolean);
  const syncDir = `.crew/sync/${taskId}`;
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(syncDir, { recursive: true });
  const pulled: string[] = [];
  for (const f of files.slice(0, 100)) {
    try {
      const file = await sbx.files.read(`${sandboxWorkdir}/${f}`);
      writeFileSync(`${syncDir}/${f}`, file);
      pulled.push(f);
    } catch {
      // binary or deleted — skip
    }
  }
  // Also pull untracked new files
  const untracked = await sbx.commands.run(`cd ${sandboxWorkdir} && git ls-files --others --exclude-standard`).catch(() => ({ stdout: "" }));
  for (const f of untracked.stdout.split("\n").map((s: string) => s.trim()).filter(Boolean).slice(0, 50)) {
    try {
      const file = await sbx.files.read(`${sandboxWorkdir}/${f}`);
      writeFileSync(`${syncDir}/${f}`, file);
      pulled.push(f);
    } catch {}
  }
  return pulled;
}
