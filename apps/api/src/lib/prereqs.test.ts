import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cloudflaredAsset, cloudflaredUrl, nodeDownload, parseNodeMajor, exe, NODE_PIN } from "./prereqs.js";

describe("prereq asset naming", () => {
  it("cloudflared asset matches platform", () => {
    const a = cloudflaredAsset();
    if (process.platform === "win32") assert.equal(a, "cloudflared-windows-amd64.exe");
    else if (process.platform === "darwin") assert.match(a, /^cloudflared-darwin-(amd64|arm64)\.tgz$/);
    else assert.match(a, /^cloudflared-linux-(amd64|arm64)$/);
    assert.ok(cloudflaredUrl().startsWith("https://github.com/cloudflare/cloudflared/releases/latest/download/"));
  });
  it("node download is exe on windows, targz elsewhere", () => {
    const dl = nodeDownload();
    assert.ok(dl.url.includes(NODE_PIN));
    if (process.platform === "win32") assert.equal(dl.kind, "exe");
    else assert.equal(dl.kind, "targz");
  });
  it("exe() adds .exe only on windows", () => {
    assert.equal(exe("cloudflared"), process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  });
});

describe("node version parsing", () => {
  it("parses majors", () => {
    assert.equal(parseNodeMajor("v20.19.0"), 20);
    assert.equal(parseNodeMajor("v24.13.0"), 24);
    assert.equal(parseNodeMajor("v18.20.4"), 18);
    assert.equal(parseNodeMajor("garbage"), null);
  });
});
