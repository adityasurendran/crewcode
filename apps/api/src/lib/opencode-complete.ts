



export async function opencodeComplete(
  prompt: string,
  opts?: { cwd?: string; timeoutMs?: number; model?: string }
): Promise<{ text: string; model: string }> {
  const clean = String(prompt ?? "")
    .replace(/"/g, "'")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 8000);
  if (!clean.trim()) throw new Error("prompt required");
  const { profileEnv, getProviderSettings } = await import("./opencode-profile.js");
  const settings = await getProviderSettings().catch(() => ({ model: "" }) as any);
  const { OPENCODE_CONFIG, CREW_MODEL } = await profileEnv("crew");
  const model = opts?.model || CREW_MODEL || settings?.model || "opencode-go/mimo-v2.6-pro";
  const { execSync } = await import("node:child_process");
  const out = execSync(`opencode run "${clean}" --model ${model}`, {
    cwd: opts?.cwd ?? process.cwd(),
    stdio: "pipe",
    timeout: opts?.timeoutMs ?? 300_000,
    env: {
      ...process.env,
      OPENCODE_CONFIG,
      CREW_MODEL: model,
      OPENCODE_PERMISSION: "deny:git push,deny:read:.env*",
    },
  });
  return { text: out.toString().trim().slice(-4000), model };
}
