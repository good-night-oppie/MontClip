"use strict";
// FLV import, VV's walk on europa (2026-11-04): a 2-hour 8.2 GB FLV took 13 minutes in `ffprobe -show_frames` and was
// then refused for one timestamp jump. Deja's rules (2026-11-04, with Rea's ⑥, and VV's five real recordings), per
// stream, in whole milliseconds:
//   ① every break ≤ 0.5 s, however many → imported as it is (an H.264/AAC file stays a remux), a faint mark, a log line;
//   ② a break > 0.5 s → converted (an H.264/AAC file: a remux of both streams keeping their timestamps), checked
//      (length ±1 s, sound against picture ≤ 40 ms), a labelled mark;
//   ⑤ picture and sound > 40 ms apart by their packet times (clocks jumping unequally, starts or ends not lining up)
//      → re-encoded;
//   ⑥ damaged bytes behind normal timestamps → a conversion decodes everything and fails plainly, leaving no file.
// The fixtures are cut out of Rea's C0-clean.flv (test/flv-fixtures.js), so this runs without an H.264 encoder.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const FF = require("../ffmpeg-path");
const { accumulator, scanReadableRange } = require("../flv-readable-range");
const P = require("../prepare-media");
const MediaLib = require("../media-lib");
const { make, probe } = require("./flv-fixtures");
const REA = path.join(__dirname, "fixtures", "flv-truth-v2");
const available = () => FF.available("ffmpeg") && FF.available("ffprobe");
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-flvscan-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const AV = [{ codec_type: "video", avg_frame_rate: "30/1", time_base: "1/1000" }, { codec_type: "audio", codec_name: "aac", sample_rate: "48000", time_base: "1/1000" }];
const scan = (file) => { const p = probe(file); return scanReadableRange(file, p.streams, p.format.duration); };
const copyOf = (t, name) => { const d = tmp(t), f = path.join(d, name); fs.copyFileSync(path.join(REA, name), f); return { dir: d, file: f }; };

/* 「夹具 → 新规则下的期望值」: what each fixture must become, and its marks (stream:faint|labelled). The PR body's table
   is this list. `rea` = Rea's file as is; else edits of C0-clean (test/flv-fixtures.js), times in ms. */
const V = (at, len) => ["drop", { stream: "video", at, len }], A = (at, len) => ["drop", { stream: "audio", at, len, exact: true }];
// Rea's flash + beep are at 2, 7, … 57 s for 100 ms: breaks are put clear of them, so the A/V offset can be measured
// (slots at these offsets after each marker, 2 … 52 s, so a break of up to 0.43 s ends well before the next one)
const times = (n, offsets) => { const out = []; for (let k = 0; out.length < n; k++) for (const o of offsets) if (out.length < n) out.push(Math.round((2 + 5 * k + o) * 1000)); return out; };
// a typical live recording, as VV measured five real ones (europa, 2026-11-04): 25 picture drops of 34–100 ms, one of
// them 0.133 s between two frames (a 100 ms gap), and 4 holes in the sound of 58–65 ms
const LIVE = [...times(25, [0.5, 1.8, 3.1]).map((t, i) => V(t, i === 12 ? 100 : [34, 67, 34, 34, 67][i % 5])),
  A(9600, 58), A(24600, 60), A(39600, 62), A(54600, 65)];
const CASES = [
  { name: "C0-clean.flv", rea: true, expect: "import", fix: [], marks: "" },
  { name: "G-gap0.034s.flv", rea: true, expect: "import", fix: [], marks: "audio:faint video:faint" },
  { name: "G-gap0.100s.flv", rea: true, expect: "import", fix: [], marks: "audio:faint video:faint" },
  { name: "G-gap0.500s.flv", rea: true, expect: "import", fix: [], marks: "audio:faint video:faint" },
  { name: "G-gap0.600s.flv", rea: true, expect: "convert", fix: ["break"], marks: "audio:labelled video:labelled" },
  { name: "G-gap2.000s.flv", rea: true, expect: "convert", fix: ["break"], marks: "audio:labelled video:labelled" },
  { name: "drop-1-frame.flv", edits: [V(30000, 34)], expect: "import", fix: [], marks: "video:faint" },
  { name: "drop-100ms.flv", edits: [V(30000, 100)], expect: "import", fix: [], marks: "video:faint" },
  { name: "drop-500ms.flv", edits: [V(30000, 500)], expect: "import", fix: [], marks: "video:faint" },
  { name: "drop-501ms.flv", edits: [V(30000, 501)], expect: "convert", fix: ["break"], marks: "video:labelled" },
  { name: "audio-hole-58ms.flv", edits: [A(30000, 58)], expect: "import", fix: [], marks: "audio:faint" },
  { name: "typical-live.flv", edits: LIVE, expect: "import", fix: [], marks: "29 faint", av: true },
  { name: "typical-live-plus-2s.flv", edits: [...LIVE, ["jump", { at: 32000, len: 2000 }]], expect: "convert", fix: ["break"], marks: "29 faint, audio:labelled video:labelled" },
  { name: "20x-0.4s-video.flv", edits: times(20, [0.5, 2.3]).map((t) => V(t, 400)), expect: "import", fix: [], marks: "20 faint", av: true },
  { name: "audio-late-100ms.flv", edits: [["shift", { stream: "audio", by: 100 }]], expect: "convert", fix: ["drift"], marks: "" },
  { name: "clocks-jump-apart-60ms.flv", edits: [["jump", { streams: ["video"], at: 30000, len: 200 }], ["jump", { streams: ["audio"], at: 30000, len: 140 }]], expect: "convert", fix: ["drift"], marks: "audio:faint video:faint" },
  { name: "jitter-3ms.flv", edits: [["jitter", { from: 10000, to: 20000, late: 3 }]], expect: "import", fix: [], marks: "" },
];
/* Rea's measure (test/flv-truth-v2.test.js), for the imports that should stay together: the flashes by their frames'
   brightness, the beeps where silence ends; the worst distance from a flash to its nearest beep. */
function worstAV(file) {
  const run = (bin, args) => execFileSync(FF.path(bin), args, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "pipe"] });
  const flashes = [];
  for (const [t, y] of run("ffprobe", ["-v", "error", "-f", "lavfi", "-i", `movie=${file.replace(/\\/g, "/").replace(/:/g, "\\\\:")},signalstats`,
    "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"]).trim().split(/\r?\n/).map((l) => l.split(",").map(Number)))
    if (y > 128 && (!flashes.length || t - flashes.at(-1) > 1)) flashes.push(t);
  const r = require("node:child_process").spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "silencedetect=n=-30dB:d=0.5", "-f", "null", "-"], { encoding: "utf8" });
  const beeps = [...String(r.stderr).matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(flashes.length >= 10 && beeps.length >= 10, `markers found: ${flashes.length} flashes, ${beeps.length} beeps`);
  return Math.max(...flashes.map((t) => Math.min(...beeps.map((s) => Math.abs(s - t)))));
}
const markText = (gaps) => {
  const faint = gaps.filter((g) => !g.big).length, big = gaps.filter((g) => g.big);
  if (faint > 2 || (faint && big.length)) return [faint ? `${faint} faint` : "", big.map((g) => `${g.stream}:labelled`).join(" ")].filter(Boolean).join(", ");
  return gaps.map((g) => `${g.stream}:${g.big ? "labelled" : "faint"}`).join(" ");
};
module.exports = { CASES, worstAV };

test("the scan reads packet headers, never decoded frames", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "flv-readable-range.js"), "utf8");
  assert.ok(!src.includes("-show_frames"), "no frame-by-frame decode");
  assert.match(src, /packet=codec_type,pts_time,dts_time,duration_time,pos/);
});

test("rules on numbers: per stream, whole milliseconds, 0.5 s is small; totals; clocks jumping apart", () => {
  const run = (packets) => { const a = accumulator(AV, 0); for (const p of packets) a.frame(p); return a.finish(); };
  const stream = (type, from, to, step, dur, skip = []) => { const out = []; for (let t = from; t < to; t += step) if (!skip.some(([a, b]) => t > a && t < b)) out.push(`codec_type=${type}|pts_time=${t.toFixed(6)}|dts_time=${t.toFixed(6)}|duration_time=${dur}`); return out; };
  // a picture gap of 0.5000004 s (float noise) is 500 ms: small; 0.501 s is big
  const half = run([...stream("video", 0, 10, 0.1, 0.1).filter((l) => !/pts_time=(5\.[1-5])/.test(l)).map((l) => l.replace(/pts_time=(5\.6\d*)/, "pts_time=5.6000004").replace(/dts_time=(5\.6\d*)/, "dts_time=5.6000004")), ...stream("audio", 0, 10, 0.02, 0.02)]);
  assert.equal(half.gaps.length, 1); assert.equal(half.gaps[0].big, false, JSON.stringify(half.gaps)); assert.deepEqual(half.fix, []);
  assert.deepEqual(Object.keys(half.gaps[0]).sort(), ["at", "big", "len", "stream"], "the shape Rea tests: {stream, at, len} (+ big)");
  // B-frames: pts jumps around, the decode clock does not — no break
  const b = accumulator(AV, 0.3);
  for (const [pts, dts] of [[0.067, 0], [0.167, 0.034], [0.134, 0.067], [0.1, 0.1], [0.267, 0.134]]) b.frame(`codec_type=video|pts_time=${pts}|dts_time=${dts}|duration_time=0.033`);
  assert.deepEqual(b.finish().gaps, []);
  // the old frame lines still read
  const old = accumulator(AV, 1); old.frame("media_type=video|pts_time=0|duration_time=0.5"); old.frame("media_type=video|pts_time=0.9|duration_time=0.1");
  assert.equal(old.finish().gaps[0].stream, "video");
});

test("「夹具 → 新规则下的期望值」: every fixture is scanned, imported or converted, and marked as the table says", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t);
  for (const c of CASES) {
    const { file, made } = c.rea ? { file: copyOf(t, c.name).file, made: null } : make(dir, c.name, c.edits);
    const r = await scan(file);
    assert.deepEqual(r.fix, c.fix, `${c.name}: why it converts (${JSON.stringify(r.gaps)})`);
    assert.equal(markText(r.gaps), c.marks, `${c.name}: marks`);
    if (made) for (const m of made) {   // every break made is found, in its stream, where and as long as it was made
      const g = r.gaps.find((g) => g.stream === m.stream && Math.abs(g.at - m.at) < 0.002);
      assert.ok(g && Math.abs(g.len - m.len) < 0.0015, `${c.name}: ${JSON.stringify(m)} in ${JSON.stringify(r.gaps)}`);
    }
    // what prepareMedia does with it, without and with the app's yes
    const plain = await P.prepareMedia(file).catch((e) => e);
    if (c.expect === "import") {
      assert.equal(plain.preparation, "remux", `${c.name}: imported as it is (${plain.code || ""})`);
      assert.equal(plain.gapsHeld, undefined);
      assert.deepEqual(MediaLib.normalizeGaps(plain.gaps).map((g) => g.big), r.gaps.map((g) => g.big), `${c.name}: marks returned`);
      if (c.av) {   // a plain stream copy keeps picture and sound together, measured the way Rea does
        const mp4 = path.join(path.dirname(file), decodeURIComponent(plain.src.slice("/media/".length)));
        const worst = worstAV(mp4);
        assert.ok(worst <= 0.04, `${c.name}: flash and beep ${Math.round(worst * 1000)} ms apart`);
        c.measured = Math.round(worst * 1000);
      }
    } else {
      assert.equal(plain.code, "FLV_TIMELINE_GAP", `${c.name}: asks before converting`);
      assert.deepEqual(plain.fix, c.fix);
      if (c.fix.includes("drift")) {
        // picture and sound already apart: re-encoded (Deja), which needs an encoder — none (a Linux runner): refused first
        const encoders = await P.usableH264();
        const files = () => fs.readdirSync(path.dirname(file)).filter((n) => n.startsWith("compat-")).length, before = files();
        const yes = await P.prepareMedia(file, { allowTranscode: true, acceptReadable: true }).catch((e) => e);
        if (!encoders.length) { assert.equal(yes.code, "FLV_ENCODER_MISSING", c.name); assert.equal(files(), before, "nothing written"); }
        else { assert.equal(yes.preparation, "transcode", `${c.name}: ${yes.code || ""}`); assert.equal(yes.gapsHeld, true); }
        continue;
      }
      const yes = await P.prepareMedia(file, { allowTranscode: true, acceptReadable: true });
      assert.equal(yes.preparation, "remux", `${c.name}: an H.264/AAC recording is remuxed, not re-encoded`);
      assert.equal(yes.gapsHeld, true);
      assert.equal(yes.gaps.length, r.gaps.length);
    }
  }
});

test("small and big breaks alike come out as stream copies: same codecs, parameters, avcC and packets", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const info = (file) => JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_data_hash", "sha256",
    "-show_entries", "stream=codec_type,codec_name,profile,width,height,pix_fmt,sample_rate,channels,extradata_hash", "-of", "json", file], { encoding: "utf8" })).streams
    .map((s) => ({ ...s, index: undefined })).sort((a, b) => (a.codec_type < b.codec_type ? -1 : 1));
  const sizes = (file, type) => execFileSync(FF.path("ffprobe"), ["-v", "error", "-select_streams", type, "-show_entries", "packet=size", "-of", "csv=p=0", file], { encoding: "utf8" }).split(/\r?\n/).map((l) => l.split(",")[0]).filter((l) => /^\d+$/.test(l)).map(Number);
  for (const [name, opts] of [["G-gap0.100s.flv", {}], ["G-gap2.000s.flv", { allowTranscode: true, acceptReadable: true }]]) {
    const { dir, file } = copyOf(t, name);
    const r = await P.prepareMedia(file, opts);
    const mp4 = path.join(dir, decodeURIComponent(r.src.slice("/media/".length)));
    assert.deepEqual(info(mp4), info(file), name + ": codec parameters and extradata");
    // the FLV ends with AVC's 4-byte end-of-sequence tag, which MP4 has no place for
    const src = sizes(file, "v"), got = sizes(mp4, "v");
    if (src.length === got.length + 1 && src.at(-1) === 4) src.pop();
    assert.deepEqual(got, src, name + ": every picture packet, byte for byte the same size");
    assert.deepEqual(sizes(mp4, "a"), sizes(file, "a"), name + ": every sound packet too (nothing re-encoded or filled)");
  }
});

test("progress runs from 0 to 100 % and never backwards", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const { file } = copyOf(t, "C0-clean.flv"), p = probe(file), seen = [];
  await scanReadableRange(file, p.streams, p.format.duration, { onProgress: (f) => seen.push(f) });
  assert.equal(seen.at(-1), 1);
  assert.ok(seen.length > 2 && seen.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= seen[i - 1])), JSON.stringify(seen));
});

test("⑥ damaged bytes behind normal timestamps: an import of small drops is not decoded; a conversion fails plainly and leaves nothing", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t);
  const { file: damaged } = make(dir, "damaged.flv", [["damage", { at: 10000, count: 6 }]]);
  const { file: both } = make(dir, "damaged-and-2s.flv", [["damage", { at: 10000, count: 6 }], ["jump", { at: 30000, len: 2000 }]]);
  assert.deepEqual((await scan(damaged)).gaps, [], "the packet scan sees normal timestamps");
  // nothing to convert: imported as a remux; the damage is caught when the export decodes it
  assert.equal((await P.prepareMedia(damaged)).preparation, "remux");
  const files = () => fs.readdirSync(dir).filter((n) => n.startsWith("compat-"));
  const before = files();
  for (const [f, opts] of [[damaged, { fixGaps: true }], [both, { allowTranscode: true, acceptReadable: true }]]) {
    const e = await P.prepareMedia(f, opts).catch((x) => x);
    assert.equal(e.code, "FLV_SOURCE_DAMAGED", path.basename(f) + ": " + (e.code || e.preparation));
    assert.deepEqual(P.publicPreparationError(e), { code: "FLV_SOURCE_DAMAGED", error: "FLV_SOURCE_DAMAGED", originalSrc: e.originalSrc }, "no ffmpeg text for the page");
  }
  assert.deepEqual(files(), before, "no MP4 and no .part left behind by the failed conversions");
  // the strict decode does not cry wolf on clean, jittered or broken-but-whole recordings
  for (const [name, edits] of [["clean.flv", []], ["jitter.flv", [["jitter", { from: 10000, to: 20000, late: 3 }]]], ["live-plus-2s.flv", [...LIVE, ["jump", { at: 32000, len: 2000 }]]]]) {
    const { file } = make(dir, name, edits);
    assert.equal((await P.prepareMedia(file, { fixGaps: true, allowTranscode: true, acceptReadable: true })).preparation, "remux", name);
  }
});

test("⑥ export: a decoder error on damaged bytes stops the export with a plain sentence, never falls back to the element", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const at = app.indexOf("async function exportDecodeFrame("), body = app.slice(at, app.indexOf("\nasync function seekVideosTo(", at));
  assert.match(body, /e\.name === "EncodingError"[\s\S]*?throw Object\.assign\(new Error\(MontClipView\.t\(mcView\.get\(\)\.language, "exportSourceDamaged"/);
  assert.ok(body.indexOf('"EncodingError"') < body.indexOf("falls back to its element"), "checked before the fallback");
  const V2 = require("../ui-preferences");
  assert.match(V2.t("zh-CN", "exportSourceDamaged", { name: "早早晴.flv", at: "00:12:03" }), /^这次没导出来：「早早晴\.flv」在 00:12:03 附近有一段画面坏了/);
});

test("the conversion check: same length within 1 s, picture and sound not moved apart by more than 40 ms", () => {
  const range = { duration: 62, tracks: { video: { start: 0.023, end: 62.023 }, audio: { start: 0, end: 62.01 } } };
  const out = (o = {}) => ({ duration: 62, tracks: { video: { start: 0.023, end: 62.023 }, audio: { start: 0, end: 62.01, ...o } } });
  assert.equal(P.conversionCheck(range, out()).ok, true);
  assert.equal(P.conversionCheck(range, { ...out(), duration: 60.5 }).ok, false, "1.5 s short");
  const late = P.conversionCheck(range, out({ start: 0.06 }));
  assert.equal(late.ok, false); assert.ok(late.avOffset > 0.04);
  assert.equal(P.conversionCheck(range, { duration: 62, tracks: { video: range.tracks.video } }).ok, false, "the sound went missing");
});

test("an incompatible codec still needs an encoder: without one, FLV_ENCODER_MISSING before anything is written", async (t) => {
  if (!available()) { t.skip("ffmpeg/ffprobe unavailable"); return; }
  const dir = tmp(t), legacy = path.join(dir, "legacy.flv");
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=sample_rate=44100", "-t", "3", "-c:v", "flv", "-c:a", "aac", legacy]);
  await assert.rejects(P.prepareMedia(legacy, { allowTranscode: true, acceptReadable: true, chooseEncoder: async () => [] }), { code: "FLV_ENCODER_MISSING" });
  assert.deepEqual(fs.readdirSync(dir), ["legacy.flv"]);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(legacy)).digest("hex").length, 64);
});
