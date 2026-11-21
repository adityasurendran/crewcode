// Capability MCP proxy — the ONLY way agents touch shared APIs.
// Agent calls e.g. POST /capabilities/stripe.create_checkout {task_id, args}
// Proxy: loads task scopes + project api_connections, resolves secret server-side,
// calls provider, redacts logs, audits, enforces budget. Raw key never reaches agent.
import { Router } from "express";
import { query } from "./db.js";
import { audit } from "./audit.js";
import { checkBudget, addUsage } from "./budgets.js";
import { redactSecrets } from "./vault.js";
import { stripeCreateCheckout, supabaseQuery, supabaseSignup, supabaseUpload, supabaseWrite, supabaseDownload, supabaseRemove, mediaGenerateImage, emailSend, webFetchText, webSearch, safeErr } from "./providers.js";

export const capsRouter = Router();

// Estimated token cost per capability call (LLM + tool). Tune per model.
const COST: Record<string, number> = {
  "db.query_scoped": 500,
  "db.write": 1000,
  "auth.signup": 800,
  "stripe.create_checkout": 800,
  "storage.upload": 1200,
  "storage.download": 800,
  "storage.delete": 800,
  "media.generate_image": 1500,
  "email.send": 800,
  "web.fetch": 300,
  "web.search": 500,
  "llm.complete": 2000,
};

async function loadScope(taskId: string) {
  const tasks = await query(`select * from tasks where id=$1`, [taskId]);
  if (!tasks.length) throw new Error("unknown task");
  const task = tasks[0];
  const conns = await query(`select * from api_connections where project_id=$1`, [task.project_id]);
  return { task, conns };
}

capsRouter.post("/:tool", async (req, res) => {
  const { tool } = req.params;
  const { task_id, args } = req.body ?? {};
  if (!task_id || !tool) return res.status(400).json({ error: "task_id + tool required" });

  try {
    const budget = await checkBudget(task_id);
    if (!budget.ok) return res.status(402).json({ error: "token budget exceeded", ...budget });

    const { task, conns } = await loadScope(task_id);
    const allow: string[] = JSON.parse(typeof task.allowlist === "string" ? task.allowlist : JSON.stringify(task.allowlist ?? []));
    // allowlist entries like "db.users:read", "stripe:write", or capability names
    const toolRoot = tool.split(".")[0]; // db | auth | stripe | storage | llm
    const permitted =
      allow.length === 0 ||
      allow.some((a) => a === tool || a.startsWith(toolRoot) || a === `${toolRoot}:*`);
    if (!permitted) {
      await audit(task.project_id, `task:${task_id}`, "capability.denied", { tool });
      return res.status(403).json({ error: `task not permitted for ${tool}` });
    }

    let result: unknown;
    switch (tool) {
      case "db.query_scoped": {
        const sql: string = args?.sql ?? "";
        const isWrite = /^\s*(insert|update|delete|drop|alter|create)\b/i.test(sql);
        if (isWrite && !allow.some((a) => a.includes(":write") || a.includes("db"))) {
          return res.status(403).json({ error: "write queries require :write scope" });
        }
        const conn = conns.find((c: any) => c.provider === "supabase");
        try {
          result = conn
            ? await supabaseQuery(conn.vault_ref, args ?? {})
            : { stub: true, note: "connect supabase in /connections for live reads", sql: sql.slice(0, 500) };
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "stripe.create_checkout": {
        const conn = conns.find((c: any) => c.provider === "stripe");
        if (!conn) return res.status(400).json({ error: "stripe not connected for project" });
        try {
          result = await stripeCreateCheckout(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "llm.complete": {
        // One model backend: the crew's mandated opencode-go model. No connection needed.
        // Runs in an empty temp dir so the agent cannot touch project files.
        try {
          const { opencodeComplete } = await import("./opencode-complete.js");
          const { tmpdir } = await import("node:os");
          const { join } = await import("node:path");
          const { mkdirSync } = await import("node:fs");
          const sandboxDir = join(tmpdir(), "crewcode-llm");
          mkdirSync(sandboxDir, { recursive: true });
          result = await opencodeComplete(String(args?.prompt ?? ""), { cwd: sandboxDir, timeoutMs: 180_000 });
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "auth.signup": {
        const conn = conns.find((c: any) => c.provider === "supabase");
        if (!conn) return res.status(400).json({ error: "supabase not connected for project" });
        try {
          result = await supabaseSignup(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "db.write": {
        if (!allow.some((a) => a.includes(":write") || a.includes("db"))) {
          return res.status(403).json({ error: "db writes require :write scope" });
        }
        const conn = conns.find((c: any) => c.provider === "supabase");
        if (!conn) return res.status(400).json({ error: "supabase not connected for project" });
        try {
          result = await supabaseWrite(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "storage.download": {
        const conn = conns.find((c: any) => c.provider === "supabase");
        if (!conn) return res.status(400).json({ error: "supabase not connected for project" });
        try {
          result = await supabaseDownload(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "storage.delete": {
        if (!allow.some((a) => a.includes(":write") || a.includes("storage"))) {
          return res.status(403).json({ error: "deletes require :write scope" });
        }
        const conn = conns.find((c: any) => c.provider === "supabase");
        if (!conn) return res.status(400).json({ error: "supabase not connected for project" });
        try {
          result = await supabaseRemove(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "media.generate_image": {
        // Keyless — art lands in the task's own public/generated/ dir.
        try {
          result = await mediaGenerateImage("", { ...(args ?? {}), task_id });
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "email.send": {
        // Real people get real email — :write scope required.
        if (!allow.some((a) => a.includes(":write") || a.includes("email"))) {
          return res.status(403).json({ error: "sending email requires :write scope" });
        }
        const conn = conns.find((c: any) => c.provider === "resend");
        if (!conn) return res.status(400).json({ error: "resend not connected for project" });
        try {
          result = await emailSend(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "web.fetch": {
        try {
          result = await webFetchText(args?.url ?? "");
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "web.search": {
        try {
          result = await webSearch(args?.query ?? "");
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      case "storage.upload": {
        const conn = conns.find((c: any) => c.provider === "supabase");
        if (!conn) return res.status(400).json({ error: "supabase not connected for project" });
        if (!allow.some((a) => a.includes(":write") || a.includes("storage"))) {
          return res.status(403).json({ error: "uploads require :write scope" });
        }
        try {
          result = await supabaseUpload(conn.vault_ref, args ?? {});
        } catch (e: any) {
          return res.status(502).json({ error: safeErr(e) });
        }
        break;
      }
      default:
        return res.status(404).json({ error: `unknown capability ${tool}` });
    }

    await addUsage(task_id, COST[tool] ?? 500);
    await audit(task.project_id, `task:${task_id}`, `capability.${tool}`, { args, ok: true });
    res.json({ ok: true, tool, result });
  } catch (e: any) {
    res.status(500).json({ error: redactSecrets(String(e?.message ?? e)) });
  }
});
