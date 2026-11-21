// Queue abstraction — Phase 0 uses Redis lists via ioredis.
// Swap to BullMQ workers in Phase 1 without changing route code.
import { Redis } from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
export const redis = new Redis(url, { maxRetriesPerRequest: 3 });

export const QUEUES = {
  agentJobs: "crew:agent-jobs",
  mergeQueue: "crew:merge-queue",
} as const;

export async function enqueue(queue: string, payload: unknown) {
  await redis.rpush(queue, JSON.stringify(payload));
}
