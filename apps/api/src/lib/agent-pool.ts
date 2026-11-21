// Per-teammate persistent OpenCode instances, running CrewCode's TAILORED profile.
//
// Each teammate gets a long-lived `opencode serve` on a stable port, launched with
// OPENCODE_CONFIG pointed at our generated profile (mandated model + provider key,
// our agent prompt, scoped permissions). Task runs attach to that server and are
// pinned to the mandated model. The central integration agent runs on its own
// persistent instance keyed "__integrator__".
import { spawn, execSync } from "node:child_process";
import { resolve } from "node:path";
import { query } from "./db.js";
import { profileEnv } from "./opencode-profile.js";
import { opencodeCmd } from "./opencode-bin.js";

const BASE = Number(process.env.OPENCODE_BASE_PORT ?? 4096);
const RANGE = Number(process.env.OPENCODE_PORT_RANGE ?? 200);
export const INTEGRATOR_OWNER = "__integrator__";

// Our instances run with a KNOWN basic-auth password so the control plane can
// talk to the opencode server API (session streaming) — not just the CLI.
const SERVER_USER = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
const SERVER_PASS = process.env.OPENCODE_SERVER_PASSWORD ?? "crewcode-local";
export function serverAuthHeader(): Record<string, string> {
  return { authorization: "Basic " + Buffer.from(`${SERVER_USER}:${SERVER_PASS}`).toString("base64") };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function portFor(ownerId: string): number {
  return BASE + (hash(ownerId) % RANGE);
}

async function healthy(port: number): Promise<boolean> {
  for (const p of ["/global/health", "/health", "/app", "/"]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(1500) });
      if (r.ok || r.status < 500) return true;
    } catch {}
  }
  return false;
}

function pidAlive(pid: number | undefined | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type Role = "crew" | "integrator";
export type Instance = { owner_id: string; port: number; pid: number | null; reused: boolean; url: string; role: Role };

export async function ensureInstance(ownerId: string, role: Role = "crew"): Promise<Instance> {
  const port = portFor(ownerId);
  const existing = (await query<any>(`select * from agent_instances where owner_id=$1`, [ownerId]))[0];
  if (existing && pidAlive(existing.pid) && (await healthy(port))) {
    await query(`update agent_instances set last_used=now() where owner_id=$1`, [ownerId]);
    return { owner_id: ownerId, port, pid: existing.pid, reused: true, url: `http://127.0.0.1:${port}`, role };
  }

  const env = {
    ...process.env,
    ...(await profileEnv(role, role === "integrator" ? undefined : ownerId)),
    OPENCODE_SERVER_USERNAME: SERVER_USER,
    OPENCODE_SERVER_PASSWORD: SERVER_PASS,
  };
  const child = spawn(`${opencodeCmd()} serve --port ${port}`, { shell: true, detached: true, stdio: "ignore", env });
  child.unref();
  const pid = child.pid ?? null;

  let ok = false;
  for (let i = 0; i < 32; i++) {
    if (await healthy(port)) {
      ok = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  await query(
    `insert into agent_instances (owner_id, port, pid, started_at, last_used) values ($1,$2,$3,now(),now())
     on conflict (owner_id) do update set port=$2, pid=$3, started_at=now(), last_used=now()`,
    [ownerId, port, pid]
  ).catch(() => {});
  if (!ok) throw new Error(`opencode server for "${ownerId}" did not become healthy on :${port}`);
  return { owner_id: ownerId, port, pid, reused: false, url: `http://127.0.0.1:${port}`, role };
}

async function getSession(ownerId: string, taskId: string): Promise<string | null> {
  const rows = await query<any>(`select session_id from agent_sessions where owner_id=$1 and task_id=$2`, [ownerId, taskId]).catch(() => []);
  return rows[0]?.session_id ?? null;
}
async function saveSession(ownerId: string, taskId: string, sessionId: string) {
  await query(
    `insert into agent_sessions (owner_id, task_id, session_id, updated_at) values ($1,$2,$3,now())
     on conflict (owner_id, task_id) do update set session_id=$3, updated_at=now()`,
    [ownerId, taskId, sessionId]
  ).catch(() => {});
}

export type ListedSession = { id?: string; directory?: string; created?: number; updated?: number };

// Pure session picker (unit-tested): newest session born during this run whose
// directory is exactly this task's worktree. Returns null rather than a wrong
// session — a missed capture degrades to a fresh session, never a stranger's.
export function pickSession(sessions: ListedSession[], workdir: string, runStartMs: number): string | null {
  if (!Array.isArray(sessions)) return null;
  const want = resolve(workdir).toLowerCase();
  const matches = sessions
    .filter((s) => (s?.created ?? 0) >= runStartMs - 5000)
    .filter((s) => typeof s?.directory === "string" && resolve(s.directory).toLowerCase() === want)
    .sort((a, b) => (b.updated ?? b.created ?? 0) - (a.updated ?? a.created ?? 0));
  if (matches.length !== 1) return null;
  return matches[0]?.id ?? null;
}

function captureSession(workdir: string, runStartMs: number): string | null {
  try {
    // NOTE: `opencode session list` is scoped to the CURRENT PROJECT (cwd) —
    // it must run from the task worktree, or task sessions are invisible.
    const out = execSync(`${opencodeCmd()} session list --format json -n 100`, { cwd: workdir, stdio: "pipe", timeout: 25000 }).toString();
    const start = out.indexOf("[");
    const arr = JSON.parse(out.slice(start >= 0 ? start : 0));
    return pickSession(arr, workdir, runStartMs);
  } catch {
    return null;
  }
}

const _quoteRaw = (s: string) => s.replace(/"/g, '\\"');

// Shell-safe quoting: escape double quotes AND collapse newlines/tabs.
// Windows cmd.exe truncates commands at a literal newline inside quotes,
// which silently drops every flag after the objective (--attach/--session).
export function quoteForShell(s: string): string {
  return _quoteRaw(s).replace(/[\r\n\t]+/g, " ").slice(0, 4000);
}
const quote = quoteForShell;

export type RunResult = { ok: boolean; note: string; instance: Instance | null; sessionId: string | null; attached: boolean; role: Role; output?: string };

export async function runForOwner(ownerId: string, taskId: string, workdir: string, objective: string, role: Role = "crew"): Promise<RunResult> {
  let instance: Instance | null = null;
  try {
    instance = await ensureInstance(ownerId, role);
  } catch {
    instance = null;
  }
  const { OPENCODE_CONFIG, CREW_MODEL } = await profileEnv(role, role === "integrator" ? undefined : ownerId);
  const env = {
    ...process.env,
    OPENCODE_CONFIG,
    CREW_MODEL,
    OPENCODE_PERMISSION: "deny:read:**/.env",
    OPENCODE_SERVER_USERNAME: SERVER_USER,
    OPENCODE_SERVER_PASSWORD: SERVER_PASS,
  };
  const modelFlag = CREW_MODEL ? ` --model ${CREW_MODEL}` : "";
  const session = await getSession(ownerId, taskId);

  if (instance) {
    const sessFlag = session ? ` --session ${session}` : "";
    try {
      const runStart = Date.now();
      const out = execSync(`${opencodeCmd()} run "${quote(objective)}" --attach ${instance.url} --dir "${workdir}"${modelFlag}${sessFlag}`, {
        cwd: workdir,
        stdio: "pipe",
        timeout: 600_000,
        env,
      }).toString();
      const sid = session ?? captureSession(workdir, runStart);
      if (sid) await saveSession(ownerId, taskId, sid);
      return { ok: true, note: `attached ${instance.url} (${CREW_MODEL})`, instance, sessionId: sid, attached: true, role, output: out.slice(-8000) };
    } catch {}
  }

  try {
    const runStart = Date.now();
    const out = execSync(`${opencodeCmd()} run "${quote(objective)}"${modelFlag}`, { cwd: workdir, stdio: "pipe", timeout: 600_000, env }).toString();
    const sid = captureSession(workdir, runStart);
    if (sid) await saveSession(ownerId, taskId, sid);
    return { ok: true, note: `one-shot (${CREW_MODEL})`, instance, sessionId: sid, attached: false, role, output: out.slice(-8000) };
  } catch (e: any) {
    return { ok: false, note: `opencode run failed: ${String(e?.message ?? e).slice(0, 300)}`, instance, sessionId: session, attached: false, role, output: String(e?.stdout ?? "").slice(-4000) };
  }
}

// Central integration agent — its own persistent instance, integrator profile.
export async function runIntegrator(taskId: string, workdir: string, objective: string): Promise<RunResult> {
  return runForOwner(INTEGRATOR_OWNER, taskId, workdir, objective, "integrator");
}

// Streaming variant for chat: spawns `opencode run` and calls onDelta with the
// accumulated stdout as tokens arrive, so the reply can stream into the thread.
export async function runForOwnerStreaming(
  ownerId: string,
  taskId: string,
  workdir: string,
  objective: string,
  onDelta: (fullText: string) => void,
  role: Role = "crew"
): Promise<RunResult> {
  let instance: Instance | null = null;
  try {
    instance = await ensureInstance(ownerId, role);
  } catch {
    instance = null;
  }
  const { OPENCODE_CONFIG, CREW_MODEL } = await profileEnv(role, role === "integrator" ? undefined : ownerId);
  const env = { ...process.env, OPENCODE_CONFIG, CREW_MODEL, OPENCODE_PERMISSION: "deny:read:**/.env" };
  const session = await getSession(ownerId, taskId);
  const modelFlag = CREW_MODEL ? ` --model ${CREW_MODEL}` : "";
  const attach = instance ? ` --attach ${instance.url} --dir "${workdir}"` : "";
  const sessFlag = session ? ` --session ${session}` : "";
  const cmd = `${opencodeCmd()} run "${quote(objective)}"${attach}${modelFlag}${sessFlag}`;
  const runStart = Date.now();

  return await new Promise<RunResult>((resolve) => {
    let acc = "";
    let err = "";
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, { cwd: workdir, env, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      resolve({ ok: false, note: `spawn failed: ${String(e?.message ?? e).slice(0, 200)}`, instance, sessionId: session, attached: !!instance, role, output: "" });
      return;
    }
    child.stdout?.on("data", (d: Buffer) => {
      acc += d.toString();
      try {
        onDelta(acc.slice(-8000));
      } catch {}
    });
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      const sid = session ?? captureSession(workdir, runStart);
      if (sid) saveSession(ownerId, taskId, sid).catch(() => {});
      const ok = code === 0 || acc.trim().length > 0;
      resolve({
        ok,
        note: ok
          ? instance
            ? `attached ${instance.url} (${CREW_MODEL})`
            : `one-shot (${CREW_MODEL})`
          : `opencode run failed (${code}): ${err.slice(-300)}`,
        instance,
        sessionId: sid,
        attached: !!instance,
        role,
        output: (acc || err).slice(-8000),
      });
    });
    child.on("error", (e: any) =>
      resolve({ ok: false, note: `opencode spawn error: ${String(e?.message ?? e).slice(0, 200)}`, instance, sessionId: session, attached: !!instance, role, output: acc })
    );
    setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, 600_000);
  });
}

// Latest assistant text from a session's message list (assistant messages only,
// plus whether that message reports completion).
function latestAssistant(arr: any[]): { text: string; done: boolean; error: string } {
  let done = false;
  for (let k = arr.length - 1; k >= 0; k--) {
    const m = arr[k];
    const info = m?.info ?? {};
    if ((info.role ?? m?.role) !== "assistant") continue;
    if (info?.time?.completed || info?.finish) done = true;
    const err = info?.error;
    if (err) {
      const message =
        err?.data?.message ?? err?.message ?? err?.name ?? (typeof err === "string" ? err : "agent error");
      return { text: "", done: true, error: String(message).slice(0, 400) };
    }
    const parts = m?.parts ?? [];
    const text = parts
      .filter((p: any) => p?.type === "text" && !p?.synthetic)
      .map((p: any) => p?.text ?? "")
      .join("");
    if (text) return { text, done, error: "" };
  }
  return { text: "", done, error: "" };
}

// Subscribe to the opencode server's SSE event stream and emit the growing
// assistant text for our session — true per-token deltas. Best-effort: if the
// stream errors or is unavailable, polling still drives completion.
async function streamSessionEvents(
  base: string,
  sid: string,
  H: Record<string, string>,
  onText: (t: string) => void,
  signal: AbortSignal,
  onIdle?: () => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${base}/event`, { headers: { ...H, accept: "text/event-stream" }, signal });
  } catch {
    return;
  }
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const parts = new Map<string, { mid: string; text: string; order: number }>();
  let order = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        let ev: any;
        try {
          ev = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        const p = ev?.properties?.part;
        if (ev?.type === "session.idle" && ev?.properties?.sessionID === sid && onIdle) onIdle();
        if (ev?.type === "message.part.updated" && p?.sessionID === sid && p?.type === "text") {
          if (!parts.has(p.id)) parts.set(p.id, { mid: p.messageID, text: "", order: order++ });
          const rec = parts.get(p.id)!;
          rec.text = p.text ?? "";
          rec.mid = p.messageID;
          const mid = p.messageID;
          const text = [...parts.values()]
            .filter((r) => r.mid === mid)
            .sort((a, b) => a.order - b.order)
            .map((r) => r.text)
            .join("");
          if (text) onText(text);
        }
      }
    }
  } catch {
    // aborted or stream ended — fine
  }
}

// Drive a turn through the opencode SERVER session API so the reply streams
// token-by-token (the CLI can't). Same persistent instance + worktree; the
// caller still syncs + merges exactly as before. No detached processes.
export async function runViaServer(
  ownerId: string,
  sessionKey: string,
  workdir: string,
  objective: string,
  onDelta: (fullText: string) => void,
  role: Role = "crew"
): Promise<RunResult> {
  const fail = (note: string, instance: Instance | null = null, sid: string | null = null): RunResult => ({
    ok: false,
    note,
    instance,
    sessionId: sid,
    attached: !!instance,
    role,
    output: "",
  });

  let instance = await ensureInstance(ownerId, role).catch(() => null);
  if (!instance) return fail("no opencode instance");
  const D = encodeURIComponent(resolve(workdir));
  const H = { ...serverAuthHeader(), "content-type": "application/json" };

  // Stale instance from before we set a known password? Restart once.
  const authOk = await fetch(`${instance.url}/session/status?directory=${D}`, { headers: H })
    .then((r) => r.status === 200)
    .catch(() => false);
  if (!authOk) {
    await stopInstance(ownerId).catch(() => {});
    // Wait for the old server to actually release the port before respawning,
    // or ensureInstance reuses the dying (wrong-password) process.
    for (let i = 0; i < 25; i++) {
      const stillUp = await fetch(`${instance.url}/session/status`, { headers: H })
        .then(() => true)
        .catch(() => false);
      if (!stillUp) break;
      await sleep(300);
    }
    instance = await ensureInstance(ownerId, role).catch(() => null);
    if (!instance) return fail("instance restart failed");
  }
  const base = instance.url;

  // Reuse the stored session if it still exists, else create one in the worktree.
  let sid = await getSession(ownerId, sessionKey);
  if (sid) {
    const alive = await fetch(`${base}/session/${sid}?directory=${D}`, { headers: H })
      .then((r) => r.ok)
      .catch(() => false);
    if (!alive) sid = null;
  }
  if (!sid) {
    const cr = await fetch(`${base}/session?directory=${D}`, { method: "POST", headers: H, body: "{}" });
    if (!cr.ok) return fail(`session create ${cr.status}`, instance);
    const j: any = await cr.json().catch(() => ({}));
    sid = j.id ?? j.sessionID ?? null;
    if (!sid) return fail("no session id", instance);
    await saveSession(ownerId, sessionKey, sid);
  }

  const { CREW_MODEL } = await profileEnv(role, role === "integrator" ? undefined : ownerId);
  const [providerID, modelID] = String(CREW_MODEL || "opencode-go/mimo-v2.6-pro").split("/");
  // Only consider messages created by THIS turn (skip prior conversation).
  let startIndex = 0;
  try {
    const pre = await fetch(`${base}/session/${sid}/message?directory=${D}`, { headers: H });
    if (pre.ok) {
      const arr = await pre.json().catch(() => []);
      startIndex = Array.isArray(arr) ? arr.length : 0;
    }
  } catch {}
  const pr = await fetch(`${base}/session/${sid}/prompt_async?directory=${D}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ parts: [{ type: "text", text: objective }], model: { providerID, modelID } }),
  }).catch(() => null);
  if (!pr || !pr.ok) return fail(`prompt ${pr ? pr.status : "error"}`, instance, sid);

  // Poll the message list for growing assistant text; finish when it stops
  // changing (status "idle" isn't always reported once a session goes quiet).
  // Live deltas: prefer the event stream (per-token); polling is the fallback
  // and the source of truth for completion. Only ever grow the emitted text.
  let emitted = "";
  const emit = (t: string) => {
    if (t && t.length > emitted.length) {
      emitted = t;
      try {
        onDelta(t);
      } catch {}
    }
  };
  const ac = new AbortController();
  let idle = false;
  streamSessionEvents(base, sid, serverAuthHeader(), emit, ac.signal, () => {
    idle = true;
  }).catch(() => {});

  const t0 = Date.now();
  let last = "";
  let stable = 0;
  let doneEmpty = 0;
  const finish = (out: string, note: string, completed = false): RunResult => {
    try {
      ac.abort();
    } catch {}
    return { ok: completed || !!out, note, instance, sessionId: sid, attached: true, role, output: out };
  };
  while (Date.now() - t0 < 150_000) {
    await sleep(400);
    let changed = false;
    let done = false;
    let agentError = "";
    try {
      const mr = await fetch(`${base}/session/${sid}/message?directory=${D}`, { headers: H });
      if (mr.ok) {
        const arr = await mr.json().catch(() => []);
        const a = latestAssistant((Array.isArray(arr) ? arr : []).slice(startIndex));
        agentError = a.error;
        if (a.text && a.text !== last) {
          last = a.text;
          changed = true;
          emit(a.text);
        }
        done = a.done;
      }
    } catch {}
    // A model/gateway error (e.g. retired model) is a hard failure — never
    // report it as an empty successful turn.
    if (agentError) return fail(`agent error: ${agentError}`, instance, sid);
    if (changed) stable = 0;
    else stable++;
    // A completed turn with no text (tool-only) still counts as done; the
    // worker composes a reply from the files it changed. Only accept it once
    // the session is genuinely idle, never mid-turn.
    if (done && !last) doneEmpty++;
    else doneEmpty = 0;
    if (doneEmpty >= 8) {
      const st = await fetch(`${base}/session/status?directory=${D}`, { headers: H })
        .then((r) => r.json())
        .catch(() => null);
      const busy = st && JSON.stringify((st as any)[sid] ?? "").includes("busy");
      if (!busy) return finish("", `session ${sid}`, true);
    }
    // Done when the session reports idle, the assistant message completes, or
    // the text settles.
    if ((idle && Date.now() - t0 > 1200) || (last && done)) {
      const mr2 = await fetch(`${base}/session/${sid}/message?directory=${D}`, { headers: H }).catch(() => null);
      if (mr2 && mr2.ok) {
        const arr2 = await mr2.json().catch(() => []);
        const a2 = latestAssistant((Array.isArray(arr2) ? arr2 : []).slice(startIndex));
        if (a2.error) return fail(`agent error: ${a2.error}`, instance, sid);
        if (a2.text && a2.text !== last) {
          last = a2.text;
          emit(a2.text);
        }
      }
      return finish(last, `session ${sid}`, true);
    }
    if (last && stable >= 6) return finish(last, `session ${sid}`);
  }
  return finish(last, "session timeout");
}

export async function listInstances() {
  const rows = await query<any>(`select * from agent_instances order by owner_id`);
  return Promise.all(
    rows.map(async (r: any) => ({ ...r, alive: pidAlive(r.pid) && (await healthy(r.port)), url: `http://127.0.0.1:${r.port}` }))
  );
}

export async function stopInstance(ownerId: string) {
  const r = (await query<any>(`select pid from agent_instances where owner_id=$1`, [ownerId]))[0];
  if (r?.pid) {
    try {
      process.kill(r.pid);
    } catch {}
  }
  await query(`delete from agent_instances where owner_id=$1`, [ownerId]);
}
