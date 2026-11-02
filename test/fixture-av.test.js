/* VV (2026-11-02): the drop-reveal and three-track runners required one synthetic input by a
   hard-coded SHA-256 (1c4e4a41…), and that file was gone. The fixture is now made by a script with
   fixed arguments, with MontClip's own (vendored) ffmpeg, and the runners check the input against the
   hash recorded when it was made. The bundled LGPL ffmpeg has no software H.264 encoder, so the video
   is VP9 (in MP4, which Electron plays); with -threads 1 and bitexact flags one ffmpeg build makes the
   same bytes every time. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
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
