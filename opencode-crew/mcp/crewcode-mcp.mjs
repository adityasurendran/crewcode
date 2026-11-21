#!/usr/bin/env node
// CrewCode capability MCP server — the ONLY sanctioned way for opencode agents
// to touch shared services. Forwards to POST /capabilities/:tool on the host
// API, which enforces per-task scopes, token budgets, vault secrets and audit.
//
// Spawned by opencode from the CrewCode profile (`mcp.crewcode`), one instance
// per teammate server with CREW_OWNER set. Plain Node, no build step.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = process.env.CREW_API ?? "http://localhost:4100";
const OWNER = process.env.CREW_OWNER ?? "unknown";

const server = new McpServer({ name: "crewcode", version: "0.1.0" });

server.registerTool(
  "crewcode_capability",
  {
    title: "CrewCode shared capability",
    description:
      "Call a project capability for a task: db.query_scoped (scoped DB reads), stripe.create_checkout, llm.complete. " +
      "Secrets stay server-side; usage is metered against the task budget. NEVER paste API keys — use this tool instead.",
    inputSchema: {
      tool: z.enum(["db.query_scoped", "stripe.create_checkout", "llm.complete"]).describe("capability name"),
      task_id: z.string().min(1).optional().describe("CrewCode task id (optional — defaults to your latest running task)"),
      args: z.record(z.any()).optional().describe("tool arguments (sql/table/select, amount_cents, prompt, ...)"),
    },
  },
  async ({ tool, task_id, args }) => {
    let status = 0;
    let text = "";
    let tid = task_id;
    if (!tid) {
      try {
        const list = await fetch(`${API}/agent-activity?owner_id=${encodeURIComponent(OWNER)}`).then((r) => r.json());
        const agents = list?.agents ?? [];
        tid = agents.find((a) => a.status === "running" || a.status === "testing")?.id ?? agents[0]?.id;
      } catch {}
      if (!tid) {
        return { content: [{ type: "text", text: "crewcode: no task_id given and no running task found for this owner" }], isError: true };
      }
    }
    try {
      const res = await fetch(`${API}/capabilities/${tool}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: tid, args: { ...(args ?? {}), _owner: OWNER } }),
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      return { content: [{ type: "text", text: `crewcode: API unreachable (${API}): ${String(e?.message ?? e).slice(0, 200)}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `crewcode ${tool} → status=${status} ${text.slice(0, 3500)}` }],
      isError: status < 200 || status >= 300,
    };
  }
);

await server.connect(new StdioServerTransport());
