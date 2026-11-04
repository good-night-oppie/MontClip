/* The Cindy plugin's first-use ffmpeg: the pinned LGPL build of desktop/ffmpeg-manifest.json (the one the Windows
   app bundles), downloaded by cindy.downloads and installed by the worker with fetch-ffmpeg.cjs's own staged install
   and LGPL check. Archives here are generated folders and stand-in programs; nothing is downloaded. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ROOT, seedProject } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const { ffmpegSpec, installFfmpeg } = require(path.join(PLUGIN, "node", "lib.cjs"));
const F = require("../desktop/fetch-ffmpeg.cjs");
const manifest = require("../desktop/ffmpeg-manifest.json");
const FF = require("../ffmpeg-path");

test("the pinned build to download: URL, SHA-256 and the exact size cindy.downloads needs", () => {
  const s = ffmpegSpec(manifest, "win32-x64");
  assert.equal(s.supported, true);
  assert.equal(s.sha256, "67c30e30206b5bddcc2af9ea4f0215bbbcd2519533316997945a0fd9602a2f96");
  assert.equal(s.bytes, 167488790);
  assert.match(s.url, /^https:\/\/github\.com\/good-night-oppie\/MontClip\/releases\/download\//);
  assert.equal(s.license, "LGPL-3.0-or-later");
  assert.equal(ffmpegSpec(manifest, "linux-x64").supported, false, "no byte count pinned: not offered");
  assert.equal(ffmpegSpec(manifest, "darwin-arm64").supported, false);
  assert.equal(ffmpegSpec({ builds: { x: { url: "http://a/b", sha256: "0".repeat(64), bytes: 1 } } }, "x").supported, false, "https only");
});

function world(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ffi-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, "ffmpeg.zip");
  fs.writeFileSync(archive, "a generated stand-in archive");
  const spec = { ...ffmpegSpec(manifest, "win32-x64"), sha256: F.sha256(archive) };
  const win = process.platform === "win32", exe = (n) => (win ? n + ".exe" : n);
  const fill = (into, { programs = ["ffmpeg", "ffprobe"], body = "stand-in" } = {}) => {
    const bin = path.join(into, spec.root, "bin");
    fs.mkdirSync(bin, { recursive: true });
    for (const n of programs) fs.writeFileSync(path.join(bin, exe(n)), body + " " + n);
    fs.writeFileSync(path.join(into, spec.root, "LICENSE.txt"), "GNU LESSER GENERAL PUBLIC LICENSE");
  };
  const base = { archive, spec, dest: path.join(dir, "ffmpeg", "win32-x64"), win, tmpDir: dir, sha256: F.sha256,
    installTree: F.installTree, manifest, extract: (a, into) => fill(into), check: () => "ffmpeg version n9.0.2 (stand-in)" };
  return { dir, base, fill, exe, spec };
}

test("install: unpacked, staged, checked, swapped in; then it counts as the pinned build", (t) => {
  const w = world(t);
  const out = installFfmpeg(w.base);
  assert.deepEqual([out.installed, out.version], [true, "ffmpeg version n9.0.2 (stand-in)"]);
  assert.equal(fs.readFileSync(path.join(w.base.dest, w.exe("ffmpeg")), "utf8"), "stand-in ffmpeg");
  const src = JSON.parse(fs.readFileSync(path.join(w.base.dest, "SOURCE.json"), "utf8"));
  assert.deepEqual([src.sha256, src.license], [w.spec.sha256, "LGPL-3.0-or-later"]);
  assert.equal(F.upToDate(w.base.dest, w.spec, { win: w.base.win }).ok, true);
  assert.deepEqual(fs.readdirSync(w.dir).filter((f) => f.startsWith("montclip-ffmpeg-")), [], "the unpack folder is gone");
});

test("install refuses a GPL build, a wrong archive and one without the programs, and keeps what was there", (t) => {
  const w = world(t);
  installFfmpeg(w.base);   // a good build first
  const gpl = () => { throw new Error("ffmpeg is a GPL or non-free build; MontClip bundles LGPL only"); };
  assert.throws(() => installFfmpeg({ ...w.base, extract: (a, into) => w.fill(into, { body: "gpl" }), check: gpl }), /GPL or non-free/);
  assert.equal(fs.readFileSync(path.join(w.base.dest, w.exe("ffmpeg")), "utf8"), "stand-in ffmpeg", "the LGPL build stays");
  let unpacked = false;
  assert.throws(() => installFfmpeg({ ...w.base, spec: { ...w.spec, sha256: "0".repeat(64) }, extract: () => { unpacked = true; } }),
    (e) => e.code === "SHA256_MISMATCH");
  assert.equal(unpacked, false, "a wrong archive is not even unpacked");
  assert.throws(() => installFfmpeg({ ...w.base, extract: (a, into) => w.fill(into, { programs: ["ffmpeg"] }) }), (e) => e.code === "BAD_ARCHIVE");
  assert.throws(() => installFfmpeg({ ...w.base, archive: path.join(w.dir, "none.zip") }), (e) => e.code === "NO_ARCHIVE");
  assert.equal(F.upToDate(w.base.dest, w.spec, { win: w.base.win }).ok, true);
});

test("the packaged-ffmpeg message says what to do in Cindy instead of 'reinstall'", () => {
  const dir = path.join(os.tmpdir(), "montclip-no-ffmpeg-here");
  const r = FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: dir, MONTCLIP_FFMPEG_REMEDY: "Install it from the editor tab." }, exists: () => false });
  assert.equal(r.ok, false);
  assert.match(r.error, /is missing .*\. Install it from the editor tab\.$/);
  const app = FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: dir }, exists: () => false });
  assert.match(app.error, /Reinstall MontClip to restore it\.$/, "the Windows app's message is unchanged");
});

test("manifest: downloads only from GitHub's release hosts; the install tool and the banner are wired", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.deepEqual(m.network.hosts, ["github.com", "release-assets.githubusercontent.com"]);
  assert.ok(m.tools.some((x) => x.name === "montclip_install_ffmpeg" && /只在用户同意下载后调用/.test(x.description)));
  const main = fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8");
  assert.match(main, /cindy\.downloads\.start\(\{ id: 'ffmpeg-' \+ spec\.platform, url: spec\.url, sha256: spec\.sha256, bytes: spec\.bytes \}\)/);
  assert.match(main, /downloadTokens: \{ archive: d\.token \}/);
  const view = fs.readFileSync(path.join(PLUGIN, "task-view.html"), "utf8");
  assert.match(view, /id="ffmpegGet"/);
  assert.match(fs.readFileSync(path.join(PLUGIN, "build.cjs"), "utf8"), /"ffmpeg-manifest\.json", "fetch-ffmpeg\.cjs"/);
});

test("worker: without the download, ffmpeg is missing, and an install with no archive is refused", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-cindy-ff-"));
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(seedProject()));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [path.join(PLUGIN, "node", "worker.cjs")], {
    env: { ...process.env, MONTCLIP_CINDY_APP: ROOT, MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" }, stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => new Promise((r) => { if (child.exitCode !== null) return r(); child.once("exit", r); child.kill(); }));
  let buf = "", n = 0; const pend = new Map();
  child.stdout.on("data", (c) => { buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pend.get(m.id)?.(m); } });
  const rpc = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const spec = (await rpc("montclip/ffmpeg-spec")).result;
  if (process.platform === "win32" && process.arch === "x64") assert.deepEqual([spec.supported, spec.state, spec.bytes], [true, "missing", 167488790]);
  assert.equal((await rpc("montclip/start")).result.ffmpeg, "missing");
  const r = await rpc("montclip/ffmpeg-install", {});
  if (spec.supported) assert.equal(r.error.data.code, "NO_ARCHIVE");
});

/* VV (2026-11-04): a failed install never shows the raw English error first. It says why in plain words — the
   checksum, the download stopping, no room, no permission, or something else — always offers 重试, and puts the raw
   error on a small line. The words are VV's drafts, waiting for JJ. */
const FAIL = require(path.join(PLUGIN, "ffmpeg-failure.js"));

test("install failures: each code says why in plain words, the raw error goes small, never first", () => {
  const cases = [
    ["SHA256_MISMATCH", "archive SHA-256 mismatch: got 1a2b, pinned 9f8e", "checksum", "下载的文件不完整，可能是网络断了一下。"],
    ["CHECKSUM", "", "checksum", "下载的文件不完整，可能是网络断了一下。"],
    ["BAD_ARCHIVE", "the archive has no ffprobe", "checksum", "下载的文件不完整，可能是网络断了一下。"],
    ["DOWNLOAD_FAILED", "下载失败，请重试（网络、权限或文件校验未通过）", "interrupted", "下载断了，可能是网络不稳。"],
    ["NETWORK", "socket hang up", "interrupted", "下载断了，可能是网络不稳。"],
    ["CANCELLED", "下载已取消", "interrupted", "下载断了，可能是网络不稳。"],
    ["NO_ARCHIVE", "no downloaded archive was handed over", "interrupted", "下载断了，可能是网络不稳。"],
    ["ENOSPC", "ENOSPC: no space left on device, write", "disk", "电脑上的空间不够了，腾出一些再试。"],
    ["DISK", "", "disk", "电脑上的空间不够了，腾出一些再试。"],
    ["EACCES", "EACCES: permission denied, open 'C:\\ffmpeg'", "permission", "没有权限往 MontClip 的文件夹里写文件。"],
    ["EPERM", "EPERM: operation not permitted, rename", "permission", "没有权限往 MontClip 的文件夹里写文件。"],
    ["UNPACK_FAILED", "unpacking failed: tar: bad header", "other", "ffmpeg 没装上。"],
    ["INSTALL_FAILED", "the staged ffmpeg is a GPL build", "other", "ffmpeg 没装上。"],
    [undefined, undefined, "other", "ffmpeg 没装上。"],
  ];
  for (const [code, message, reason, words] of cases) {
    const f = FAIL.describe(code, message);
    assert.equal(f.reason, reason, String(code));
    assert.equal(f.text, words + "点「重试」再来一次。", String(code));
    assert.equal(f.detail, (message || "").trim(), "the raw error, whole, for the small line");
    assert.doesNotMatch(f.text, /SHA|ENOSPC|EACCES|archive|mismatch|LGPL|GitHub/i, "no raw words in the sentence");
  }
  // no code (an older host, or tar's own words): read from the message
  assert.equal(FAIL.reasonOf("", "Write failed: No space left on device"), "disk");
  assert.equal(FAIL.reasonOf("PROTOCOL_ERROR", "Access is denied."), "permission");
  for (const reason of ["checksum", "interrupted", "disk", "permission", "other"]) assert.ok(FAIL.TEXT.en[reason], reason);
});

test("install failures: tar's words become a code; the worker's code reaches the banner through main.js", async () => {
  const { unpackCode } = require(path.join(PLUGIN, "node", "lib.cjs"));
  assert.equal(unpackCode("tar: ffmpeg.exe: Write failed: No space left on device"), "ENOSPC");
  assert.equal(unpackCode("tar: Cannot open: Permission denied"), "EACCES");
  assert.equal(unpackCode("tar: Damaged tar archive"), "UNPACK_FAILED");
  const vm = require("node:vm");
  // main.js in a sandbox: the download fails without a code (as Cindy 49fbcc4d does), then an install fails with one
  async function run(download, install) {
    const posted = [];
    class BroadcastChannel { postMessage(m) { posted.push(JSON.parse(JSON.stringify(m))); } addEventListener() { } }
    const cindy = {
      node: { request: async (r) => r.method === "montclip/ffmpeg-spec" ? { ok: true, result: { supported: true, platform: "win32-x64", url: "https://github.com/x", sha256: "a".repeat(64), bytes: 1, state: "missing" } }
        : r.method === "montclip/ffmpeg-install" ? install : { ok: true, result: {} } },
      downloads: { start: async () => download },
      send: async () => ({ ok: true }), onHostMessage: () => { },
    };
    const ctx = { cindy, BroadcastChannel, setTimeout, clearTimeout, console, Map, Promise };
    vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8") + "\n;this.__install = installFfmpeg;", ctx);
    const r = JSON.parse(JSON.stringify(await ctx.__install()));
    return { r, failed: posted.find((m) => m.phase === "failed") };
  }
  const a = await run({ ok: false, message: "下载失败，请重试（网络、权限或文件校验未通过）" });
  assert.deepEqual([a.r.code, a.failed.code], ["DOWNLOAD_FAILED", "DOWNLOAD_FAILED"]);
  const b = await run({ ok: true, token: "t", bytes: 1 }, { ok: false, errorCode: "PROTOCOL_ERROR", message: "ENOSPC: no space left on device, write", data: { code: "ENOSPC" } });
  assert.deepEqual([b.r.code, b.failed.code, b.failed.message], ["ENOSPC", "ENOSPC", "ENOSPC: no space left on device, write"]);
  assert.equal(FAIL.describe(b.failed.code, b.failed.message).reason, "disk");
});

test("the banner: the plain words, the raw error as text on its own small line, and 重试 on every failure", () => {
  const js = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(js, /const f = window\.MontClipFfmpegFailure\.describe\(m\.code \|\| \(m\.phase === 'cancelled' \? 'CANCELLED' : ''\), m\.message\);\n\s+bannerText\(f\.text, true, f\.detail\); get\.textContent = '重试'; get\.hidden = false;/);
  assert.match(js, /d\.textContent = detail \|\| ''; d\.hidden = !detail;/);
  assert.match(js, /progress\(\{ phase: 'failed', code: r\.code, message: r\.error \}\)/);
  assert.doesNotMatch(js, /ffmpeg 没装上：' \+/, "the raw error no longer leads");
  const view = fs.readFileSync(path.join(PLUGIN, "task-view.html"), "utf8");
  assert.match(view, /<p class="detail" id="ffmpegDetail" hidden><\/p>/);
  assert.ok(view.indexOf('src="ffmpeg-failure.js"') < view.indexOf('src="frame.js"'), "loaded before frame.js");
});
