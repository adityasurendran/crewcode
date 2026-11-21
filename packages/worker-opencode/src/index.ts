



export type WorkerJob = {
  taskId: string;
  projectId: string;
  objective: string;
  workdir: string;
  allowlist: string[];
};

export type StructuredEvent =
  | { type: "intent"; objective: string }
  | { type: "files_changed"; files: string[] }
  | { type: "deps_added"; deps: string[] }
  | { type: "apis_used"; apis: string[] }
  | { type: "test_result"; passed: number; failed: number; log_uri?: string }
  | { type: "error"; message: string; file?: string };

export function buildSystemPrompt(job: WorkerJob, projectContext: string): string {
  return `You are CrewCode Agent for task ${job.taskId}.
Objective: ${job.objective}
Scope (do not edit outside): ${job.allowlist.length ? job.allowlist.join(", ") : "(whole repo snapshot)"}

Project context:
${projectContext}

Rules:
- Implement ONLY the objective. No refactors, no unrelated files.
- Use project capability tools (db.*, auth.*, stripe.*) — never raw env keys.
- After edits, run: tsc --noEmit + scoped tests. Report structured events, not chat dumps.
- Never run git push, deploy, or read .env. Control plane handles integration.`;
}

export async function reportEvent(apiBase: string, taskId: string, ev: StructuredEvent) {
  await fetch(`${apiBase}/tasks/${taskId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: ev.type, payload: ev }),
  });
}



export async function runJob(job: WorkerJob, apiBase: string) {
  const { execSync } = await import("node:child_process");
  await reportEvent(apiBase, job.taskId, { type: "intent", objective: job.objective });
  try {
    let usedSdk = false;
    try {
      const sdk: any = await import("@opencode-ai/sdk");
      const create = sdk.createOpencodeClient ?? sdk.default?.createOpencodeClient;
      if (typeof create === "function") {
        const client = create({ baseUrl: process.env.OPENCODE_SERVER_URL ?? "http://127.0.0.1:4096" });
        
        if (client?.session?.create && client?.session?.prompt) {
          const session = await client.session.create({ directory: job.workdir });
          await client.session.prompt({
            sessionID: session?.id ?? session?.sessionID,
            parts: [{ type: "text", text: job.objective }],
          });
          usedSdk = true;
        }
      }
    } catch {
      usedSdk = false;
    }
    if (!usedSdk) {
      execSync(`opencode run "${job.objective.replace(/"/g, "'")}"`, {
        cwd: job.workdir,
        stdio: "inherit",
        env: { ...process.env, OPENCODE_PERMISSION: "deny:git push,deny:read:.env*" },
      });
    }
    await fetch(`${apiBase}/tasks/${job.taskId}/done`, { method: "POST" });
  } catch (e: any) {
    await reportEvent(apiBase, job.taskId, { type: "error", message: String(e?.message ?? e) });
    throw e;
  }
}
