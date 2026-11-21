import { Router } from "express";
import { resolve } from "node:path";
import { query } from "../lib/db.js";
import { queryWithOrg } from "../lib/db-rls.js";
import { ensureProjectRepo } from "../lib/project-repo.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (req, res) => {
  if ((req as any).guest) {
    const rows = await query(`select * from projects where id=$1`, [(req as any).projectId]);
    return res.json(rows);
  }
  const orgId = (req as any).orgId ?? null;
  if (orgId) {
    res.json(await queryWithOrg(`select * from projects order by created_at desc`, [], orgId));
  } else {
    res.json(await query(`select * from projects order by created_at desc`));
  }
});

projectsRouter.post("/", async (req, res) => {
  const { org_id, name, repo_url, template_slug } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });

  let repo = repo_url;
  if (template_slug && !repo_url) {
    const tpl = (await query<any>(`select repo_url from templates where slug=$1`, [template_slug]))[0];
    if (!tpl) return res.status(400).json({ error: `unknown template ${template_slug}` });
    repo = tpl.repo_url;
  }
  // Non-technical users don't pick frameworks — everyone starts from one
  // internal starter. The template concept is no longer surfaced.
  if (!repo) repo = "templates/next-supabase";

  const rows = await query(`insert into projects (org_id, name, repo_url) values ($1,$2,$3) returning *`, [
    org_id ?? null,
    name,
    repo,
  ]);
  let created = rows[0];
  // Give the project its own folder immediately, seeded from the starter.
  try {
    await ensureProjectRepo(created.id, created.repo_url);
    created = (await query(`select * from projects where id=$1`, [created.id]))[0] ?? created;
  } catch {}
  res.json({ ...created, template: template_slug ?? null });
});

projectsRouter.get("/:id/graph", async (req, res) => {
  const { buildGraph } = await import("@crewcode/graph");
  const graph = await buildGraph(String(req.params.id));
  res.json(graph);
});

// DELETE /projects/:id — remove the project and its data (threads, notes,
// tasks, events, artifacts, connections, shares, worktrees/branches).
projectsRouter.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  const rows = await query<any>(`select * from projects where id=$1`, [id]);
  if (!rows.length) return res.status(404).json({ error: "project not found" });

  // Best-effort git cleanup (worktrees + project branches).
  try {
    const { resolveRepoRoot } = await import("../lib/sandbox.js");
    const { execSync } = await import("node:child_process");
    const { existsSync } = await import("node:fs");
    const repo = await resolveRepoRoot(id).catch(() => "");
    if (repo && existsSync(repo)) {
      const threads = await query<any>(`select id from threads where project_id=$1`, [id]).catch(() => []);
      for (const t of threads) {
        const dir = resolve(`.crew/worktrees/thread-${t.id}`);
        try {
          execSync(`git -C "${repo}" worktree remove --force "${dir}"`, { stdio: "pipe" });
        } catch {}
      }
      try {
        execSync(`git -C "${repo}" worktree prune`, { stdio: "pipe" });
      } catch {}
      try {
        const prefix = `crew/${id.slice(0, 8)}/`;
        const out = execSync(`git -C "${repo}" for-each-ref --format=%(refname:short) refs/heads/${prefix}`, { stdio: "pipe" }).toString();
        for (const br of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
          try {
            execSync(`git -C "${repo}" branch -D "${br}"`, { stdio: "pipe" });
          } catch {}
        }
      } catch {}
    }
  } catch {}

  const children = `(select id from tasks where project_id=$1)`;
  await query(`delete from messages where thread_id in (select id from threads where project_id=$1)`, [id]).catch(() => {});
  await query(`delete from events where task_id in ${children}`, [id]).catch(() => {});
  await query(`delete from artifacts where task_id in ${children} or meta->>'project_id'=$1`, [id]).catch(() => {});
  await query(`delete from threads where project_id=$1`, [id]).catch(() => {});
  await query(`delete from notes where project_id=$1`, [id]).catch(() => {});
  await query(`delete from tasks where project_id=$1`, [id]).catch(() => {});
  await query(`delete from api_connections where project_id=$1`, [id]).catch(() => {});
  await query(`delete from vault_secrets where project_id=$1`, [id]).catch(() => {});
  await query(`delete from shares where project_id=$1`, [id]).catch(() => {});
  await query(`delete from project_api_keys where project_id=$1`, [id]).catch(() => {});
  await query(`delete from cost_mapping where project_id=$1`, [id]).catch(() => {});
  await query(`delete from projects where id=$1`, [id]);
  // Remove the project's managed working copy (never an external checkout).
  try {
    const { existsSync, rmSync } = await import("node:fs");
    const local = resolve(process.cwd(), ".crew", "projects", String(id).replace(/[^a-zA-Z0-9-]/g, ""));
    if (existsSync(local)) rmSync(local, { recursive: true, force: true });
  } catch {}
  res.json({ ok: true });
});
