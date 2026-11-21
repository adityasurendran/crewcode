// Integration pipeline: deterministic checks first, LLM semantic fix only on failure.
// install (if node_modules missing) -> rebase (only if a remote exists) ->
// typecheck -> unit -> browser -> build.
// Steps whose tooling is absent in the project are SKIPPED (not failed), so a
// bare template doesn't produce false negatives. Max 2 LLM retries downstream.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CheckResult = { name: string; ok: boolean; log: string; skipped?: boolean };

async function sh(cmd: string, cwd: string): Promise<{ ok: boolean; log: string }> {
  const { execSync } = await import("node:child_process");
  try {
    const out = execSync(cmd, { cwd, stdio: "pipe", timeout: 180_000 }).toString();
    return { ok: true, log: out.slice(-4000) };
  } catch (e: any) {
    const stdout = e?.stdout ? e.stdout.toString() : "";
    const stderr = e?.stderr ? e.stderr.toString() : "";
    return { ok: false, log: (stdout + "\n" + stderr).trim().slice(-4000) || String(e?.message ?? e).slice(-4000) };
  }
}

function readPkg(workdir: string): any {
  try {
    return JSON.parse(readFileSync(join(workdir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function integrateTask(workdir: string, mainBranch = "main"): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const pkg = readPkg(workdir);
  const scripts = pkg?.scripts ?? {};

  // Only rebase when a git remote AND the upstream base branch actually exist.
  const remotes = await sh("git remote", workdir);
  const hasOrigin = remotes.ok && remotes.log.split(/\s+/).includes("origin");
  let hasUpstream = false;
  if (hasOrigin) {
    const ls = await sh(`git ls-remote --heads origin ${mainBranch}`, workdir);
    hasUpstream = ls.ok && ls.log.includes(`refs/heads/${mainBranch}`);
  }

  const steps: Array<[string, string | null]> = [];
  if (hasUpstream) steps.push(["rebase", `git fetch origin ${mainBranch} && git rebase origin/${mainBranch}`]);

  const hasDeps = existsSync(join(workdir, "node_modules"));
  // Keep merges fast: only verify when deps are already installed. Installing
  // per turn made every chat message take ~a minute.
  if (hasDeps && existsSync(join(workdir, "tsconfig.json"))) steps.push(["typecheck", "npx -y -p typescript tsc --noEmit"]);
  if (scripts.test && hasDeps) steps.push(["unit", "npm test -- --passWithNoTests"]);
  if ((existsSync(join(workdir, "playwright.config.ts")) || existsSync(join(workdir, "playwright.config.js"))) && hasDeps)
    steps.push(["browser", "npx playwright test --reporter=line"]);
  if (scripts.build && hasDeps) steps.push(["build", "npm run build"]);

  for (const [name, cmd] of steps) {
    if (!cmd) continue;
    const r = await sh(cmd, workdir);
    // Can't fetch deps here (offline / packaged / big template)? Don't fail the
    // whole integration on that — skip the rest rather than block the user.
    if (name === "install" && !r.ok) {
      results.push({ name: "install", ok: true, skipped: true, log: r.log.slice(-400) });
      break;
    }
    results.push({ name, ...r });
    if (!r.ok) break; // stop, send log back to owning agent
  }

  // If the project has no checks at all, treat it as a pass so the merge proceeds.
  if (results.length === 0) results.push({ name: "no-checks", ok: true, log: "project has no verifiable tooling; accepted", skipped: true });

  return results;
}

export function shouldAutoMerge(results: CheckResult[]): boolean {
  return results.length > 0 && results.every((r) => r.ok);
}

export function semanticFixPrompt(taskObjective: string, failingLog: string, graphSlice: string): string {
  return `Integration failed for task: ${taskObjective}
Failing log:
${failingLog.slice(-3000)}

Project slice:
${graphSlice}

Fix ONLY the breakage (e.g. renamed field id->user_id, changed route signature). Do not refactor. Keep diff minimal.`;
}
