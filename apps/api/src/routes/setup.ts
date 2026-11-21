import { Router } from "express";
import { z } from "zod";
import { fullStatus, installTool, installAllMissing, ensureBinDir, BIN_DIR } from "../lib/prereqs.js";

export const setupRouter = Router();


setupRouter.get("/status", async (_req, res) => {
  try {
    res.json({ bin_dir: BIN_DIR, tools: await fullStatus(), autopilot: process.env.AUTOPILOT !== "0" });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 300) });
  }
});


setupRouter.post("/install", async (req, res) => {
  const parsed = z.object({ tool: z.enum(["node", "cloudflared", "opencode", "git", "docker"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  ensureBinDir();
  res.json({ tool: parsed.data.tool, ...(await installTool(parsed.data.tool)) });
});


setupRouter.post("/install-all", async (_req, res) => {
  ensureBinDir();
  const results = await installAllMissing();
  const { fullStatus: fs } = await import("../lib/prereqs.js");
  res.json({ results, tools: await fs() });
});


setupRouter.post("/db-up", async (_req, res) => {
  const { execSync } = await import("node:child_process");
  try {
    const out = execSync(`docker compose up -d postgres redis`, { stdio: "pipe", timeout: 120_000 }).toString();
    res.json({ ok: true, log: out.slice(-2000) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: "docker compose failed — is Docker Desktop running? https://www.docker.com/products/docker-desktop/" });
  }
});
