"use strict";



const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawn, execSync } = require("node:child_process");
const { startBackend, stopBackend, probe } = require("./services.js");
const { startDatastore } = require("./datastore.js");

const PORT = Number(process.env.PORT || process.env.API_PORT || 4100);
const SMOKE = process.argv.includes("--smoke");
const LAUNCH_TEST = process.argv.includes("--launch-test");

const EMBEDDED = app.isPackaged || process.env.CREW_EMBEDDED === "1";


if (app.isPackaged && !process.env.OPENCODE_BASE_PORT) process.env.OPENCODE_BASE_PORT = "5000";
let datastore = null;
let children = [];
let win = null;
let quitting = false;

function shutdown() {
  if (quitting) return;
  quitting = true;
  stopBackend(children);
  children = [];
  if (datastore) {
    datastore.stop().catch(() => {});
    datastore = null;
  }
  try {
    const l = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    if (l.pid === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

function repoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}


function runMigrate(bundledPath, assetsDir) {
  return new Promise((resolve) => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", CREW_INFRA: path.join(assetsDir, "infra") };
    const args = bundledPath ? [bundledPath] : [path.join(repoRoot(), "infra", "migrate.mjs")];
    const child = spawn(process.execPath, args, { env, cwd: repoRoot(), stdio: "inherit" });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

function isLocalUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url);
}




function bootPaths() {
  if (!app.isPackaged) return { serverDir: "", cwd: undefined };
  const R = process.resourcesPath;
  process.env.WEB_OUT = process.env.WEB_OUT || path.join(R, "web");
  process.env.CREW_ASSETS = process.env.CREW_ASSETS || R;
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://crewcode:crewcode@localhost:5432/crewcode";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  return { serverDir: path.join(R, "server"), cwd: app.getPath("userData") };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 620,
    title: "CrewCode",
    backgroundColor: "#0e1220",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "loading.html"));

  
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalUrl(url)) return { action: "allow" };
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isLocalUrl(url)) {
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  win.on("closed", () => (win = null));
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}



const BUILD_ID = (() => {
  try {
    return String(fs.statSync(process.execPath).mtimeMs);
  } catch {
    return "dev";
  }
})();
const LOCK_FILE = path.join(app.getPath("userData"), "instance.json");
function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {}
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
let replacedOld = false;
if (app.isPackaged) {
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    if (lock?.pid && lock.pid !== process.pid && pidAlive(lock.pid) && lock.build !== BUILD_ID) {
      console.log("[desktop] replacing older running build…");
      try {
        execSync(`taskkill /PID ${lock.pid} /T /F`, { stdio: "ignore" });
      } catch {}
      for (let i = 0; i < 25 && pidAlive(lock.pid); i++) sleepSync(200);
      replacedOld = true;
    }
  } catch {}
}

if (replacedOld) sleepSync(1500);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  
  if (app.isPackaged) {
    try {
      fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
      fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, build: BUILD_ID }));
    } catch {}
  }
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("before-quit", shutdown);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && !SMOKE) createWindow();
  });

  app.whenReady().then(async () => {
    buildMenu();
    const boot = bootPaths();

    if (EMBEDDED) {
      try {
        const assetsDir = app.isPackaged ? process.resourcesPath : repoRoot();
        const redisExe = app.isPackaged
          ? path.join(process.resourcesPath, "redis", process.platform === "win32" ? "redis-server.exe" : "redis-server")
          : path.join(repoRoot(), "build", "redis", process.platform === "win32" ? "redis-server.exe" : "redis-server");
        datastore = await startDatastore({ dataDir: path.join(app.getPath("userData"), "data"), redisExe });
        process.env.DATABASE_URL = datastore.DATABASE_URL;
        process.env.REDIS_URL = datastore.REDIS_URL;
        await runMigrate(app.isPackaged ? path.join(process.resourcesPath, "server", "migrate.cjs") : null, assetsDir);
        console.log("[desktop] embedded datastore ready");
      } catch (e) {
        console.error("[desktop] datastore failed:", e.message);
      }
    }

    if (SMOKE) {
      try {
        const res = await startBackend({ port: PORT, spawnWorkers: false, ...boot });
        children = res.children;
        const healthy = await probe(PORT);
        
        const served = await new Promise((resolve) => {
          const http = require("node:http");
          const req = http.get({ host: "127.0.0.1", port: PORT, path: "/", timeout: 2000 }, (r) => {
            let b = "";
            r.on("data", (c) => (b += c));
            r.on("end", () => resolve(r.statusCode === 200 && /<html/i.test(b)));
          });
          req.on("error", () => resolve(false));
          req.on("timeout", () => { req.destroy(); resolve(false); });
        });
        const line = `SMOKE_${healthy && served ? "OK" : "FAIL"} url=http://127.0.0.1:${PORT} packaged=${app.isPackaged} attached=${res.attached} workers=${res.children.length} html=${served}`;
        console.log(line);
        
        try { fs.writeFileSync(path.join(os.tmpdir(), "crewcode-smoke.txt"), line); } catch {}
        shutdown();
        setTimeout(() => app.exit(healthy && served ? 0 : 1), 800);
      } catch (e) {
        console.log("SMOKE_FAIL " + e.message);
        try { fs.writeFileSync(path.join(os.tmpdir(), "crewcode-smoke.txt"), "SMOKE_FAIL " + e.message); } catch {}
        shutdown();
        app.exit(1);
      }
      return;
    }

    createWindow();

    try {
      const res = await startBackend({ port: PORT, spawnWorkers: true, ...boot });
      children = res.children;
      const ok = await probe(PORT);
      if (win && ok) await win.loadURL(`http://127.0.0.1:${PORT}`);
      if (LAUNCH_TEST) {
        const title = win ? win.webContents.getTitle() : "";
        const line = `WINDOW_${win && win.webContents.getURL().includes("127.0.0.1") ? "OK" : "FAIL"} packaged=${app.isPackaged} title="${title}" visible=${win ? win.isVisible() : false}`;
        console.log(line);
        try { fs.writeFileSync(path.join(os.tmpdir(), "crewcode-smoke.txt"), line); } catch {}
        shutdown();
        setTimeout(() => app.exit(0), 500);
      }
    } catch (e) {
      console.error("[desktop] backend start failed:", e.message);
      if (win) win.loadFile(path.join(__dirname, "error.html")).catch(() => {});
    }
  });
}
