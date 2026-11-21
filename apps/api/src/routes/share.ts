import { Router } from "express";
import { z } from "zod";
import { query } from "../lib/db.js";
import * as tunnel from "../lib/tunnel.js";
import { createShare, resolveShareByPin, issueGuestToken, revokeShare, listShares, checkAttempts, recordFailedAttempt, clearAttempts } from "../lib/share.js";

export const shareRouter = Router();

// ---- Tunnel ----

// GET /share/tunnel/status
shareRouter.get("/tunnel/status", async (_req, res) => {
  const s = tunnel.status();
  const installed = await tunnel.isInstalled().catch(() => false);
  res.json({ ...s, installed });
});

// POST /share/tunnel/start — spawn cloudflared quick tunnel for the web UI
shareRouter.post("/tunnel/start", async (_req, res) => {
  try {
    const s = await tunnel.start();
    res.json({ ok: true, ...s, installed: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 500) });
  }
});

// POST /share/tunnel/stop
shareRouter.post("/tunnel/stop", async (_req, res) => {
  res.json({ ok: true, ...(await tunnel.stop()) });
});

// ---- Shares ----

// POST /share {project_id, hours?} — host creates a PIN (tunnel auto-starts)
shareRouter.post("/", async (req, res) => {
  const parsed = z.object({ project_id: z.string().uuid(), hours: z.number().min(1).max(72).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const actor = (req as any).actor ?? "host";

  let tunnelUrl = tunnel.status().url;
  if (!tunnelUrl) {
    try {
      tunnelUrl = (await tunnel.start()).url;
    } catch (e: any) {
      return res.status(500).json({ error: `tunnel failed: ${String(e?.message ?? e).slice(0, 300)}` });
    }
  }
  const share = await createShare(parsed.data.project_id, actor, tunnelUrl!, parsed.data.hours);
  res.json({
    ok: true,
    pin: share.pin,
    tunnel_url: share.tunnel_url,
    share_url: `${String(share.tunnel_url ?? "").replace(/\/$/, "")}/share`,
    expires_at: share.expires_at,
    share_id: share.id,
  });
});

// GET /share/list?project_id= — host lists active shares (no PINs).
// (Kept off the bare /share root so the built web Share page can be served there.)
shareRouter.get("/list", async (req, res) => {
  const { project_id } = req.query as { project_id?: string };
  if (!project_id) return res.status(400).json({ error: "project_id required" });
  res.json(await listShares(project_id));
});

// DELETE /share/:id — host revokes
shareRouter.delete("/:id", async (req, res) => {
  await revokeShare(String((req.params as any).id ?? ""), (req as any).actor ?? "host");
  res.json({ ok: true });
});

// Public: a guest with a PIN has no token yet, so this route is mounted before
// requireAuth. Everything else in this router is host-only.
export async function joinHandler(req: any, res: any) {
  const ip = String(req.headers["cf-connecting-ip"] ?? req.ip ?? req.socket?.remoteAddress ?? "unknown");
  const gate = await checkAttempts(ip);
  if (!gate.ok) return res.status(429).json({ error: "too many attempts — try again in 5 minutes", remaining: 0 });

  const { pin } = req.body ?? {};
  if (!pin || String(pin).trim().length !== 6) {
    await recordFailedAttempt(ip);
    return res.status(400).json({ error: "6-digit PIN required", remaining: gate.remaining - 1 });
  }
  const share = await resolveShareByPin(String(pin));
  if (!share) {
    await recordFailedAttempt(ip);
    const after = await checkAttempts(ip);
    return res.status(404).json({ error: "invalid or expired PIN", remaining: after.remaining });
  }
  await clearAttempts(ip);
  const ttlSec = Math.max(60, Math.floor((new Date(share.expires_at).getTime() - Date.now()) / 1000));
  const guest_token = await issueGuestToken(share.id, share.project_id, ttlSec);
  const tasks = await query(`select id, owner_id, objective, status from tasks where project_id=$1 order by created_at desc limit 20`, [share.project_id]);
  res.json({
    ok: true,
    guest_token,
    project_id: share.project_id,
    project_name: share.project_name,
    tunnel_url: share.tunnel_url,
    share_url: `${String(share.tunnel_url ?? "").replace(/\/$/, "")}/share`,
    expires_at: share.expires_at,
    tasks,
  });
}
