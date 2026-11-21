


import { resolveSecret, redactSecrets } from "./vault.js";

export async function stripeCreateCheckout(vaultRef: string, args: any) {
  const key = await resolveSecret(vaultRef);
  const body = new URLSearchParams({
    "payment_method_types[]": "card",
    mode: args?.mode ?? "payment",
    success_url: args?.success_url ?? "https://example.com/success",
    cancel_url: args?.cancel_url ?? "https://example.com/cancel",
    "line_items[0][price_data][currency]": args?.currency ?? "usd",
    "line_items[0][price_data][product_data][name]": args?.name ?? "CrewCode item",
    "line_items[0][price_data][unit_amount]": String(args?.amount_cents ?? 500),
    "line_items[0][quantity]": "1",
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`stripe ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j: any = await res.json();
  return { id: j.id, url: j.url };
}

export async function supabaseQuery(vaultRef: string, args: { url: string; sql?: string; table?: string; select?: string; filter?: string }) {
  
  
  const key = await resolveSecret(vaultRef);
  if (!args?.url || !args?.table) return { stub: true, note: "send {url, table, select} for live read" };
  const u = `${args.url.replace(/\/$/, "")}/rest/v1/${args.table}?select=${encodeURIComponent(args.select ?? "*")}${args.filter ? `&${args.filter}` : ""}`;
  const res = await fetch(u, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return { rows: await res.json() };
}

export async function supabaseSignup(
  vaultRef: string,
  args: { url?: string; email?: string; password?: string; metadata?: Record<string, any> }
) {
  const key = await resolveSecret(vaultRef);
  const url = args?.url;
  const email = args?.email;
  if (!url) throw new Error("supabase url required — send {url, email}");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("valid email required");
  const body: Record<string, any> = { email, email_confirm: true, user_metadata: args?.metadata ?? {} };
  if (args?.password) {
    if (args.password.length < 8) throw new Error("password must be at least 8 characters");
    body.password = args.password;
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase auth ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j: any = await res.json();
  return { id: j.id, email: j.email, created_at: j.created_at };
}

export async function supabaseUpload(
  vaultRef: string,
  args: { url?: string; bucket?: string; path?: string; content_base64?: string; content_type?: string; upsert?: boolean }
) {
  const key = await resolveSecret(vaultRef);
  const { url, bucket, path, content_base64 } = args ?? {};
  checkStorageRef(bucket, path);
  if (!url) throw new Error("supabase url required");
  if (!content_base64) throw new Error("content_base64 required");
  if (!bucket || !path) throw new Error("bucket + path required"); 
  let bytes: Buffer;
  try {
    bytes = Buffer.from(content_base64, "base64");
  } catch {
    throw new Error("content_base64 is not valid base64");
  }
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new Error("file must be 1 byte – 10 MB");
  const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": args?.content_type ?? "application/octet-stream",
      "x-upsert": args?.upsert === false ? "false" : "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`supabase storage ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return { bucket, path, size: bytes.length };
}


export function checkStorageRef(bucket?: string, path?: string): void {
  if (!bucket || !/^[A-Za-z0-9._-]+$/.test(bucket)) throw new Error("invalid bucket name");
  if (path != null) {
    if (!path) throw new Error("path required");
    if (path.includes("..")) throw new Error("path must not contain ..");
  }
}

export type SupabaseWriteOp = "insert" | "update" | "delete";



export function writeSpec(
  table: string,
  op: SupabaseWriteOp,
  rows?: unknown,
  filter?: string
): { method: string; path: string; body?: string } {
  if (!table || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error("invalid table name");
  if (!["insert", "update", "delete"].includes(op)) throw new Error(`unknown op ${op}`);
  if (op === "insert") {
    if (!Array.isArray(rows) || !rows.length) throw new Error("insert needs a non-empty rows array");
    if (rows.length > 100) throw new Error("insert capped at 100 rows per call");
    return { method: "POST", path: `/rest/v1/${table}`, body: JSON.stringify(rows) };
  }
  if (!filter) throw new Error(`${op} needs a filter (refusing unscoped ${op}) — e.g. "id=eq.1"`);
  const q = `?${filter}`;
  if (op === "update") {
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) throw new Error("update needs a values object");
    return { method: "PATCH", path: `/rest/v1/${table}${q}`, body: JSON.stringify(rows) };
  }
  return { method: "DELETE", path: `/rest/v1/${table}${q}` };
}

export async function supabaseWrite(
  vaultRef: string,
  args: { url?: string; table?: string; op?: SupabaseWriteOp; rows?: unknown; filter?: string }
) {
  const key = await resolveSecret(vaultRef);
  const { url, table, op } = args ?? {};
  if (!url) throw new Error("supabase url required");
  const spec = writeSpec(table ?? "", (op ?? "insert") as SupabaseWriteOp, args?.rows, args?.filter);
  const res = await fetch(`${url.replace(/\/$/, "")}${spec.path}`, {
    method: spec.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "return=representation",
    },
    body: spec.body,
  });
  if (!res.ok) throw new Error(`supabase write ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const text = await res.text();
  return { rows: text ? JSON.parse(text) : [] };
}

export async function supabaseDownload(vaultRef: string, args: { url?: string; bucket?: string; path?: string }) {
  const key = await resolveSecret(vaultRef);
  const { url, bucket, path } = args ?? {};
  checkStorageRef(bucket, path);
  if (!url) throw new Error("supabase url required");
  const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${String(path).replace(/^\/+/, "")}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`supabase storage ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) throw new Error("file too large (>10 MB)");
  return { bucket, path, size: buf.length, content_base64: buf.toString("base64") };
}

export async function supabaseRemove(vaultRef: string, args: { url?: string; bucket?: string; paths?: string[] }) {
  const key = await resolveSecret(vaultRef);
  const { url, bucket, paths } = args ?? {};
  checkStorageRef(bucket);
  if (!url) throw new Error("supabase url required");
  if (!Array.isArray(paths) || !paths.length) throw new Error("paths must be a non-empty array");
  if (paths.length > 20) throw new Error("delete capped at 20 paths per call");
  const base = url.replace(/\/$/, "");
  const removed: string[] = [];
  for (const p of paths) {
    checkStorageRef(bucket, p);
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${String(p).replace(/^\/+/, "")}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`supabase storage ${res.status}: ${(await res.text()).slice(0, 500)}`);
    removed.push(p);
  }
  return { bucket, removed };
}




export function mediaFilename(name: string, ext?: string): string {
  const slug = String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
  const e = (ext ?? "jpg").toLowerCase().replace(/^\./, "");
  const safeExt = ["jpg", "jpeg", "png", "webp"].includes(e) ? e : "jpg";
  return `${slug}.${safeExt}`;
}



export async function mediaGenerateImage(
  _vaultRef: string,
  args: { task_id?: string; prompt?: string; filename?: string; width?: number; height?: number }
): Promise<{ path: string; url_path: string; size: number }> {
  const prompt = String(args?.prompt ?? "").trim().slice(0, 1000);
  if (!prompt) throw new Error("prompt required");
  const taskId = String(args?.task_id ?? "").trim();
  if (!taskId) throw new Error("task_id required");
  const w = Math.min(1536, Math.max(256, Number(args?.width ?? 1024) || 1024));
  const h = Math.min(1536, Math.max(256, Number(args?.height ?? 1024) || 1024));
  const file = mediaFilename(args?.filename ?? prompt.slice(0, 30));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${Math.floor(Math.random() * 1e6)}&nologo=true&model=flux`;
  const res = await fetch(url, { headers: { "user-agent": "CrewCode/1.0" } });
  if (!res.ok) throw new Error(`image service ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error("image service returned an empty file");
  if (buf.length > 10 * 1024 * 1024) throw new Error("generated image too large (>10 MB)");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(".crew", "worktrees", taskId, "public", "generated");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), buf);
  return { path: `public/generated/${file}`, url_path: `/generated/${file}`, size: buf.length };
}



export function checkEmailList(to: unknown): string[] {
  const list = Array.isArray(to) ? to : [to];
  const emails = list.map((e) => String(e ?? "").trim()).filter(Boolean);
  if (!emails.length) throw new Error("at least one recipient required");
  if (emails.length > 20) throw new Error("capped at 20 recipients per call");
  for (const e of emails) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(`invalid email: ${e.slice(0, 60)}`);
  }
  return emails;
}

export async function emailSend(
  vaultRef: string,
  args: { to?: unknown; subject?: string; html?: string; text?: string; from?: string; endpoint?: string }
): Promise<{ id: string }> {
  const key = await resolveSecret(vaultRef);
  const to = checkEmailList(args?.to);
  const subject = String(args?.subject ?? "").trim().slice(0, 200);
  if (!subject) throw new Error("subject required");
  const html = args?.html ? String(args.html).slice(0, 100_000) : undefined;
  const text = args?.text ? String(args.text).slice(0, 100_000) : undefined;
  if (!html && !text) throw new Error("html or text required");
  const res = await fetch(args?.endpoint ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: args?.from ?? "CrewCode <noreply@crewcode.local>", to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`email ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const j: any = await res.json();
  return { id: j.id ?? "sent" };
}





export function isBlockedHost(host: string): boolean {
  const h = String(host ?? "").toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
  if (!h || h === "localhost") return true;
  if (h === "::1") return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const n = v4.slice(1, 5).map(Number);
    if (n.some((x) => x < 0 || x > 255)) return true;
    const [a, b] = n;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  return false;
}

function stripHtml(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i)?.[1] ?? "").trim();
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  return { title, text };
}

export async function webFetchText(rawUrl: string): Promise<{ url: string; title: string; text: string }> {
  const s = String(rawUrl ?? "").trim().slice(0, 2000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("only http(s) URLs allowed");
  if (isBlockedHost(u.hostname)) throw new Error("that address is not allowed");
  
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(u.hostname, { all: true });
    if (addrs.some((a) => isBlockedHost(a.address))) throw new Error("that address is not allowed");
  } catch (e: any) {
    if (String(e?.message ?? e).includes("not allowed")) throw e;
    throw new Error("could not resolve that address");
  }
  const res = await fetch(u.toString(), {
    headers: { "user-agent": "CrewCode/1.0 (research fetch)", accept: "text/html,text/plain" },
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  
  try {
    if (isBlockedHost(new URL(res.url).hostname)) throw new Error("that address is not allowed");
  } catch (e: any) {
    if (String(e?.message ?? e).includes("not allowed")) throw e;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 1024 * 1024) throw new Error("page too large (>1 MB)");
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("html")) {
    const { title, text } = stripHtml(buf.toString("utf8"));
    return { url: res.url || u.toString(), title, text };
  }
  return { url: res.url || u.toString(), title: "", text: buf.toString("utf8").slice(0, 8000) };
}


export function parseDdgResults(html: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    let href = m[1];
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    try {
      href = uddg ? decodeURIComponent(uddg[1]) : href;
    } catch {}
    if (!/^https?:\/\//.test(href)) continue;
    const title = href && m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    out.push({ title: title || href, url: href });
  }
  return out;
}

export async function webSearch(rawQuery: string): Promise<{ results: { title: string; url: string }[] }> {
  const q = String(rawQuery ?? "").trim().slice(0, 300);
  if (!q) throw new Error("query required");
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; CrewCode/1.0)" },
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return { results: parseDdgResults(await res.text()) };
}




export function safeErr(e: any): string {
  return redactSecrets(String(e?.message ?? e)).slice(0, 1000);
}
