






import { createHash, randomBytes, randomInt } from "node:crypto";
import { query } from "./db.js";
import { audit } from "./audit.js";


async function getRedis() {
  return (await import("./queue.js")).redis;
}

export const PIN_TTL_HOURS = Number(process.env.SHARE_TTL_HOURS ?? 8);
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SEC = 5 * 60;

export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPin(pin: string): string {
  const salt = process.env.SHARE_SALT ?? "crewcode-share-dev-salt";
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

async function attemptsKey(ip: string): Promise<string> {
  return `crew:pin-attempts:${ip.replace(/[^a-zA-Z0-9-.:]/g, "_")}`;
}

export async function checkAttempts(ip: string): Promise<{ ok: boolean; remaining: number }> {
  const redis = await getRedis();
  const n = Number((await redis.get(await attemptsKey(ip)).catch(() => "0")) ?? 0);
  return { ok: n < MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - n) };
}

export async function recordFailedAttempt(ip: string): Promise<void> {
  const redis = await getRedis();
  const k = await attemptsKey(ip);
  const n = await redis.incr(k).catch(() => 1);
  if (n === 1) await redis.expire(k, ATTEMPT_WINDOW_SEC).catch(() => {});
}

export async function clearAttempts(ip: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(await attemptsKey(ip)).catch(() => {});
}

export async function createShare(projectId: string, createdBy: string, tunnelUrl: string, hours?: number) {
  const ttlH = Math.min(Math.max(hours ?? PIN_TTL_HOURS, 1), 72);
  
  let pin = "";
  for (let i = 0; i < 5; i++) {
    pin = generatePin();
    const existing = await query(`select id from shares where pin_hash=$1 and revoked=false and expires_at > now()`, [hashPin(pin)]).catch(() => []);
    if (!existing.length) break;
  }
  const expiresAt = new Date(Date.now() + ttlH * 3600_000).toISOString();
  const rows = await query<any>(
    `insert into shares (project_id, pin_hash, tunnel_url, expires_at, created_by)
     values ($1,$2,$3,$4,$5) returning id, project_id, tunnel_url, expires_at, created_at`,
    [projectId, hashPin(pin), tunnelUrl, expiresAt, createdBy]
  );
  const share = rows[0];
  await audit(projectId, createdBy, "share.created", { share_id: share.id, expires_at: expiresAt });
  return { ...share, pin }; 
}

export async function resolveShareByPin(pin: string) {
  const rows = await query<any>(
    `select s.*, p.name as project_name from shares s join projects p on p.id=s.project_id
     where s.pin_hash=$1 and s.revoked=false and s.expires_at > now()`,
    [hashPin(pin.trim())]
  );
  return rows[0] ?? null;
}

export async function issueGuestToken(shareId: string, projectId: string, ttlSec: number): Promise<string> {
  const redis = await getRedis();
  const token = `cg_${randomBytes(24).toString("hex")}`;
  
  const guest_id = randomBytes(6).toString("hex");
  await redis.set(`crew:guest:${token}`, JSON.stringify({ share_id: shareId, project_id: projectId, guest_id }), "EX", Math.max(ttlSec, 60));
  return token;
}

export async function verifyGuestToken(token: string): Promise<{ share_id: string; project_id: string; guest_id?: string } | null> {
  try {
    const redis = await getRedis();
    const raw = await redis.get(`crew:guest:${token}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function revokeShare(shareId: string, actor: string) {
  const rows = await query<any>(`select project_id from shares where id=$1`, [shareId]);
  await query(`update shares set revoked=true where id=$1`, [shareId]);
  if (rows[0]) await audit(rows[0].project_id, actor, "share.revoked", { share_id: shareId });
}

export async function listShares(projectId: string) {
  
  return query<any>(
    `select id, project_id, tunnel_url, expires_at, revoked, created_by, created_at from shares where project_id=$1 order by created_at desc limit 20`,
    [projectId]
  );
}
