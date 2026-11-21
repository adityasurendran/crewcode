import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import { parseRepoUrl, createPR, getPRChecks } from "../lib/github.js";
import { audit } from "../lib/audit.js";

export const githubRouter = Router();

githubRouter.post("/import", async (req, res) => {
  const parsed = z.object({ org_id: z.string().optional(), name: z.string().min(1), repo_url: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  try {
    parseRepoUrl(parsed.data.repo_url);
  } catch (e: any) {
    return res.status(400).json({ error: String(e.message) });
  }
  const rows = await query(`insert into projects (org_id, name, repo_url) values ($1,$2,$3) returning *`, [
    parsed.data.org_id ?? null,
    parsed.data.name,
    parsed.data.repo_url,
  ]);
  await audit(rows[0].id, "user", "github.import", { repo_url: parsed.data.repo_url });
  res.json(rows[0]);
});


githubRouter.post("/export", async (req, res) => {
  const { task_id, title } = req.body ?? {};
  if (!task_id) return res.status(400).json({ error: "task_id required" });
  const tasks = await query(`select t.*, p.repo_url, p.id as pid from tasks t join projects p on p.id=t.project_id where t.id=$1`, [task_id]);
  if (!tasks.length) return res.status(404).json({ error: "task not found" });
  const t = tasks[0];
  try {
    const pr = await createPR({
      projectId: t.pid,
      repoUrl: t.repo_url,
      head: t.branch,
      title: title ?? `CrewCode: ${t.objective.slice(0, 60)}`,
      body: `Task ${t.id} — objective: ${t.objective}\n\nBranch \`${t.branch}\`.\n\n> Everyone builds. CrewCode integrates.`,
    });
    await query(`insert into artifacts (task_id, kind, uri, meta) values ($1,'pr',$2,$3)`, [
      task_id,
      pr.url,
      JSON.stringify({ number: pr.number }),
    ]);
    res.json({ ok: true, pr });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 1000) });
  }
});

githubRouter.get("/pr", async (req, res) => {
  const { repo_url, number } = req.query as { repo_url: string; number: string };
  if (!repo_url || !number) return res.status(400).json({ error: "repo_url + number required" });
  try {
    res.json(await getPRChecks(repo_url, Number(number)));
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 500) });
  }
});
