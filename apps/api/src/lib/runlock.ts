






import { randomBytes } from "node:crypto";

export const DEFAULT_TTL_SEC = Number(process.env.RUN_LOCK_TTL_SEC ?? 1200);
export const runLockKey = (taskId: string) => `crew:run:${taskId}`;
export const mergeLockKey = (taskId: string) => `crew:merge:${taskId}`;

export type LockStore = {
  setnxex(key: string, token: string, ttlSec: number): Promise<boolean>;
  renew(key: string, token: string, ttlSec: number): Promise<boolean>;
  release(key: string, token: string): Promise<boolean>;
};

async function redisStore(): Promise<LockStore> {
  const { redis } = await import("./queue.js");
  const RENEW = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";
  const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  return {
    async setnxex(key, token, ttlSec) {
      return (await redis.set(key, token, "EX", ttlSec, "NX")) === "OK";
    },
    async renew(key, token, ttlSec) {
      return Number(await redis.eval(RENEW, 1, key, token, String(ttlSec))) === 1;
    },
    async release(key, token) {
      return Number(await redis.eval(RELEASE, 1, key, token)) === 1;
    },
  };
}


export async function acquireRunLock(key: string, ttlSec = DEFAULT_TTL_SEC, store?: LockStore): Promise<string | null> {
  const s = store ?? (await redisStore());
  const token = randomBytes(16).toString("hex");
  try {
    return (await s.setnxex(key, token, ttlSec)) ? token : null;
  } catch {
    
    return token;
  }
}

export async function releaseRunLock(key: string, token: string, store?: LockStore): Promise<void> {
  try {
    const s = store ?? (await redisStore());
    await s.release(key, token);
  } catch {}
}

export async function renewRunLock(key: string, token: string, ttlSec = DEFAULT_TTL_SEC, store?: LockStore): Promise<boolean> {
  try {
    const s = store ?? (await redisStore());
    return await s.renew(key, token, ttlSec);
  } catch {
    return false;
  }
}


export function startHeartbeat(key: string, token: string, ttlSec = DEFAULT_TTL_SEC, store?: LockStore): () => void {
  const intervalMs = Math.max(5_000, Math.floor((ttlSec * 1000) / 3));
  const timer = setInterval(() => {
    void renewRunLock(key, token, ttlSec, store);
  }, intervalMs);
  (timer as any).unref?.();
  return () => clearInterval(timer);
}

export type WithLockResult<T> = { acquired: boolean; result?: T };


export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: { ttlSec?: number; store?: LockStore; heartbeat?: boolean }
): Promise<WithLockResult<T>> {
  const ttlSec = opts?.ttlSec ?? DEFAULT_TTL_SEC;
  const token = await acquireRunLock(key, ttlSec, opts?.store);
  if (!token) return { acquired: false };
  const stop = opts?.heartbeat === false ? () => {} : startHeartbeat(key, token, ttlSec, opts?.store);
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    stop();
    await releaseRunLock(key, token, opts?.store);
  }
}
