






import { execSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BIN_DIR = join(process.cwd(), ".crew", "bin");
export const NODE_WANT_MAJOR = 20;

export function ensureBinDir() {
  mkdirSync(BIN_DIR, { recursive: true });
  
  const cur = process.env.PATH ?? "";
  if (!cur.split(";").concat(cur.split(":")).includes(BIN_DIR)) {
    process.env.PATH = `${BIN_DIR}${isWin() ? ";" : ":"}${cur}`;
  }
}

export function isWin() {
  return process.platform === "win32";
}

export function arch(): "amd64" | "arm64" {
  return process.arch === "arm64" ? "arm64" : "amd64";
}

export function exe(name: string): string {
  return isWin() ? `${name}.exe` : name;
}


export function resolveBin(name: string): string | null {
  const local = join(BIN_DIR, exe(name));
  if (existsSync(local)) return local;
  try {
    const cmd = isWin() ? `where ${name}` : `which ${name}`;
    const out = execSync(cmd, { stdio: "pipe", timeout: 8000 }).toString().split("\n")[0].trim();
    if (out) return out;
  } catch {}
  return null;
}

export function runCapture(bin: string, args: string[]): { ok: boolean; out: string } {
  try {
    const out = execSync(`"${bin}" ${args.join(" ")}`, { stdio: "pipe", timeout: 15000 }).toString();
    return { ok: true, out: out.trim() };
  } catch (e: any) {
    return { ok: false, out: String(e?.message ?? e).slice(0, 300) };
  }
}

export async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000) throw new Error(`download too small (${buf.length}b) — probably an error page: ${url}`);
  writeFileSync(dest, buf);
  if (!isWin()) {
    try {
      chmodSync(dest, 0o755);
    } catch {}
  }
}


export function cloudflaredAsset(): string {
  if (isWin()) return "cloudflared-windows-amd64.exe";
  if (process.platform === "darwin") return `cloudflared-darwin-${arch()}.tgz`;
  return `cloudflared-linux-${arch()}`;
}

export function cloudflaredUrl(): string {
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/${cloudflaredAsset()}`;
}


export const NODE_PIN = process.env.NODE_PIN_VERSION ?? "v20.19.0";

export function nodeDownload(): { url: string; kind: "exe" | "targz" } {
  const v = NODE_PIN;
  if (isWin()) return { url: `https://nodejs.org/dist/${v}/win-x64/node.exe`, kind: "exe" };
  const os = process.platform === "darwin" ? (arch() === "arm64" ? "osx-arm64-tar" : "osx-x64-tar") : `linux-${arch() === "arm64" ? "arm64" : "x64"}`;
  return { url: `https://nodejs.org/dist/${v}/node-${v}-${os}.tar.gz`, kind: "targz" };
}

export function parseNodeMajor(versionOut: string): number | null {
  const m = versionOut.match(/v(\d+)\./);
  return m ? Number(m[1]) : null;
}


export type ToolStatus = {
  id: string;
  label: string;
  required: boolean;
  auto: boolean; 
  installed: boolean;
  version: string | null;
  path?: string | null;
  hint?: string;
};

async function checkNode(): Promise<ToolStatus> {
  const bin = resolveBin("node");
  const base: ToolStatus = { id: "node", label: "Node.js 20+", required: true, auto: true, installed: false, version: null };
  if (!bin) return { ...base, hint: "CrewCode will download portable Node into .crew/bin" };
  const r = runCapture(bin, ["--version"]);
  const major = parseNodeMajor(r.out);
  if (!r.ok || major === null || major < NODE_WANT_MAJOR) {
    return { ...base, path: bin, version: r.out || null, hint: `found ${r.out || "unknown"} — need v${NODE_WANT_MAJOR}+` };
  }
  return { ...base, installed: true, version: r.out, path: bin };
}

async function checkCloudflared(): Promise<ToolStatus> {
  const bin = process.env.CLOUDFLARED_BIN ?? resolveBin("cloudflared");
  const base: ToolStatus = { id: "cloudflared", label: "cloudflared (Quick Tunnels)", required: true, auto: true, installed: false, version: null };
  if (!bin) return { ...base, hint: "CrewCode will download it into .crew/bin" };
  const r = runCapture(bin, ["--version"]);
  return { ...base, installed: r.ok, version: r.ok ? r.out.split("\n")[0].slice(0, 80) : null, path: bin };
}

async function checkGit(): Promise<ToolStatus> {
  const bin = resolveBin("git");
  const base: ToolStatus = { id: "git", label: "Git", required: true, auto: false, installed: false, version: null };
  if (!bin) return { ...base, hint: "one-click: winget/brew, or https://git-scm.com/downloads" };
  const r = runCapture(bin, ["--version"]);
  return { ...base, installed: r.ok, version: r.ok ? r.out.slice(0, 60) : null, path: bin };
}

async function checkOpencode(): Promise<ToolStatus> {
  const bin = resolveBin("opencode");
  const base: ToolStatus = { id: "opencode", label: "opencode CLI", required: true, auto: true, installed: false, version: null };
  if (!bin) return { ...base, hint: "CrewCode will run: npm i -g opencode-ai" };
  const r = runCapture(bin, ["--version"]);
  return { ...base, installed: r.ok, version: r.ok ? r.out.split("\n")[0].slice(0, 60) : null, path: bin };
}

async function checkDocker(): Promise<ToolStatus> {
  const bin = resolveBin("docker");
  const base: ToolStatus = {
    id: "docker",
    label: "Docker (Postgres + Redis)",
    required: false,
    auto: false,
    installed: false,
    version: null,
    hint: "needs admin + reboot — https://www.docker.com/products/docker-desktop/",
  };
  if (!bin) return base;
  const r = runCapture(bin, ["--version"]);
  if (!r.ok) return { ...base, path: bin };
  const c = runCapture(bin, ["compose", "version"]);
  return { ...base, installed: true, version: `${r.out.slice(0, 50)}${c.ok ? " + compose" : ""}`, path: bin };
}

export async function fullStatus(): Promise<ToolStatus[]> {
  ensureBinDir();
  return [await checkNode(), await checkCloudflared(), await checkGit(), await checkOpencode(), await checkDocker()];
}


export async function installCloudflared(): Promise<{ path: string; version: string | null }> {
  ensureBinDir();
  const asset = cloudflaredAsset();
  const url = cloudflaredUrl();
  if (asset.endsWith(".tgz")) {
    const tgz = join(BIN_DIR, "cloudflared.tgz");
    await downloadFile(url, tgz);
    execSync(`tar -xzf "${tgz}" -C "${BIN_DIR}"`, { stdio: "pipe", timeout: 60_000 });
    const bin = join(BIN_DIR, "cloudflared");
    try {
      chmodSync(bin, 0o755);
    } catch {}
  } else {
    await downloadFile(url, join(BIN_DIR, exe("cloudflared")));
  }
  const bin = process.env.CLOUDFLARED_BIN ?? join(BIN_DIR, exe("cloudflared"));
  const r = runCapture(bin, ["--version"]);
  if (!r.ok) throw new Error(`downloaded but --version failed: ${r.out}`);
  return { path: bin, version: r.out.split("\n")[0].slice(0, 80) };
}

export async function installNode(): Promise<{ path: string; version: string | null }> {
  ensureBinDir();
  const dl = nodeDownload();
  const dest = join(BIN_DIR, exe("node"));
  if (dl.kind === "exe") {
    await downloadFile(dl.url, dest);
  } else {
    const tgz = join(BIN_DIR, "node.tar.gz");
    await downloadFile(dl.url, tgz);
    execSync(`tar -xzf "${tgz}" -C "${BIN_DIR}" --strip-components=1`, { stdio: "pipe", timeout: 120_000 });
  }
  const r = runCapture(dest, ["--version"]);
  const major = parseNodeMajor(r.out);
  if (!r.ok || major === null || major < NODE_WANT_MAJOR) throw new Error(`node install produced ${r.out || "nothing usable"}`);
  return { path: dest, version: r.out };
}

export async function installOpencode(): Promise<{ path: string; version: string | null }> {
  ensureBinDir();
  const npm = resolveBin("npm") ?? (isWin() ? join(BIN_DIR, "npm.cmd") : join(BIN_DIR, "npm"));
  try {
    execSync(`"${npm}" install -g opencode-ai`, { stdio: "pipe", timeout: 180_000 });
  } catch (e: any) {
    throw new Error(`npm i -g opencode-ai failed: ${String(e?.message ?? e).slice(0, 300)}`);
  }
  const bin = resolveBin("opencode");
  if (!bin) throw new Error("npm install succeeded but `opencode` not found on PATH");
  const r = runCapture(bin, ["--version"]);
  return { path: bin, version: r.ok ? r.out.split("\n")[0].slice(0, 60) : null };
}

export async function installGitGuided(): Promise<{ ok: false; command: string }> {
  
  if (isWin()) return { ok: false as const, command: "winget install -e --id Git.Git" };
  if (process.platform === "darwin") return { ok: false as const, command: "brew install git" };
  return { ok: false as const, command: "sudo apt-get install -y git  # or: sudo dnf install -y git" };
}

export async function installTool(id: string): Promise<{ ok: boolean; path?: string; version?: string | null; command?: string; error?: string }> {
  try {
    if (id === "cloudflared") {
      const r = await installCloudflared();
      return { ok: true, ...r };
    }
    if (id === "node") {
      const r = await installNode();
      return { ok: true, ...r };
    }
    if (id === "opencode") {
      const r = await installOpencode();
      return { ok: true, ...r };
    }
    if (id === "git" || id === "docker") {
      const g = await installGitGuided();
      return { ok: false, command: id === "docker" ? "https://www.docker.com/products/docker-desktop/" : g.command };
    }
    return { ok: false, error: `unknown tool ${id}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 500) };
  }
}

export async function installAllMissing(): Promise<Array<{ id: string; ok: boolean; version?: string | null; error?: string; command?: string }>> {
  const statuses = await fullStatus();
  const out: Array<{ id: string; ok: boolean; version?: string | null; error?: string; command?: string }> = [];
  for (const s of statuses) {
    if (s.installed || !s.required) continue;
    if (!s.auto) {
      const g = await installGitGuided();
      out.push({ id: s.id, ok: false, command: s.id === "docker" ? "https://www.docker.com/products/docker-desktop/" : g.command });
      continue;
    }
    const r = await installTool(s.id);
    out.push({ id: s.id, ...r });
  }
  return out;
}
