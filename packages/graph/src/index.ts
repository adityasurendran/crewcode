// Project graph — structured context for agents, not raw file dumps.
// Phase 0: fast static scan (routes/components/schema/deps). Phase 1: cache in Postgres+S3 + watcher.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ProjectGraph = {
  projectId: string;
  routes: string[];
  components: string[];
  schema: string[];
  dependencies: Record<string, string>;
  tasksActive: unknown[];
  generatedAt: string;
};

async function walk(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 4) return out;
  let entries: any[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, depth + 1);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

export async function buildGraph(projectId: string, repoRoot = process.cwd()): Promise<ProjectGraph> {
  const files = await walk(repoRoot);
  const routes = files.filter((f) => f.includes("route") || f.includes("app/") || f.includes("pages/")).slice(0, 100);
  const components = files.filter((f) => f.includes("component")).slice(0, 100);
  let dependencies: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    dependencies = { ...pkg.dependencies };
  } catch {}
  let schema: string[] = [];
  for (const cand of ["prisma/schema.prisma", "drizzle/schema.ts", "supabase/schema.sql"]) {
    try {
      const s = await stat(join(repoRoot, cand));
      if (s.isFile()) schema.push(cand);
    } catch {}
  }
  return { projectId, routes, components, schema, dependencies, tasksActive: [], generatedAt: new Date().toISOString() };
}

export function sliceForTask(g: ProjectGraph, allowlist: string[]): string {
  const scope = allowlist.length ? allowlist.join(", ") : "full repo";
  return `CREWCODE.md — scope: ${scope}\nroutes: ${g.routes.slice(0, 20).join(", ")}\nschema: ${g.schema.join(", ") || "none detected"}\ndeps: ${Object.keys(g.dependencies).slice(0, 20).join(", ")}`;
}
