


export type NotifyPayload = {
  kind: "task_done" | "task_blocked" | "merged" | "rollback" | "semantic_patch";
  taskId?: string;
  projectId?: string;
  objective?: string;
  message?: string;
  branch?: string;
};

export async function notify(p: NotifyPayload): Promise<void> {
  const text = `[CrewCode] ${p.kind}${p.objective ? `: ${p.objective}` : ""}${p.message ? ` — ${p.message}` : ""}${p.branch ? ` (${p.branch})` : ""}`;
  const url = process.env.SLACK_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      
    }
  }
  console.log(`[notify] ${text}`);
}
