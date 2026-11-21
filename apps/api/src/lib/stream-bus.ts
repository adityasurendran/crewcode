

import { redis } from "./queue.js";

export const streamChannel = (threadId: string) => `crew:stream:${threadId}`;

async function publish(threadId: string, payload: Record<string, unknown>) {
  try {
    await redis.publish(streamChannel(threadId), JSON.stringify(payload));
  } catch {
    
  }
}


export async function publishDelta(threadId: string, text: string) {
  await publish(threadId, { text });
}


export async function publishStatus(threadId: string, stage: string) {
  await publish(threadId, { stage });
}


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
