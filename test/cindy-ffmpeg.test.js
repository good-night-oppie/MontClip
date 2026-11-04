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
