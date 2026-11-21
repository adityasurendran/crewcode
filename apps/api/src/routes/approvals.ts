
import { Router } from "express";
import { query } from "../lib/db.js";
import { redis, QUEUES } from "../lib/queue.js";
import { audit } from "../lib/audit.js";

export const approvalsRouter = Router();

async function threadNote(task: any, text: string, meta: Record<string, unknown>, stage: string) {
  if (!task.thread_id) return;
  try {
    const { postMessage } = await import("../lib/threads.js");
    const { publishStatus } = await import("../lib/stream-bus.js");
    await postMessage(task.thread_id, "agent", text, meta);
    await publishStatus(task.thread_id, stage);
  } catch {}
}


async function clearSlip(task: any) {
  if (!task.thread_id) return;
  await query(
    `update messages set meta = meta - 'approval' where thread_id=$1 and meta->>'approval' = $2`,
    [task.thread_id, task.id]
  ).catch(() => {});
}

approvalsRouter.post("/:id/approve", async (req, res) => {
  const id = String(req.params.id);
  try {
    const t = (await query<any>(`select * from tasks where id=$1`, [id]))[0];
    if (!t) return res.status(404).json({ error: "task not found" });
    if (t.status !== "awaiting_approval") return res.status(409).json({ error: "this change is not awaiting approval" });
    await query(`update tasks set status='testing' where id=$1`, [id]);
    await redis.rpush(QUEUES.mergeQueue, JSON.stringify({ taskId: id, retry: 0, approved: true }));
    await threadNote(t, "Approved — merging now.", { approval_result: "approved" }, "checking");
    await clearSlip(t);
    await audit(t.project_id, String((req as any).actor ?? "user"), "change.approved", { task_id: id });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});

approvalsRouter.post("/:id/reject", async (req, res) => {
  const id = String(req.params.id);
  try {
    const t = (await query<any>(`select * from tasks where id=$1`, [id]))[0];
    if (!t) return res.status(404).json({ error: "task not found" });
    if (t.status !== "awaiting_approval") return res.status(409).json({ error: "this change is not awaiting approval" });
    await query(`update tasks set status='blocked' where id=$1`, [id]);
    await threadNote(t, "Rejected — nothing was merged.", { approval_result: "rejected" }, "error");
    await clearSlip(t);
    await audit(t.project_id, String((req as any).actor ?? "user"), "change.rejected", { task_id: id });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e).slice(0, 200) });
  }
});
