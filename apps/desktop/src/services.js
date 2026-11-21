"use strict";




const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..", "..", "..");



const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


function probe(port, host = "127.0.0.1", timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: "/health", method: "GET", timeout: timeoutMs }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve(res.statusCode === 200));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      try { req.destroy(); } catch {}
      resolve(false);
    });
    req.end();
  });
}

async function waitForHealth(port, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await probe(port)) return true;
    await sleep(500);
  }
  return false;
}



function spawnNode(label, args, extraEnv = {}, cwd = ROOT) {
  const electronNode = process.versions && process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...electronNode, ...extraEnv },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.__label = label;
  child.stdout?.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
  child.on("exit", (code) => process.stdout.write(`[${label}] exited (${code})\n`));
  return child;
}

function killTree(child) {
  if (!child || child.killed || child.pid == null) return;
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
  try { child.kill(); } catch {}
}







async function startBackend({ port, spawnWorkers = true, serverDir = "", cwd = ROOT } = {}) {
  if (await probe(port)) return { attached: true, children: [] };

  let apiArgs, agentArgs, mergeArgs;
  if (serverDir) {
    apiArgs = [path.join(serverDir, "index.cjs")];
    agentArgs = [path.join(serverDir, "agentWorker.cjs")];
    mergeArgs = [path.join(serverDir, "mergeWorker.cjs")];
  } else {
    apiArgs = [TSX_CLI, path.join(ROOT, "apps", "api", "src", "index.ts")];
    agentArgs = [TSX_CLI, path.join(ROOT, "apps", "api", "src", "workers", "agentWorker.ts")];
    mergeArgs = [TSX_CLI, path.join(ROOT, "apps", "api", "src", "workers", "mergeWorker.ts")];
  }

  const children = [];
  children.push(spawnNode("api", apiArgs, { PORT: String(port) }, cwd));

  const ok = await waitForHealth(port, 90);
  if (!ok) {
    children.forEach(killTree);
    throw new Error(`backend did not become healthy on :${port} within 90s`);
  }

  if (spawnWorkers) {
    children.push(spawnNode("agent", agentArgs, {}, cwd));
    children.push(spawnNode("merge", mergeArgs, {}, cwd));
  }

  return { attached: false, children };
}

function stopBackend(children = []) {
  for (const c of children) killTree(c);
}

module.exports = { ROOT, probe, waitForHealth, startBackend, stopBackend, killTree };
