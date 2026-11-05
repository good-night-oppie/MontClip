/* Rea on #165 (@36769409, 2026-11-05): the two ways a file's sound is read for transcription — all of it, or a window
   with ffmpeg -ss — did not share one clock. Read whole, sample 0 was the sound track's first sample, not media time 0,
   so a track that starts late put every word early by that much; a window whose start was clamped to 0 (a recording's
   first clip is nearly always near its start) mis-seeked: −21 ms on AAC, −105 ms when the picture starts late, and an
   FLV lost its first ~1.2 s of sound. And a window added next to one already heard was read with no lead-in, so a word
   cut at the border came back twice when the two were merged.
   The fix both reads share (audio-read.js readAudioArgs, also for #149's /api/audio-window): no -ss when the window
   starts before 3 s (read from 0, -t to), and -af aresample=async=1:first_pts=0 always, so sample 0 is media time 0
   (Rea measured 7 sources × 4 ways: all within 0.1 ms). A refill reads a pad either side and keeps only its core.
   The sources are made here with ffmpeg: beeps at known times. The engine is a stand-in that writes 「哔」 where each
   beep starts, so the clock is checked without a speech model. */
"use strict";
const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const T = require("../transcribe.js");

const RATE = 16000;
const ffmpeg = () => require("../ffmpeg-path").path("ffmpeg");
const BEEPS = [1, 3.5, 6, 8.5];

/* ── the shared reader ── */

test("readAudioArgs: whole, a window from before 3 s (no -ss), a later window (-ss); sample 0 is always media time 0 of what it reads", () => {
  const { readAudioArgs, SEEK_MIN } = require("../audio-read.js");
  a.equal(SEEK_MIN, 3);
  const whole = readAudioArgs({ file: "f.flv" });
  a.equal(whole.start, 0); a.ok(!whole.args.includes("-ss") && !whole.args.includes("-t"));
  const early = readAudioArgs({ file: "f.flv", from: 0.4, to: 2.7 });
  a.equal(early.start, 0, "read from the start"); a.ok(!early.args.includes("-ss"));
  a.equal(early.args[early.args.indexOf("-t") + 1], "2.7", "-t to");
  const late = readAudioArgs({ file: "f.flv", from: 5, to: 9.5 });
  a.equal(late.start, 5); a.equal(late.args[late.args.indexOf("-ss") + 1], "5");
  a.ok(late.args.indexOf("-ss") < late.args.indexOf("-i"), "-ss before -i");
  a.equal(late.args[late.args.indexOf("-t") + 1], "4.5");
  for (const r of [whole, early, late]) {
    a.equal(r.args[r.args.indexOf("-af") + 1], "aresample=async=1:first_pts=0", "the same clock for every read");
    a.ok(r.args.includes("-vn"));
    a.deepEqual(r.args.slice(-9), ["-ac", "1", "-ar", "16000", "-f", "s16le", "-acodec", "pcm_s16le", "-"]);
  }
  const st = readAudioArgs({ file: "f", rate: 48000, channels: 2 });
  a.equal(st.args[st.args.indexOf("-ar") + 1], "48000"); a.equal(st.args[st.args.indexOf("-ac") + 1], "2");
});

/* ── the clock, end to end through asr-local with a stand-in engine ── */

/** sherpa-onnx-node, standing in: the VAD gives all it heard as one segment when the sound ends; the recognizer writes
 *  「哔」 at each beep's start (a sample over 0.1 after at least 50 ms of quiet). */
function beepSherpa() {
  class Vad {
    constructor() { this.buf = []; this.q = []; }
    acceptWaveform(f) { for (const x of f) this.buf.push(x); }
    flush() { if (this.buf.length) this.q.push({ start: 0, samples: Float32Array.from(this.buf) }); this.buf = []; }
    isEmpty() { return !this.q.length; }
    front() { return this.q[0]; }
    pop() { this.q.shift(); }
  }
  const rec = { createStream: () => ({ acceptWaveform({ samples }) { this.s = samples; } }),
    async decodeAsync(st) {
      const tokens = [], timestamps = [], quiet = 0.05 * RATE;
      let run = 0;
      for (let i = 0; i < st.s.length; i++) {
        if (Math.abs(st.s[i]) > 0.1) { if (run >= quiet) { tokens.push("哔"); timestamps.push(i / RATE); } run = 0; } else run++;
      }
      return { text: tokens.join(""), tokens, timestamps };
    } };
  return { Vad, OfflineRecognizer: { createAsync: async () => rec }, OfflinePunctuation: class {} };
}
function engine(t) {
  const { manifest } = require("../asr-models");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-clock-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nm = path.join(dir, "engine", "node_modules");
  for (const p of ["sherpa-onnx-node", require("../asr-local").nativePackage()]) { fs.mkdirSync(path.join(nm, p), { recursive: true }); fs.writeFileSync(path.join(nm, p, "package.json"), "{}"); }
  const vad = path.join(dir, manifest.engine.vad.file); fs.writeFileSync(vad, ""); fs.truncateSync(vad, manifest.engine.vad.size);
  fs.mkdirSync(path.join(dir, "model"));
  const store = { dir: (k) => (k === "asr" ? path.join(dir, "model") : null), status: () => ({ asr: { ready: true, missing: [], bad: [] }, punct: { ready: false, missing: [], bad: [] } }) };
  const asr = require("../asr-local").createAsr({ asrDir: dir, store, ffmpeg: ffmpeg(), sherpa: beepSherpa() });
  return { dir, asr };
}
/** 10 s, beeps of 0.2 s at BEEPS; `audioLate` delays the sound track, `videoLate` the picture. */
function source(dir, name, { container, acodec, vcodec, audioLate = 0, videoLate = 0 }) {
  const f = path.join(dir, name + "." + container);
  const beep = BEEPS.map((b) => `between(t,${b},${b + 0.2})`).join("+");
  execFileSync(ffmpeg(), ["-v", "error", "-y",
    ...(videoLate ? ["-itsoffset", String(videoLate)] : []), "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=25:duration=10",
    ...(audioLate ? ["-itsoffset", String(audioLate)] : []), "-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*1000*t)*(${beep})':s=44100:d=10`,
    "-map", "0:v", "-map", "1:a", "-c:v", vcodec, "-c:a", acodec, "-ar", "44100", f]);
  return f;
}
const beepsIn = (r) => r.words.map((w) => w[1]);
/** the whole read's beep times inside a window, against the window read's */
function sameClock(whole, win, [from, to], what) {
  const w = beepsIn(whole).filter((x) => x >= from + 0.06 && x < to), v = beepsIn(win).filter((x) => x >= from + 0.06 && x < to);
  a.ok(w.length > 0, what + ": a beep in the window");
  a.deepEqual(v.length, w.length, what + `: the same beeps (whole ${w}, window ${v})`);
  for (let i = 0; i < w.length; i++) a.ok(Math.abs(w[i] - v[i]) < 0.005, `${what}: ${Math.round((v[i] - w[i]) * 1000)} ms apart at ${w[i]} s`);
}
/** against where the beeps really are (media time): the codecs' own delays are a few tens of ms (MP3 +25, AAC +21) */
function onTime(r, late, what) {
  for (const b of BEEPS) {
    const got = beepsIn(r).find((x) => Math.abs(x - (b + late)) < 0.2);
    a.ok(got != null, `${what}: the beep at ${b + late} s`);
    a.ok(got - (b + late) > -0.005 && got - (b + late) < 0.03, `${what}: ${Math.round((got - b - late) * 1000)} ms off at ${b + late} s`);
  }
}

test("FLV, MP3 from 0, the picture 92 ms late; the first clip at in < 1.5 s: the window hears it on the whole read's clock", async (t) => {
  const E = engine(t);
  const f = source(E.dir, "rec", { container: "flv", acodec: "libmp3lame", vcodec: "flv", videoLate: 0.092 });
  const whole = await E.asr.transcribe(f, { duration: 10 });
  onTime(whole, 0, "flv whole");
  const ranges = T.clipRanges([{ in: 0.9, duration: 0.4 }], { duration: 10 });
  a.deepEqual(ranges, [[0, 2.8]], "the window starts at 0");
  const win = await E.asr.transcribe(f, { ranges, duration: 10 });
  sameClock(whole, win, ranges[0], "flv from 0");
  const later = await E.asr.transcribe(f, { ranges: [[5, 9.5]], duration: 10 });
  sameClock(whole, later, [5, 9.5], "flv from 5 s (-ss)");
});

test("MKV, AAC, a window from 0: no AAC priming left in", async (t) => {
  const E = engine(t);
  const f = source(E.dir, "aac", { container: "mkv", acodec: "aac", vcodec: "mpeg4" });
  const whole = await E.asr.transcribe(f, { duration: 10 });
  onTime(whole, 0, "mkv whole");
  const win = await E.asr.transcribe(f, { ranges: [[0, 4]], duration: 10 });
  sameClock(whole, win, [0, 4], "mkv from 0");
});

test("MP4, the sound track 80 ms late: whole and windows put the beeps where they are in the media", async (t) => {
  const E = engine(t);
  const f = source(E.dir, "late", { container: "mp4", acodec: "aac", vcodec: "mpeg4", audioLate: 0.08 });
  const whole = await E.asr.transcribe(f, { duration: 10 });
  onTime(whole, 0.08, "late whole");
  for (const w of [[0, 4], [5, 9.5]]) {
    const win = await E.asr.transcribe(f, { ranges: [w], duration: 10 });
    for (const b of BEEPS.map((x) => x + 0.08).filter((x) => x > w[0] + 0.06 && x < w[1])) {
      const got = beepsIn(win).find((x) => Math.abs(x - b) < 0.2);
      a.ok(got != null && got - b > -0.005 && got - b < 0.03, `late ${w.join("–")}: ${got == null ? "missing" : Math.round((got - b) * 1000) + " ms off"} at ${b} s`);
    }
    sameClock(whole, win, w, "late " + w.join("–"));
  }
});

test("one file read whole, then a window added: the two transcripts' words are less than 5 ms apart", async (t) => {
  const E = engine(t);
  const f = source(E.dir, "both", { container: "flv", acodec: "libmp3lame", vcodec: "flv", videoLate: 0.092, audioLate: 0.055 });
  const whole = await E.asr.transcribe(f, { duration: 10 });
  const first = await E.asr.transcribe(f, { ranges: [[0, 2]], duration: 10 });
  const doc1 = T.validate({ duration: 10, words: first.words, spans: first.spans });
  const plan = T.refillPlan(doc1, [[5, 9]], { pad: 1.5, duration: 10 });
  const add = await E.asr.transcribe(f, { ranges: plan.read, duration: 10 });
  const merged = T.mergeDocs(doc1, T.keepIn(T.validate({ duration: 10, words: add.words, spans: add.spans }), plan.core));
  for (const [s] of merged.words) {
    const w = beepsIn(whole).find((x) => Math.abs(x - s) < 0.2);
    a.ok(w != null && Math.abs(w - s) < 0.005, `${s} s: ${w == null ? "not in the whole read" : Math.round((s - w) * 1000) + " ms from it"}`);
  }
});

/* ── a refill reads a pad either side and keeps only its core (no word twice) ── */

test("refillPlan: what is still missing, read with a pad either side; only the core is kept, so a word cut at the border is not doubled", () => {
  // A (in 10, 8 s) was heard in [8.5, 19.5]; the border cut 「们」, heard as 19.3–19.5
  const had = T.validate({ duration: 60, words: [["我", 19.0, 19.3], ["们", 19.3, 19.5]], spans: [[8.5, 19.5]] });
  // B (in 19.6) needs [18.1, 26.1]; what is missing is [19.5, 26.1]
  const need = T.clipRanges([{ in: 19.6, duration: 5 }], { duration: 60 });
  const plan = T.refillPlan(had, need, { pad: 1.5, duration: 60 });
  a.deepEqual(plan.core, [[18.75, 26.1]], "the missing part, reaching pad/2 back into what was heard");
  a.deepEqual(plan.read, [[18, 27.6]], "read with a whole pad either side");
  // read with its lead-in, the engine hears the whole word again
  const add = T.validate({ duration: 60, words: [["我", 19.0, 19.3], ["们", 19.3, 19.55], ["来", 20.0, 20.3], ["后", 27.0, 27.2]], spans: plan.read });
  const merged = T.mergeDocs(had, T.keepIn(add, plan.core));
  a.deepEqual(merged.words.map((w) => w[0]), ["我", "们", "来"], "no 「们」 twice, nothing from outside the core");
  a.deepEqual(merged.spans, [[8.5, 26.1]]);
  a.deepEqual(T.refillPlan(had, [[9, 12]], { pad: 1.5, duration: 60 }), { read: [], core: [] }, "nothing missing: nothing to read");
});
