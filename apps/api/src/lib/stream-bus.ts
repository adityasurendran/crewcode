// Live agent-output bus — bridges the worker (which streams text + status) to
// the API's SSE endpoint over Redis pub/sub.
import { redis } from "./queue.js";

export const streamChannel = (threadId: string) => `crew:stream:${threadId}`;

async function publish(threadId: string, payload: Record<string, unknown>) {
  try {
    await redis.publish(streamChannel(threadId), JSON.stringify(payload));
  } catch {
    // best-effort; the final message is still persisted
  }
}

// Accumulated partial text (for live typing).
export async function publishDelta(threadId: string, text: string) {
  await publish(threadId, { text });
}

// Stage label: thinking | working | checking | done | error.
export async function publishStatus(threadId: string, stage: string) {
  await publish(threadId, { stage });
}

// Returns an unsubscribe fn. Uses a dedicated connection (ioredis requires it).
export function subscribe(threadId: string, onPayload: (p: any) => void): () => void {
  const sub = redis.duplicate();
  sub.subscribe(streamChannel(threadId)).catch(() => {});
  sub.on("message", (_ch: string, msg: string) => {
    try {
      onPayload(JSON.parse(msg));
    } catch {}
  });
  return () => {
    try {
      sub.unsubscribe();
      sub.quit();
    } catch {}
  };
}
