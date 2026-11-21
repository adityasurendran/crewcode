import { createApp } from "./app.js";
import { ensureBinDir } from "./lib/prereqs.js";
import { startAutopilot } from "./lib/autopilot.js";

// Never let one bad request take the whole server down.
process.on("unhandledRejection", (err) => console.error("[api] unhandledRejection:", String((err as any)?.message ?? err)));
process.on("uncaughtException", (err) => console.error("[api] uncaughtException:", String((err as any)?.message ?? err)));

ensureBinDir();

const { app, webBuilt } = createApp();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4100);

app.listen(port, () =>
  console.log(`[crewcode] listening on :${port}${webBuilt ? " (serving web UI + api)" : " (api only; web not built)"}`)
);

// Autopilot: stuck tasks retried, previews made, worktrees cleaned — no clicks needed.
startAutopilot();
