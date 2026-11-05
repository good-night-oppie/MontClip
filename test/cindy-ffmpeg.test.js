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
  const l = ffmpegSpec(manifest, "linux-x64");
  assert.equal(l.supported, true, "Linux is offered: its byte count is pinned");
  assert.equal(l.sha256, "69a9690a4c0eb7e7059f2141de54b4ec57100741a95a04809734c6adc9a0b8ae");
  assert.equal(l.bytes, 134885400);
  assert.equal(ffmpegSpec(manifest, "darwin-arm64").supported, false);
  assert.equal(ffmpegSpec({ builds: { x: { url: "http://a/b", sha256: "0".repeat(64), bytes: 1 } } }, "x").supported, false, "https only");
});

test("every build in the manifest pins a SHA-256 and an exact byte count (cindy.downloads needs both)", () => {
  const builds = Object.entries(manifest.builds);
  assert.ok(builds.length >= 2);
  for (const [platform, b] of builds) {
    assert.match(String(b.sha256), /^[0-9a-f]{64}$/, platform + ": sha256");
    assert.ok(Number.isSafeInteger(b.bytes) && b.bytes > 0, platform + ": bytes");
    assert.equal(ffmpegSpec(manifest, platform).supported, true, platform + ": offered");
  }
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

/* JJ's final words for the export tool's banner (2026-11-04), word for word: the first banner, the progress, and
   why an install failed — never the raw English error first; 重试 where trying again can help. */
const B = require(path.join(PLUGIN, "ffmpeg-banner.js"));
const AGAIN = "点重试再来一次。";

test("banner in JJ's words: the first banner, its note and buttons; a changed install offers 重新安装", () => {
  const view = fs.readFileSync(path.join(PLUGIN, "task-view.html"), "utf8");
  assert.ok(view.includes('<p id="ffmpegText">导出视频和降噪，要先装一个免费的导出工具 ffmpeg（约 160 MB，只装一次）。</p>'));
  assert.ok(view.includes('<p class="detail" id="ffmpegDetail">从 GitHub（github.com）下载，下载时可能会转到 GitHub 存文件的网站。不会发送你的任何内容。</p>'));
  assert.ok(view.includes('<button type="button" class="primary" id="ffmpegGet">下载并安装</button>'));
  assert.ok(view.includes('<button type="button" id="ffmpegLater">以后再说</button>'));
  assert.equal(B.TEXT.zh.first, "导出视频和降噪，要先装一个免费的导出工具 ffmpeg（约 160 MB，只装一次）。");
  assert.equal(B.TEXT.zh.firstNote, "从 GitHub（github.com）下载，下载时可能会转到 GitHub 存文件的网站。不会发送你的任何内容。");
  assert.equal(B.TEXT.zh.changed, "导出工具的文件被改过，建议重新安装。");
  assert.equal(B.TEXT.zh.reinstall, "重新安装");
  const js = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(js, /if \(s\.state === 'changed'\) \{ bannerText\(window\.MontClipFfmpegBanner\.TEXT\.zh\.changed, false, window\.MontClipFfmpegBanner\.TEXT\.zh\.firstNote\); document\.getElementById\('ffmpegGet'\)\.textContent = window\.MontClipFfmpegBanner\.TEXT\.zh\.reinstall; \}/);
  assert.ok(view.indexOf('src="ffmpeg-banner.js"') > 0 && view.indexOf('src="ffmpeg-banner.js"') < view.indexOf('src="frame.js"'), "loaded before frame.js");
});

test("banner in JJ's words: the progress, speed kept", () => {
  const MB = 1048576;
  assert.equal(B.progressText({ phase: "queued" }), "正在准备下载导出工具…");
  assert.equal(B.progressText({ phase: "downloading", loaded: 64 * MB, total: 160 * MB }), "正在下载导出工具：40%（64 / 160 MB）");
  assert.equal(B.progressText({ phase: "downloading", loaded: 64 * MB, total: 160 * MB, speedBps: 4 * MB }), "正在下载导出工具：40%（64 / 160 MB，4.0 MB/s）");
  assert.equal(B.progressText({ phase: "retrying" }), "网络断了一下，正在重试…");
  assert.equal(B.progressText({ phase: "verifying" }), "下载完了，正在检查文件是不是完整…");
  assert.equal(B.progressText({ phase: "installing" }), "正在安装，并检查版本对不对…");
  assert.equal(B.progressText({ phase: "installed" }), "导出工具装好了，现在可以导出了。");
  const js = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(js, /if \(busy\) bannerText\(B\.progressText\(m\)\);/);
  assert.doesNotMatch(js, /正在下载 ffmpeg|核对校验值|LGPL 版本|ffmpeg 已装好/, "the old words are gone");
});

test("banner in JJ's words: each failure, its button; 〔复制问题信息〕 only where the sentence points to it (JJ v2)", () => {
  const cases = [
    // code, message, sentence, button, copy (the raw error itself is never on the page)
    ["SHA256_MISMATCH", "archive SHA-256 mismatch: got 1a2b, pinned 9f8e", "下载下来的文件不完整，没有安装。" + AGAIN, "retry", false],
    ["BAD_ARCHIVE", "the archive has no ffprobe", "下载下来的文件不完整，没有安装。" + AGAIN, "retry", false],
    ["DOWNLOAD_FAILED", "下载失败，请重试（网络、权限或文件校验未通过）", "下载断了，没下完。检查一下网络。" + AGAIN, "retry", false],
    ["EACCES", "EACCES: permission denied, open 'x'", "MontClip 没法往自己的文件夹里写文件，可能被杀毒软件挡住了。点重试再来一次；还不行，重启电脑再试。", "retry", false],
    ["EPERM", "EPERM: operation not permitted, rename", "MontClip 没法往自己的文件夹里写文件，可能被杀毒软件挡住了。点重试再来一次；还不行，重启电脑再试。", "retry", false],
    ["UNPACK_FAILED", "unpacking failed: tar: bad header", "解压没成功。" + AGAIN, "retry", false],
    ["INSTALL_FAILED", "the staged ffmpeg is a GPL build", "导出工具这次没装上。点〔重试〕再来一次；还不行，点「复制问题信息」发给我们。", "retry", true],
    ["PROTOCOL_ERROR", "  worker gone  ", "导出工具这次没装上。点〔重试〕再来一次；还不行，点「复制问题信息」发给我们。", "retry", true],
    [undefined, "", "导出工具这次没装上。" + AGAIN, "retry", false],
    ["CANCELLED", "下载已取消", "下载取消了，没有安装。", "install", false],
    ["UNSUPPORTED_PLATFORM", "MontClip has no pinned ffmpeg for darwin-arm64", "这台电脑的系统暂时没有对应的导出工具，导出和降噪用不了。", null, false],
    ["HOST_TOO_OLD", "This Cindy cannot download files for plugins; update Cindy.", "Cindy 版本太旧，装不了导出工具。先把 Cindy 更新到最新，再回来点下载。", null, false],
  ];
  for (const [code, message, text, button, copy] of cases) {
    const f = B.describe(code, message);
    assert.deepEqual([f.text, f.button, f.copy], [text, button, copy], String(code));
    assert.ok(!("detail" in f), "no raw error for the page");
    assert.doesNotMatch(f.text, /SHA|ENOSPC|EACCES|archive|mismatch|LGPL|staged|worker/i, "no raw words in the sentence");
  }
  assert.equal(B.describe("ENOSPC", "ENOSPC: no space left on device", { need: 350 * 1048576 }).text,
    "磁盘空间不够，删掉一些不要的文件，空出大约 350 MB。" + AGAIN);
  assert.equal(B.describe("ENOSPC", "x", { need: 350 * 1048576 }).button, "retry");
  // no code of its own: what the message says
  assert.equal(B.reasonOf("PROTOCOL_ERROR", "Write failed: No space left on device"), "disk");
  assert.equal(B.reasonOf("INSTALL_FAILED", "Access is denied."), "permission");
  for (const k of Object.keys(B.TEXT.zh)) assert.ok(k in B.TEXT.en, "English for " + k);
  const js = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(js, /get\.hidden = !f\.button; get\.textContent = f\.button === 'install' \? W\.install : W\.retry;/);
  assert.match(js, /later\.hidden = f\.reason === 'cancelled';/, "下载取消了: only 下载并安装");
  assert.match(js, /d\.textContent = note \|\| ''; d\.hidden = !note;/, "the small line is only ever the first banner's note");
});

test("磁盘空间不够: the amount is worked out — the archive + its unpacked size − the free space, rounded up", (t) => {
  const { zipUnpackedBytes, freeBytes, spaceNeeded, unpackCode } = require(path.join(PLUGIN, "node", "lib.cjs"));
  // a stored zip written here: its central directory says what it unpacks to
  function zip(entries) {
    const local = [], central = [];
    let off = 0;
    for (const [name, size] of entries) {
      const n = Buffer.from(name), data = Buffer.alloc(size, 1);
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(size, 18); h.writeUInt32LE(size, 22); h.writeUInt16LE(n.length, 26);
      local.push(h, n, data);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(size, 20); c.writeUInt32LE(size, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
      central.push(c, n);
      off += 30 + n.length + size;
    }
    const cd = Buffer.concat(central), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
    return Buffer.concat([...local, cd, e]);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-zip-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const z = path.join(dir, "ffmpeg.zip");
  fs.writeFileSync(z, zip([["bin/ffmpeg.exe", 5000], ["bin/ffprobe.exe", 3000], ["LICENSE.txt", 7]]));
  assert.equal(zipUnpackedBytes(z), 8007);
  fs.writeFileSync(path.join(dir, "not.zip"), "plain text");
  assert.equal(zipUnpackedBytes(path.join(dir, "not.zip")), null);
  assert.equal(zipUnpackedBytes(path.join(dir, "missing.zip")), null);
  assert.ok(freeBytes(path.join(dir, "not", "made", "yet")) > 0, "the nearest folder that exists");
  const MB = 1048576;
  assert.equal(spaceNeeded({ archiveBytes: 160 * MB, unpackedBytes: 250 * MB, free: 60 * MB }), 350 * MB);
  assert.equal(spaceNeeded({ archiveBytes: 160 * MB, unpackedBytes: null, free: 60 * MB }), 260 * MB, "unpacked unknown: the archive stands in");
  assert.equal(spaceNeeded({ archiveBytes: 160 * MB, unpackedBytes: 250 * MB, free: 900 * MB }), 410 * MB, "never about 0");
  assert.deepEqual([B.aboutSize(349.2 * MB), B.aboutSize(1), B.aboutSize(1.21 * 1073741824)], ["350 MB", "1 MB", "1.3 GB"], "rounded up");
  assert.equal(unpackCode("tar: ffmpeg.exe: Write failed: No space left on device"), "ENOSPC");
  assert.equal(unpackCode("tar: Cannot open: Permission denied"), "EACCES");
  assert.equal(unpackCode("tar: Damaged tar archive"), "UNPACK_FAILED");
  const worker = fs.readFileSync(path.join(PLUGIN, "node", "worker.cjs"), "utf8");
  assert.match(worker, /e\.need = spaceNeeded\(\{ archiveBytes, unpackedBytes: zipUnpackedBytes\(archive\), free: freeBytes\(/);
  assert.match(worker, /data: typeof e\.code === "string" \? \{ code: e\.code, \.\.\.\(Number\.isFinite\(e\.need\) \? \{ need: e\.need \} : \{\}\) \}/);
});

test("the worker's code (and the amount to free) reaches the banner through main.js; a cancelled download says so", async () => {
  const vm = require("node:vm");
  async function run(download, install, phases = []) {
    const posted = [];
    let handler = null;
    class BroadcastChannel { postMessage(m) { posted.push(JSON.parse(JSON.stringify(m))); } addEventListener() { } }
    const cindy = {
      node: { request: async (r) => r.method === "montclip/ffmpeg-spec" ? { ok: true, result: { supported: true, platform: "win32-x64", url: "https://github.com/x", sha256: "a".repeat(64), bytes: 1, state: "missing" } }
        : r.method === "montclip/ffmpeg-install" ? install : { ok: true, result: {} } },
      downloads: { start: async () => { for (const phase of phases) await handler({ type: "event", name: "download-progress", data: { id: "ffmpeg-win32-x64", phase } }); return download; } },
      send: async () => ({ ok: true }), onHostMessage: (fn) => { handler = fn; },
    };
    const ctx = { cindy, BroadcastChannel, setTimeout, clearTimeout, console, Map, Promise };
    vm.runInNewContext(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8") + "\n;this.__install = installFfmpeg;", ctx);
    const r = JSON.parse(JSON.stringify(await ctx.__install()));
    assert.ok(posted.filter((m) => m.phase === "failed" || m.phase === "cancelled").length <= 1, "how it ended is said once");
    return { r, failed: posted.find((m) => m.phase === "failed") };
  }
  const a = await run({ ok: false, message: "下载失败，请重试（网络、权限或文件校验未通过）" }, null, ["downloading", "failed"]);
  assert.deepEqual([a.r.code, a.failed.code], ["DOWNLOAD_FAILED", "DOWNLOAD_FAILED"]);
  const c = await run({ ok: false, message: "下载已取消" }, null, ["downloading", "cancelled"]);
  assert.deepEqual([c.r.code, c.failed.code], ["CANCELLED", "CANCELLED"], "Cindy's progress said it was cancelled");
  const need = 350 * 1048576;
  const b = await run({ ok: true, token: "t", bytes: 1 }, { ok: false, errorCode: "PROTOCOL_ERROR", message: "ENOSPC: no space left on device, write", data: { code: "ENOSPC", need } });
  assert.deepEqual([b.r.code, b.r.need, b.failed.code, b.failed.need], ["ENOSPC", need, "ENOSPC", need]);
  assert.equal(B.describe(b.failed.code, b.failed.message, { need: b.failed.need }).text, "磁盘空间不够，删掉一些不要的文件，空出大约 350 MB。" + AGAIN);
  const js = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(js, /progress\(\{ phase: 'failed', code: r\.code, need: r\.need, message: r\.error \}\)/);
});

/* JJ v2 (2026-11-04, section 1, rule 2), Deja's decision for #115–#117: what the page shows is plain words only. Where
   the sentence points to it, 〔复制问题信息〕 copies the error for us — its code and the raw error, with user paths cut
   to the file name and no keys or tokens — and the whole of it goes to the log. */
const Problem = require(path.join(PLUGIN, "problem-details.js"));
const RAW_ENGLISH = /[A-Za-z]+[ ,;:'-]+[A-Za-z]+[ ,;:'-]+[A-Za-z]+/;   // three English words in a row
function framePart() {
  const src = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  const logged = [];
  const window = { MontClipProblem: Problem };
  const f = new Function("console", "window", "MontClipProblem", "document", "navigator",
    src.slice(0, src.indexOf("(function () {")) + "\nreturn { failureText, copyButton, COPY };");
  return { src, logged, ...f({ warn: (...a) => logged.push(a.join(" ")) }, window, Problem, fakeDocument(), fakeNavigator()) };
}
/* just enough DOM for copyButton: elements with text, a click handler, append */
function fakeDocument() {
  const el = (tag) => ({ tag, textContent: "", className: "", type: "", style: {}, children: [], handlers: {},
    setAttribute() { }, select() { }, remove() { }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); },
    addEventListener(ev, fn) { this.handlers[ev] = fn; } });
  return { createElement: el, body: el("body"), execCommand: () => false };
}
let clipboard = null;
function fakeNavigator() { return { clipboard: { writeText: async (t) => { clipboard = t; } } }; }

test("the task page's failures: plain words and 〔复制问题信息〕, never the raw error (JJ v2)", async () => {
  const { src, logged, failureText, copyButton, COPY } = framePart();
  const raw = "EACCES: permission denied, open 'C:\\Users\\me\\clips-data\\project.json' token=abcdef0123456789";
  const f = failureText("MontClip 没能启动。", raw, "EACCES");
  assert.equal(f.text, "MontClip 没能启动。关掉这个页签再打开试试；还不行，点「复制问题信息」发给我们。");
  assert.doesNotMatch(f.text, RAW_ENGLISH); assert.ok(!f.text.includes("EACCES"), "no code on the page");
  assert.ok(!("detail" in f), "no raw line for the page");
  assert.ok(logged.some((l) => l.includes(raw)), "the whole error is in the log");
  assert.deepEqual(failureText("MontClip 没能启动。", ""), { text: "MontClip 没能启动。关掉这个页签再打开试试。", problem: null }, "no error: no copy button");
  // the button: JJ's words; a click copies the code and the raw error, scrubbed
  const box = fakeDocument().createElement("div");
  const b = copyButton(box, f.problem);
  assert.deepEqual([box.children[0].textContent, box.children[1].textContent], ["复制问题信息", "复制的内容不含你的文件夹路径、密钥和观众信息。"]);
  await b.handlers.click();
  assert.match(clipboard, /EACCES: EACCES: permission denied, open 'project\.json'/, "the code and the raw error, the path cut to its file name");
  for (const leak of ["Users", "me\\", "clips-data", "abcdef0123456789"]) assert.ok(!clipboard.includes(leak), leak + " in " + clipboard);
  assert.equal(box.children[1].textContent, COPY.done);
  assert.equal(COPY.done, "已经复制好了，粘贴到发给我们的消息里就行。");
  // the page puts the button in place of the raw line, on both failures
  assert.match(src, /if \(problem\) copyButton\(status, problem\);   \/\/ never the raw error itself/);
  assert.match(src, /failureText\('MontClip 没能打开这个任务的项目。', b\.error, b\.code\); show\(f\.text, true, false, f\.problem\);/);
  assert.match(src, /failureText\('MontClip 没能启动。', a\.error, a\.code\); show\(f\.text, true, false, f\.problem\);/);
  assert.doesNotMatch(src, /className = 'detail'|textContent = detail/, "no raw line anywhere on the page");
});

test("the export tool banner: 没装上 gets 〔复制问题信息〕; the raw error goes to the log, never the banner (JJ v2)", () => {
  const src = fs.readFileSync(path.join(PLUGIN, "frame.js"), "utf8");
  assert.match(src, /bannerText\(f\.text, f\.reason !== 'cancelled', '', f\.copy \? \{ code: m\.code \|\| 'INSTALL_FAILED', error: m\.message \} : null\);/);
  assert.match(src, /console\.warn\(MontClipProblem\.logLine\(\{ code: m\.code \|\| 'INSTALL_FAILED', error: m\.message \}\)\);/);
  const view = fs.readFileSync(path.join(PLUGIN, "task-view.html"), "utf8");
  assert.match(view, /<div class="copybox" id="ffmpegCopy" hidden><\/div>/);
  assert.ok(view.indexOf('src="problem-details.js"') < view.indexOf('src="frame.js"'), "problem-details.js before frame.js");
  const panel = fs.readFileSync(path.join(PLUGIN, "panel.html"), "utf8");
  assert.ok(panel.indexOf('src="problem-details.js"') > 0 && panel.indexOf('src="problem-details.js"') < panel.indexOf('src="frame.js"'));
  // copied: the code and the raw error; no user path, no token, no key
  const line = Problem.copyLine({ code: "INSTALL_FAILED", error: "the staged ffmpeg failed its check at C:\\Users\\me\\clips-data\\ffmpeg\\ffmpeg.exe (Bearer abc.def) sk-1234567890abc " + "a".repeat(64) });
  assert.match(line, /INSTALL_FAILED: the staged ffmpeg failed its check at ffmpeg\.exe/);
  for (const leak of ["Users", "clips-data", "abc.def", "sk-1234567890abc", "a".repeat(64)]) assert.ok(!line.includes(leak), leak);
});
