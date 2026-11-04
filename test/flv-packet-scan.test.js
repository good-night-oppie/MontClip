"use strict";
// FLV import, VV's walk on europa (2026-11-04): a 2-hour, 8.2 GB FLV took 13 minutes in `ffprobe -show_frames` (every
// frame decoded) and was then refused for a jump in its timestamps. Deja's decision A: read packet headers only, show
// how far along the check is, and convert a recording with breaks to MP4 instead of refusing it — on the original's
// clock, checked against the original (length within 1 s, sound against picture within 40 ms). Synthetic media only.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const FF = require("../ffmpeg-path");
const { accumulator, scanReadableRange } = require("../flv-readable-range");
const P = require("../prepare-media");
const { jumpTags, makeFlv } = require("./flv-fixtures");
const available = () => FF.available("ffmpeg") && FF.available("ffprobe");
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-flvscan-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const probe = (file) => JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
const AV = [{ codec_type: "video", avg_frame_rate: "30/1", time_base: "1/1000" }, { codec_type: "audio", codec_name: "aac", sample_rate: "48000", time_base: "1/1000" }];

test("the scan reads packet headers, never decoded frames", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "flv-readable-range.js"), "utf8");
  assert.ok(!src.includes("-show_frames"), "no frame-by-frame decode");
  assert.match(src, /packet=codec_type,pts_time,dts_time,duration_time,pos/);
});

test("packets in decode order: B-frames' pts jumping around is not a break; breaks are on the dts", () => {
  const a = accumulator(AV, 0.4);
  // B-frames: pts 0.067 0.167 0.134 0.100 … dts monotonic
  for (const [pts, dts] of [[0.067, 0], [0.167, 0.034], [0.134, 0.067], [0.1, 0.1], [0.267, 0.134], [0.234, 0.167], [0.2, 0.2]])
    a.frame(`codec_type=video|pts_time=${pts}|dts_time=${dts}|duration_time=0.033`);
  for (let i = 0; i < 14; i++) a.frame(`codec_type=audio|pts_time=${(i * 0.021).toFixed(3)}|dts_time=${(i * 0.021).toFixed(3)}|duration_time=0.021`);
  const r = a.finish();
  assert.deepEqual(r.gaps, []);
  assert.equal(r.start, 0);
  assert.ok(Math.abs(r.tracks.video.start - 0.067) < 1e-9 && Math.abs(r.tracks.video.end - 0.3) < 1e-9);
  assert.equal(r.tracks.audio.packets, 14);
});

test("a break is where both stop; a late video frame with the sound running on is not one", () => {
  const a = accumulator(AV, 10);
  for (let i = 0; i < 30; i++) a.frame(`codec_type=video|pts_time=${i / 30}|dts_time=${i / 30}|duration_time=${1 / 30}`);
  a.frame(`codec_type=video|pts_time=1.5|dts_time=1.5|duration_time=${1 / 30}`);   // dropped frames, sound continues
  for (let t = 0; t < 2; t += 0.02) a.frame(`codec_type=audio|pts_time=${t}|dts_time=${t}|duration_time=0.02`);
  for (let t = 5; t < 6; t += 0.02) a.frame(`codec_type=audio|pts_time=${t}|dts_time=${t}|duration_time=0.02`);   // 3 s without sound
  const r = a.finish();
  assert.equal(r.gaps.length, 1);
  assert.ok(Math.abs(r.gaps[0].at - 2) < 0.03 && Math.abs(r.gaps[0].length - 3) < 0.03, JSON.stringify(r.gaps));
  assert.ok(r.duration > 5.9, "the break stays in the readable length");
});

test("real FLV: a clean file has no break, a jump of 3 s at 4 s is found, progress runs up to 100 %", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t), clean = path.join(dir, "clean.flv"), jumped = path.join(dir, "jumped.flv");
  makeFlv(clean, { seconds: 8 });
  jumpTags(clean, jumped, { at: 4000, by: 3000 });
  const seen = [];
  const r = await scanReadableRange(clean, probe(clean).streams, probe(clean).format.duration, { onProgress: (f) => seen.push(f) });
  assert.deepEqual(r.gaps, []);
  assert.ok(Math.abs(r.duration - 8) < 0.1, String(r.duration));
  assert.equal(seen.at(-1), 1);
  assert.ok(seen.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= seen[i - 1])), "never backwards");
  const g = await scanReadableRange(jumped, probe(jumped).streams, probe(jumped).format.duration);
  assert.equal(g.gaps.length, 1, JSON.stringify(g.gaps));
  assert.ok(Math.abs(g.gaps[0].at - 4) < 0.1 && Math.abs(g.gaps[0].length - 3) < 0.1, JSON.stringify(g.gaps));
  assert.ok(Math.abs(g.duration - 11) < 0.1, "the readable length keeps the break: " + g.duration);
});

test("real FLV: variable frame rate (30 fps, then 15) with continuous sound is not a break", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t), vfr = path.join(dir, "vfr.flv");
  makeFlv(vfr, { seconds: 6, filter: "select='lt(t\\,3)+not(mod(n\\,2))'", video: ["-fps_mode", "passthrough", "-c:v", "flv"] });
  const r = await scanReadableRange(vfr, probe(vfr).streams, probe(vfr).format.duration);
  assert.deepEqual(r.gaps, []);
});

test("the conversion check: same length within 1 s, sound against picture within 40 ms, no sound claimed that is not there", () => {
  const range = { duration: 11, tracks: { video: { start: 0.021, end: 11.021 }, audio: { start: 0, end: 11.01, packets: 0 } } };
  const out = (o = {}) => ({ duration: 11, tracks: { video: { start: 0.021, end: 11.021 }, audio: { start: 0, end: 11.01, packets: 516, ...o } } });
  const streams = [{ codec_type: "audio", sample_rate: "48000" }];
  assert.equal(P.conversionCheck(range, out(), streams).ok, true);
  assert.equal(P.conversionCheck(range, { ...out(), duration: 9.5 }, streams).ok, false, "1.5 s short");
  const late = P.conversionCheck(range, out({ start: 0.06 }), streams);
  assert.equal(late.ok, false); assert.ok(late.avOffset > 0.04);
  // a copied AAC track with a 3 s hole: the MP4 claims 11 s of sound but holds 8 s of packets
  const hollow = P.conversionCheck(range, out({ packets: 376 }), streams);
  assert.equal(hollow.ok, false); assert.ok(hollow.avOffset > 2.9, String(hollow.avOffset));
  assert.equal(P.conversionCheck(range, { duration: 11, tracks: { video: range.tracks.video } }, streams).ok, false, "the sound went missing");
});

test("prepareMedia: a break needs the yes; without an H.264 encoder an FLV1 recording says so plainly", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t), clean = path.join(dir, "clean.flv"), jumped = path.join(dir, "jumped.flv");
  makeFlv(clean, { seconds: 6 }); jumpTags(clean, jumped, { at: 3000, by: 2000 });
  const refused = await P.prepareMedia(jumped).catch((e) => e);
  assert.equal(refused.code, "FLV_TIMELINE_GAP");
  assert.equal(refused.gaps.length, 1);
  const pub = P.publicPreparationError(refused);
  assert.equal(pub.gaps.length, 1, "the page gets where the break is");
  assert.ok(!JSON.stringify(pub).includes(dir), "no private path");
  await assert.rejects(P.prepareMedia(jumped, { fixGaps: true, allowTranscode: true, acceptReadable: true, chooseEncoder: async () => [] }), { code: "FLV_ENCODER_MISSING" });
  assert.deepEqual(fs.readdirSync(dir).sort(), ["clean.flv", "jumped.flv"], "nothing left behind");
});

test("prepareMedia: a recording with a break becomes an MP4 on the original's clock, checked", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const encoders = await P.usableH264();
  if (!encoders.length) {
    if (process.platform === "win32") assert.fail("usableH264() found no H.264 encoder on Windows (h264_mf should always work)");
    t.skip("no H.264 encoder works here (the bundled LGPL build has no software one)"); return;
  }
  const dir = tmp(t), clean = path.join(dir, "clean.flv"), jumped = path.join(dir, "jumped.flv");
  makeFlv(clean, { seconds: 8, video: ["-c:v", encoders[0], "-pix_fmt", encoders[0] === "h264_nvenc" ? "yuv420p" : "nv12", "-b:v", "1M"] });
  jumpTags(clean, jumped, { at: 4000, by: 3000 });
  const before = fs.readFileSync(jumped);
  const phases = [], progress = [];
  const r = await P.prepareMedia(jumped, { fixGaps: true, acceptReadable: true, onProgress: (f) => progress.push(f), onPhase: (p) => phases.push(p) });
  assert.equal(r.preparation, "convert");
  assert.equal(r.gaps.length, 1);
  assert.deepEqual(phases, ["check"]);
  assert.ok(progress.length && progress.every((f) => f >= 0 && f <= 1));
  const mp4 = path.join(dir, decodeURIComponent(r.src.slice("/media/".length)));
  const range = await scanReadableRange(jumped, probe(jumped).streams, probe(jumped).format.duration);
  const out = await scanReadableRange(mp4, probe(mp4).streams, probe(mp4).format.duration);
  const check = P.conversionCheck(range, out, probe(mp4).streams);
  assert.ok(check.ok, JSON.stringify(check));
  assert.ok(Math.abs(out.duration - 11) < 0.2, "the break keeps its length: " + out.duration);
  assert.ok(out.tracks.audio.packets * 1024 / 48000 > 10.9, "the break is filled with silence");
  assert.deepEqual(fs.readFileSync(jumped), before, "the original is untouched");
  // the copied-audio MP4 the check exists to catch
  const hollow = path.join(dir, "hollow.mp4");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-i", jumped, "-c", "copy", hollow]);
  const h = P.conversionCheck(range, await scanReadableRange(hollow, probe(hollow).streams, probe(hollow).format.duration), probe(hollow).streams);
  assert.equal(h.ok, false, JSON.stringify(h));
});
