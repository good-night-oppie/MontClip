/* VV (2026-11-02): the drop-reveal and three-track runners required one synthetic input by a
   hard-coded SHA-256 (1c4e4a41…), and that file was gone. The fixture is now made by a script with
   fixed arguments, with MontClip's own (vendored) ffmpeg, and the runners check the input against the
   hash recorded when it was made. The bundled LGPL ffmpeg has no software H.264 encoder, so the video
   is VP9 (in MP4, which Electron plays); with -threads 1 and bitexact flags one ffmpeg build makes the
   same bytes every time. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto"), cp = require("node:child_process");
const { ROOT } = require("./helpers");
const F = require("../desktop/make-fixture-av.cjs");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("the fixture's arguments are fixed: 4 s, 320×180, 30 fps, VP9 + mono AAC, bitexact, no metadata", () => {
  const args = F.fixtureArgs("out.mp4");
  const s = args.join(" ");
  a.match(s, /testsrc2=size=320x180:rate=30:duration=4/);
  a.match(s, /sine=frequency=440:sample_rate=48000:duration=4/);
  a.match(s, /-c:v libvpx-vp9 .*-threads 1/);
  a.match(s, /-c:a aac .*-ac 1 -ar 48000/);
  for (const f of ["-fflags +bitexact", "-flags:v +bitexact", "-flags:a +bitexact", "-map_metadata -1"]) a.ok(s.includes(f), f);
  a.equal(args[args.length - 1], "out.mp4");
  a.deepEqual(F.SPEC, { seconds: 4, width: 320, height: 180, fps: 30, video: "vp9", audio: "aac", channels: 1 });
});

test("only MontClip's own ffmpeg, or one named explicitly; never the system PATH by accident", () => {
  const vendor = path.join(ROOT, "vendor", "ffmpeg", process.platform + "-" + process.arch, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  a.equal(F.resolveFfmpeg({ argv: ["--ffmpeg", "C:/x/ffmpeg.exe"], env: {} }), "C:/x/ffmpeg.exe");
  a.equal(F.resolveFfmpeg({ argv: [], env: { MONTCLIP_FFMPEG: "/opt/ff" } }), "/opt/ff");
  a.equal(F.resolveFfmpeg({ argv: [], env: {}, exists: () => true }), vendor);
  a.throws(() => F.resolveFfmpeg({ argv: [], env: {}, exists: () => false }), /FFMPEG_NOT_FOUND/);
});

test("the runners check the input against the hash recorded when it was made, not a fixed one", () => {
  for (const f of ["desktop/run-drop-reveal.cjs", "desktop/run-three-track.cjs"]) {
    const s = read(f);
    a.ok(!s.includes("1c4e4a41621932a3a0af00edd23a93575ff95abcb52f9d243621e17f2fc30789"), f + " still requires the old file");
    a.match(s, /require\('\.\/make-fixture-av\.cjs'\)/, f + " uses the fixture script");
    a.match(s, /ensureFixture\(input/, f + " makes the input when it is missing and checks it against its record");
  }
});

test("a record that does not match the file is refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-fixture-"));
  try {
    const file = path.join(dir, "x.mp4");
    fs.writeFileSync(file, "not the recorded bytes");
    fs.writeFileSync(file + ".json", JSON.stringify({ sha256: "0".repeat(64) }));
    a.throws(() => F.verifyFixture(file), /FIXTURE_HASH/);
    fs.writeFileSync(file + ".json", JSON.stringify({ sha256: crypto.createHash("sha256").update("not the recorded bytes").digest("hex") }));
    a.equal(F.verifyFixture(file).sha256.length, 64);
    fs.rmSync(file + ".json");
    a.throws(() => F.verifyFixture(file), /FIXTURE_RECORD_MISSING/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

let ff = null; try { ff = F.resolveFfmpeg({ argv: [], env: process.env }); } catch {}
test("with MontClip's ffmpeg present: two runs make the same bytes, in the stated format", { skip: !ff && "no vendored ffmpeg here (node desktop/fetch-ffmpeg.cjs, or MONTCLIP_FFMPEG)" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-fixture-"));
  try {
    const one = F.makeFixture(path.join(dir, "a.mp4"), { ffmpeg: ff }), two = F.makeFixture(path.join(dir, "b.mp4"), { ffmpeg: ff });
    a.equal(one.sha256, two.sha256);
    a.equal(JSON.parse(fs.readFileSync(path.join(dir, "a.mp4.json"), "utf8")).sha256, one.sha256);
    a.match(one.ffmpeg, /^ffmpeg version /);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// QQ (2026-11-02): -y overwrote an existing file, and the record next to it was overwritten too.
test("an existing file or record is never overwritten: -n, a refusal before ffmpeg runs, and the record written wx", () => {
  const args = F.fixtureArgs("out.mp4");
  a.ok(args.includes("-n") && !args.includes("-y"), "ffmpeg refuses to overwrite (-n), never -y");
  const src = fs.readFileSync(path.join(ROOT, "desktop", "make-fixture-av.cjs"), "utf8");
  a.match(src, /writeFileSync\(out \+ '\.json',[^;]*\{ flag: 'wx' \}\)/, "the record is written with wx");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-fixture-"));
  try {
    // never reaches ffmpeg: a path that is not an ffmpeg would fail differently
    const ffmpeg = path.join(dir, "not-ffmpeg.exe");
    const file = path.join(dir, "x.mp4");
    fs.writeFileSync(file, "existing bytes");
    a.throws(() => F.makeFixture(file, { ffmpeg }), /FIXTURE_EXISTS/);
    a.equal(fs.readFileSync(file, "utf8"), "existing bytes");
    a.ok(!fs.existsSync(file + ".json"), "no record is written for a refused file");
    const other = path.join(dir, "y.mp4");
    fs.writeFileSync(other + ".json", "existing record");
    a.throws(() => F.makeFixture(other, { ffmpeg }), /FIXTURE_EXISTS/);
    a.equal(fs.readFileSync(other + ".json", "utf8"), "existing record");
    a.ok(!fs.existsSync(other), "no clip is made when its record already exists");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// QQ (2026-11-02): the pinned ffmpeg build's output, fixed in the test. "20261102" is MontClip's own LGPL build
// without libopenh264 from #28 (GitHub Actions run 41397853139; win64 zip sha256 67c30e30…, its ffmpeg.exe
// sha256 39341362…). main has no ffmpeg manifest or fetch script yet (both are in #28), so a machine's
// vendor/ffmpeg can hold another build (QQ's held BtbN 20261101): the check is then skipped, not failed.
const PINNED = { version: /^ffmpeg version n9\.0\.2-42-gd7643a0fe3-20261102 /, sha256: "189f3a1e4a6b013dd088e0b69e2d2904bf58db1993630c6a5b0092dde4ca8900", bytes: 230956 };
const ffVersion = (ffmpeg) => (cp.spawnSync(ffmpeg, ["-hide_banner", "-version"], { encoding: "utf8", windowsHide: true }).stdout || "").split(/\r?\n/)[0];
function pinnedCheck(t, version, make) {
  if (!PINNED.version.test(version)) {
    t.skip(`vendor/ffmpeg is another build (${version || "unknown"}); the recorded hash belongs to #28's 20261102 build`);
    return null;
  }
  const r = make();
  a.equal(r.sha256, PINNED.sha256);
  a.equal(r.bytes, PINNED.bytes);
  return r;
}
test("MontClip's pinned ffmpeg build makes exactly the recorded fixture", { skip: !ff && "no vendored ffmpeg here" }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-fixture-"));
  try { pinnedCheck(t, ffVersion(ff), () => F.makeFixture(path.join(dir, "a.mp4"), { ffmpeg: ff })); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("another ffmpeg build in vendor/ffmpeg skips the pinned-hash check instead of failing", () => {
  let skipped = null, made = false;
  const t = { skip: (m) => { skipped = m; } };
  a.equal(pinnedCheck(t, "ffmpeg version n8.0-20261101 Copyright (c) 2000-2026 the FFmpeg developers", () => { made = true; }), null);
  a.equal(made, false, "nothing is made for another build");
  a.match(skipped, /another build \(ffmpeg version n8\.0-20261101 /);
  skipped = null;
  pinnedCheck(t, "ffmpeg version n9.0.2-42-gd7643a0fe3-20261102 Copyright (c) 2000-2026 the FFmpeg developers", () => ({ sha256: PINNED.sha256, bytes: PINNED.bytes }));
  a.equal(skipped, null, "the pinned build is checked, not skipped");
  a.throws(() => pinnedCheck(t, "ffmpeg version n9.0.2-42-gd7643a0fe3-20261102 Copyright", () => ({ sha256: "0".repeat(64), bytes: 1 })), "a wrong hash from the pinned build still fails");
});

// QQ (2026-11-02): the CLI line names the file without the user's home or the repository's absolute path.
test("the CLI prints the file's path masked", () => {
  const home = os.homedir();
  a.equal(F.displayPath(path.join(home, "clips", "a.mp4")), path.join("<user>", "clips", "a.mp4"));
  a.equal(F.displayPath(path.join(ROOT, "x", "a.mp4")), path.join("<repo>", "x", "a.mp4"));
  a.equal(F.displayPath(path.join(path.parse(ROOT).root, "elsewhere", "a.mp4")), path.join("<path>", "a.mp4"));
  const src = fs.readFileSync(path.join(ROOT, "desktop", "make-fixture-av.cjs"), "utf8");
  a.match(src, /MONTCLIP_FIXTURE \$\{JSON\.stringify\(\{ file: displayPath\(/);
});
