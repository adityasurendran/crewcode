
import { Router } from "express";
import { z } from "zod";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

export const safetyRouter = Router();

safetyRouter.post("/report", async (req, res) => {
  const parsed = z
    .object({ project_id: z.string().uuid(), reason: z.string().min(3).max(500), task_id: z.string().uuid().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const actor = String((req as any).actor ?? "user");
  await audit(parsed.data.project_id, actor, "safety.report", {
    reason: parsed.data.reason,
    task_id: parsed.data.task_id ?? null,
  });
  await notify({
    kind: "task_blocked",
    projectId: parsed.data.project_id,
    message: `Safety report: ${parsed.data.reason.slice(0, 120)}`,
  }).catch(() => {});
  res.json({ ok: true, note: "Reported. A responsible adult can review the project activity." });
});
