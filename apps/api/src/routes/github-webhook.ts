

import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { raw } from "express";
import { query } from "../lib/db.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";

export const githubWebhookRouter = Router();

function verifyGithubSignature(payload: Buffer, sig: string, secret: string): boolean {
  if (!sig?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = sig.slice(7);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

githubWebhookRouter.post("/", raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const sig = (req.headers["x-hub-signature-256"] as string) ?? "";
  const event = (req.headers["x-github-event"] as string) ?? "";
  const payload = req.body as Buffer;

  if (secret) {
    if (!sig || !verifyGithubSignature(payload, sig, secret)) {
      return res.status(401).json({ error: "invalid signature" });
    }
  }

  let j: any;
  try {
    j = JSON.parse(payload.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "bad json" });
  }

  switch (event) {
    case "pull_request": {
      const pr = j.pull_request ?? {};
      const action = j.action ?? "unknown";
      const branch = pr.head?.ref ?? "";
      const repo = pr.base?.repo?.full_name ?? "";
      
      const tasks = await query<any>(`select * from tasks where branch=$1`, [branch]).catch(() => []);
      const task = tasks[0];
      if (task) {
        await query(`insert into events (task_id, type, payload) values ($1,'github_pr',$2)`, [
          task.id,
          JSON.stringify({ action, pr_number: pr.number, repo, url: pr.html_url, state: pr.state }),
        ]);
        if (action === "closed" && pr.merged) {
          await query(`update tasks set status='merged' where id=$1`, [task.id]);
          await notify({ kind: "merged", taskId: task.id, projectId: task.project_id, branch });
        }
        if (action === "closed" && !pr.merged) {
          await query(`update tasks set status='blocked' where id=$1`, [task.id]);
        }
      }
      await audit(null, "github", "webhook.pull_request", { action, branch, repo, task_id: task?.id });
      break;
    }
    case "push": {
      const branch = j.ref?.replace("refs/heads/", "") ?? "";
      const tasks = await query<any>(`select * from tasks where branch=$1`, [branch]).catch(() => []);
      if (tasks[0]) {
        await query(`insert into events (task_id, type, payload) values ($1,'github_push',$2)`, [
          tasks[0].id,
          JSON.stringify({ commits: j.commits?.length ?? 0, pusher: j.pusher?.name }),
        ]);
      }
      break;
    }
    default:
      break;
  }

  res.json({ received: true, event });
});
