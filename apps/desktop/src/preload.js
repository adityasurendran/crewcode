"use strict";
// Minimal, locked-down bridge. The UI already talks to the API over HTTP, so
// the renderer needs almost nothing from the main process.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("crewcode", {
  desktop: true,
  versions: {
    app: process.env.npm_package_version || "0.1.0",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
