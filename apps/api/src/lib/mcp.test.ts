import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";

const SERVER = join(process.cwd(), "opencode-crew", "mcp", "crewcode-mcp.mjs");

function rpc(proc: any, msg: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("mcp timeout")), 15000);
    const onData = (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          const j = JSON.parse(t);
          if (j.id === (msg as any).id) {
            clearTimeout(timer);
            proc.stdout.off("data", onData);
            resolve(j);
          }
        } catch {}
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(msg) + "\n");
  });
}

describe("crewcode MCP server", () => {
  it("advertises crewcode_capability over stdio", async () => {
    const proc = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CREW_API: "http://127.0.0.1:9", CREW_OWNER: "test" } });
    try {
      const init = await rpc(proc, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
      });
      assert.ok(init.result?.serverInfo?.name === "crewcode", `unexpected init: ${JSON.stringify(init).slice(0, 200)}`);
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      const tools = await rpc(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const names = (tools.result?.tools ?? []).map((t: any) => t.name);
      assert.ok(names.includes("crewcode_capability"), `tools: ${names.join(",")}`);
    } finally {
      proc.kill();
    }
  });
});
