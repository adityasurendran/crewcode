// Cloudflare Quick Tunnel manager — exposes the single CrewCode server
// (UI + API on one port) on a public https://*.trycloudflare.com URL. No account needed.
// Requires the `cloudflared` binary on PATH (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
import { spawn, ChildProcess } from "node:child_process";

export type TunnelStatus = {
  running: boolean;
  installed: boolean;
  ready: boolean;
  url: string | null;
  pid: number | null;
  started_at: string | null;
  target: string;
};

let proc: ChildProcess | null = null;
let cachedUrl: string | null = null;
let startedAt: string | null = null;
let verified = false;
let verifyTimer: ReturnType<typeof setTimeout> | null = null;

export function targetUrl(): string {
  // One server serves both the UI and the API, so the tunnel points at it.
  const port = process.env.PORT ?? process.env.API_PORT ?? "4100";
  return process.env.TUNNEL_TARGET ?? `http://localhost:${port}`;
}

// Extract https://xxx.trycloudflare.com from cloudflared log lines.
export function parseTunnelUrl(line: string): string | null {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

export async function isInstalled(): Promise<boolean> {
  const { execSync } = await import("node:child_process");
  try {
    execSync(`${process.env.CLOUDFLARED_BIN ?? "cloudflared"} --version`, { stdio: "pipe", timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export function status(): TunnelStatus {
  const alive = !!proc && proc.exitCode === null && !proc.killed;
  return {
    running: alive,
    installed: true, // refined by /share/tunnel/status which calls isInstalled()
    ready: alive && !!cachedUrl && verified,
    url: alive ? cachedUrl : null,
    pid: alive ? (proc!.pid ?? null) : null,
    started_at: alive ? startedAt : null,
    target: targetUrl(),
  };
}

// Quick tunnels publish a hostname before DNS/TLS is ready; this network can
// take 30–60s. Keep checking in the background so status becomes "ready"
// without holding the Start button hostage.
function scheduleVerify(url: string) {
  if (verifyTimer) clearTimeout(verifyTimer);
  let attempts = 0;
  const tick = async () => {
    if (!proc || cachedUrl !== url) return;
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        verified = true;
        return;
      }
    } catch {}
    attempts++;
    if (attempts < 60) verifyTimer = setTimeout(tick, 3000);
  };
  verifyTimer = setTimeout(tick, 1500);
}

export async function start(): Promise<TunnelStatus> {
  if (proc && proc.exitCode === null && !proc.killed) return status();
  const bin = process.env.CLOUDFLARED_BIN ?? "cloudflared";
  if (!(await isInstalled())) {
    throw new Error(
      "cloudflared not found on PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    );
  }
  cachedUrl = null;
  proc = spawn(bin, ["tunnel", "--no-autoupdate", "--url", targetUrl()], { stdio: ["ignore", "pipe", "pipe"] });
  startedAt = new Date().toISOString();
  verified = false;

  const onData = (buf: Buffer) => {
    const found = parseTunnelUrl(buf.toString());
    if (found) cachedUrl = found;
  };
  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);
  proc.on("exit", () => {
    proc = null;
  });

  // Wait up to 25s for the URL to appear in logs.
  const deadline = Date.now() + 25_000;
  while (!cachedUrl && Date.now() < deadline) {
    if (!proc || proc.exitCode !== null) throw new Error("cloudflared exited before publishing a URL");
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!cachedUrl) throw new Error("timed out waiting for trycloudflare.com URL (check network/firewall)");

  // Give the first public check a short head start, then let it continue in
  // the background; the Share page polls until the link is live.
  const url = cachedUrl;
  scheduleVerify(url);
  const verifyUntil = Date.now() + 8000;
  while (!verified && Date.now() < verifyUntil) {
    if (!proc || proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return status();
}

export async function stop(): Promise<TunnelStatus> {
  try {
    proc?.kill("SIGTERM");
  } catch {}
  if (verifyTimer) clearTimeout(verifyTimer);
  verifyTimer = null;
  proc = null;
  cachedUrl = null;
  startedAt = null;
  verified = false;
  return status();
}
