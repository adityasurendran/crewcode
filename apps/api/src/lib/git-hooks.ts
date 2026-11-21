



import { mkdirSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOK = `#!/bin/sh
# CrewCode scoped push guard: teammates may push ONLY their own crew/* branch.
while read local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/master)
      echo "crewcode: refusing to push to protected branch $remote_ref" >&2
      exit 1
      ;;
    refs/heads/crew/*)
      : # allowed
      ;;
    "")
      : # no ref
      ;;
    *)
      echo "crewcode: only crew/* branches may be pushed (attempted $remote_ref)" >&2
      exit 1
      ;;
  esac
done
exit 0
`;

export function installScopedPushHook(repoRoot: string): { path: string; installed: boolean } {
  try {
    const dir = join(repoRoot, ".git", "hooks");
    if (!existsSync(join(repoRoot, ".git"))) return { path: "", installed: false };
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "pre-push");
    writeFileSync(path, HOOK.replace(/\r?\n/g, "\n"), "utf8");
    try {
      chmodSync(path, 0o755);
    } catch {}
    return { path, installed: true };
  } catch {
    return { path: "", installed: false };
  }
}
