/* Which FFmpeg MontClip runs (ffmpeg-path.js). JJ P1 (2026-11-04): bundled first, then PATH, then the user's choice —
   the PATH / choice order is pinned in test/ffmpeg-detect.test.js; this file pins the bundled part.
   · no production code spawns a bare "ffmpeg" / "ffprobe" (PATH is looked up to an absolute path, never by spawn)
   · the resolver: packaged dir, dev overrides, vendor folder, plain errors
   · a server started with an empty PATH still previews and exports with the
     bundled build, and says so plainly — without hanging — when it is missing */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { makeDataDir, seedProject, startServer } = require("./helpers");
const FF = require("../server/ffmpeg-path");

const ROOT = path.join(__dirname, "..");
const PLAT = `${process.platform}-${process.arch}`;
const VENDOR = path.join(ROOT, "vendor", "ffmpeg", PLAT);
const exe = (n) => (process.platform === "win32" ? n + ".exe" : n);
const HAS_VENDOR = fs.existsSync(path.join(VENDOR, exe("ffmpeg"))) && fs.existsSync(path.join(VENDOR, exe("ffprobe")));
const vendorSkip = HAS_VENDOR ? false : `bundled FFmpeg not fetched for ${PLAT} (node desktop/fetch-ffmpeg.cjs)`;

test("no production code runs ffmpeg or ffprobe by bare name (that would search PATH)", () => {
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js")).map((f) => path.join(ROOT, f))
    // the scripts the page and the server share were at the root until #281 stage 3: still read, in shared/
    .concat(fs.readdirSync(path.join(ROOT, "shared")).filter((f) => f.endsWith(".js")).map((f) => path.join(ROOT, "shared", f)))
    .concat(fs.readdirSync(path.join(ROOT, "desktop")).filter((f) => /\.c?js$/.test(f) && f !== "fetch-ffmpeg.cjs")
      .map((f) => path.join(ROOT, "desktop", f)));
  const bad = [];
  const call = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|run|runFfmpeg)\s*\(\s*["'`](ffmpeg|ffprobe)\b/g;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(call)) bad.push(`${path.relative(ROOT, f)}: ${m[0]}`);
    if (/ffmpeg\s*=\s*["']ffmpeg["']/.test(src)) bad.push(`${path.relative(ROOT, f)}: default ffmpeg = "ffmpeg"`);
  }
  assert.deepEqual(bad, []);
});

test("resolver: packaged builds use only the bundled folder and ignore dev overrides", () => {
  const dir = path.resolve("/res/ffmpeg");
  const have = new Set([path.join(dir, exe("ffmpeg"))]);
  const r = FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: dir, MONTCLIP_FFMPEG: path.resolve("/x/ffmpeg") }, exists: (p) => have.has(p) });
  assert.deepEqual(r, { ok: true, path: path.join(dir, exe("ffmpeg")), source: "packaged" });
  const miss = FF.resolveTool("ffprobe", { env: { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: dir }, exists: (p) => have.has(p) });
  assert.equal(miss.ok, false);
  assert.equal(miss.path, path.join(dir, exe("ffprobe")));
  assert.match(miss.error, /bundled ffprobe is missing.*Reinstall MontClip/);
});

test("resolver: a host that installs FFmpeg itself says what to do instead of reinstalling (MONTCLIP_FFMPEG_REMEDY, #215 E4)", () => {
  // the Cindy plugin downloads FFmpeg on first use: "reinstall MontClip" would send the streamer the wrong way
  const dir = path.resolve("/res/ffmpeg");
  const remedy = "In Cindy, install it from the MontClip editor tab's banner, or ask the chat to run montclip_install_ffmpeg.";
  const env = { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_REMEDY: remedy };
  const missing = FF.resolveTool("ffmpeg", { env: { ...env, MONTCLIP_FFMPEG_DIR: dir }, exists: () => false });
  assert.equal(missing.ok, false);
  assert.ok(missing.error.endsWith(" " + remedy), missing.error);
  assert.doesNotMatch(missing.error, /Reinstall MontClip/);
  const noDir = FF.resolveTool("ffprobe", { env, exists: () => false });
  assert.ok(noDir.error.endsWith(" " + remedy), noDir.error);
  // unset or blank: the Windows app's own advice
  for (const r of ["", "   "]) assert.match(FF.resolveTool("ffmpeg", { env: { ...env, MONTCLIP_FFMPEG_REMEDY: r, MONTCLIP_FFMPEG_DIR: dir }, exists: () => false }).error, /Reinstall MontClip to restore it\.$/);
});

test("resolver: development overrides must be full paths to existing files", () => {
  const p = path.resolve("/tools/ffmpeg.exe");
  // MONTCLIP_FFMPEG also passes the 6.0 gate (P10, 2026-11-05; test/ffmpeg-detect.test.js) — a passing one here
  assert.deepEqual(FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG: p }, exists: (x) => x === p, usable: () => true }), { ok: true, path: p, source: "env" });
  const bare = FF.resolveTool("ffmpeg", { env: { MONTCLIP_FFMPEG: "ffmpeg" }, exists: () => true });
  assert.equal(bare.ok, false);
  assert.match(bare.error, /must be the full path/);
  const gone = FF.resolveTool("ffprobe", { env: { MONTCLIP_FFPROBE: path.resolve("/nope/ffprobe") }, exists: () => false });
  assert.equal(gone.ok, false);
  assert.match(gone.error, /no file there/);
  const d = path.resolve("/ff");
  assert.equal(FF.resolveTool("ffprobe", { env: { MONTCLIP_FFMPEG_DIR: d }, platform: "linux", exists: (x) => x === path.join(d, "ffprobe") }).source, "env-dir");
});

test("resolver: with nothing set it uses vendor/, and when that is empty it says how to fix it — never PATH", () => {
  const app = path.resolve("/app");
  const v = path.join(app, "vendor", "ffmpeg", "linux-x64", "ffmpeg");
  assert.deepEqual(FF.resolveTool("ffmpeg", { env: { PATH: "/usr/bin" }, appDir: app, platform: "linux", arch: "x64", exists: (x) => x === v }),
    { ok: true, path: v, source: "vendor" });
  const r = FF.resolveTool("ffmpeg", { env: { PATH: "/usr/bin" }, appDir: app, platform: "linux", arch: "x64", exists: () => false });
  assert.equal(r.ok, false);
  assert.ok(path.isAbsolute(r.path), "a missing tool still resolves to an absolute path, so spawn cannot search PATH");
  assert.match(r.error, /fetch-ffmpeg\.cjs.*MONTCLIP_FFMPEG/);
});

/* Environment for a server that cannot see any system ffmpeg. */
function noPathEnv(t, extra) {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "fc-nopath-"));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  return { PATH: empty, Path: empty, MONTCLIP_FFMPEG: "", MONTCLIP_FFPROBE: "", MONTCLIP_FFMPEG_DIR: "",
    MONTCLIP_FFMPEG_PACKAGED: "", FABLECUT_NO_FS_WATCH: "1", ...extra };
}
const post = (base, p, body) => fetch(base + p, { method: "POST", body: JSON.stringify(body) });

test("an empty PATH still previews and exports with the bundled FFmpeg (packaged layout)", { skip: vendorSkip }, async (t) => {
  const ffmpeg = path.join(VENDOR, exe("ffmpeg")), ffprobe = path.join(VENDOR, exe("ffprobe"));
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  execFileSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=160x90:r=10:d=2", "-c:v", "mpeg4", path.join(dir, "media", "clip.mp4")]);
  const { base } = await startServer(t, dir, noPathEnv(t, { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: VENDOR }));

  assert.deepEqual(await (await fetch(base + "/api/export/ffmpeg")).json(), { available: true });

  const still = await fetch(base + "/api/frame?src=/media/clip.mp4&t=1&w=64");
  assert.equal(still.status, 200);
  assert.equal(still.headers.get("content-type"), "image/jpeg");
  const jpg = Buffer.from(await still.arrayBuffer());
  assert.deepEqual([...jpg.subarray(0, 2)], [0xff, 0xd8]);

  const info = await (await fetch(base + "/api/media-info?src=/media/clip.mp4")).json();
  assert.equal(info.info.probe, "ffprobe");
  assert.equal(info.info.width, 160);

  const begin = await post(base, "/api/export/begin", { fps: 10, name: "nopath", hasAudio: false, duration: 0.3,
    delivery: { preset: "archive" }, canvasW: 64, canvasH: 64 });
  const sess = await begin.json();
  assert.equal(begin.status, 200, sess.error);
  // full-chroma outputs (archive is FFV1 4:2:2 10-bit) take raw RGBA canvas frames instead of JPEG
  const body = sess.input === "rgba" ? Buffer.alloc(64 * 64 * 4 * 3, 0x80) : Buffer.concat(Array(3).fill(jpg));
  const up = await fetch(base + "/api/export/frame?id=" + sess.id, { method: "POST", body });
  assert.equal(up.status, 200);
  const end = await (await fetch(base + "/api/export/end?id=" + sess.id, { method: "POST" })).json();
  assert.ok(end.src, end.error);
  const out = path.join(dir, end.src.replace(/^\//, ""));
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,nb_read_frames", "-count_frames", "-of", "json", out], { encoding: "utf8" }));
  assert.equal(probe.streams[0].codec_name, "ffv1");
  assert.equal(+probe.streams[0].nb_read_frames, 3);
});

test("without the bundled FFmpeg the server says so plainly and does not hang", async (t) => {
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.writeFileSync(path.join(dir, "media", "clip.mp4"), "not really a video");
  const gone = path.join(dir, "no-ffmpeg-here");
  const { base } = await startServer(t, dir, noPathEnv(t, { MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: gone }));

  const ff = await (await fetch(base + "/api/export/ffmpeg")).json();
  assert.equal(ff.available, false);
  assert.match(ff.reason, /bundled ffmpeg is missing.*Reinstall MontClip/);

  const t0 = Date.now();
  const frame = await fetch(base + "/api/frame?src=/media/clip.mp4&t=0");
  assert.ok(frame.status >= 400 && frame.status < 600);
  assert.match((await frame.json()).error, /bundled ffmpeg is missing/);
  const begin = await post(base, "/api/export/begin", { fps: 10, name: "x", hasAudio: false, delivery: { preset: "archive" }, canvasW: 64, canvasH: 64 });
  assert.equal(begin.status, 400);
  assert.match((await begin.json()).error, /bundled ffmpeg is missing/);
  const info = await (await fetch(base + "/api/media-info?src=/media/clip.mp4")).json();
  assert.equal(info.info.probe, "stat");
  assert.ok(Date.now() - t0 < 10000, "the refusals come back promptly");
});

// QQ (#28, 5c986adf): every runtime file anywhere in the repository — .js, .cjs and .mjs, not only the root and desktop/ —
// so a new file cannot slip past. Allowed by name, and only these: CI scripts (they make fixtures with the runner's own
// ffmpeg and never ship), tests, and the demo-media generator (a development script; the demo ships its outputs only).
test("no runtime .js / .cjs / .mjs file anywhere runs ffmpeg or ffprobe by name", () => {
  const { execFileSync } = require("node:child_process");
  const ALLOWED_DIRS = [".github/scripts/", "test/"];
  const ALLOWED_FILES = ["docs/demo/make-media.js"];
  for (const f of ALLOWED_FILES) assert.ok(fs.existsSync(path.join(ROOT, f)), "an allowed file that no longer exists: " + f);
  const files = execFileSync("git", ["ls-files", "*.js", "*.cjs", "*.mjs"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n")
    .filter((f) => f && !ALLOWED_DIRS.some((d) => f.startsWith(d)) && !ALLOWED_FILES.includes(f));
  assert.ok(files.length > 100, "the scan sees the repository's files: " + files.length);
  const call = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|run|runFfmpeg)\s*\(\s*["'`](ffmpeg|ffprobe)\b/g;
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(call)) bad.push(`${f}: ${m[0]}`);
    if (/\b(?:ffmpeg|ffprobe)\s*=\s*["'`](?:ffmpeg|ffprobe)["'`]/.test(src)) bad.push(`${f}: a default that names ffmpeg / ffprobe`);
  }
  assert.deepEqual(bad, []);
});
