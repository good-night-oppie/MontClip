/* The optional engine's own process (asr-optional-engine.js forks it; Deja, 2026-11-04). It reads one file the way
   asr-local.js does — ffmpeg → 16 kHz mono → the silero VAD (the same settings: segments of at most 20 s) → the
   recognizer, one segment at a time with decodeAsync — but with the optional model (sherpa-onnx `omnilingual`).
   It runs in a process of its own so that a model that crashes the engine, or runs the computer out of memory, ends
   only this process: the local server and the default engine go on (the parent turns the exit into a plain message).
   Like asr-local.js, a segment that throws is tried again as its two halves, once; a part that still fails is a gap.
   Messages to the parent: {t:"ready"}, {t:"progress", seconds}, {t:"done", result}, {t:"error", code, message, gaps}. */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const { VAD } = require("./asr-local");
const OW = require("./asr-optional-words");

const RATE = 16000, WINDOW = 512, MIN_PART = 0.25;
const r3 = (x) => Math.round(x * 1000) / 1000;
const send = (m) => { try { process.send(m); } catch { } };

async function segmentWords(r, audio, start) {
  const words = [], gaps = [];
  let read = false;
  const one = async (part, at) => {
    const s = r.createStream();
    s.acceptWaveform({ sampleRate: RATE, samples: part });
    const res = await r.decodeAsync(s);
    words.push(...OW.words(res, { offset: at, end: at + part.length / RATE })); read = true;
  };
  const why = (e) => String((e && e.message) || e || "error").slice(0, 200);
  const gap = (n, at, e) => gaps.push({ start: r3(at), end: r3(at + n / RATE), reason: why(e) });
  try { await one(audio, start); }
  catch (e) {
    const half = Math.floor(audio.length / 2);
    if (half < MIN_PART * RATE) gap(audio.length, start, e);
    else for (const [from, to] of [[0, half], [half, audio.length]]) {
      const at = start + from / RATE;
      try { await one(audio.subarray(from, to), at); } catch (e2) { gap(to - from, at, e2); }
    }
  }
  return { words, gaps, read };
}

async function run({ file, ffmpeg, engineDir, vadFile, modelDir, threads = 4 }) {
  const S = require(engineDir);
  let r;
  try {
    r = await S.OfflineRecognizer.createAsync({ featConfig: { sampleRate: RATE, featureDim: 80 },
      modelConfig: { omnilingual: { model: path.join(modelDir, "model.int8.onnx") }, tokens: path.join(modelDir, "tokens.txt"), numThreads: threads, provider: "cpu", debug: 0 } });
  } catch (e) {   // the engine cannot read the model (damaged, or not this kind of model)
    throw Object.assign(new Error("the optional model could not be loaded: " + String((e && e.message) || e).slice(0, 200)), { code: "ASR_OPTIONAL_MODEL_BROKEN" });
  }
  send({ t: "ready" });
  const vad = new S.Vad({ sileroVad: { model: vadFile, ...VAD }, sampleRate: RATE, debug: false, numThreads: 1 }, 60);
  const proc = spawn(ffmpeg, ["-nostdin", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-acodec", "pcm_s16le", "-"],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stderr = "", spawnError = null;
  proc.stderr.on("data", (c) => { if (stderr.length < 4000) stderr += c; });
  const exited = new Promise((resolve) => { proc.on("close", resolve); proc.on("error", (e) => { spawnError = e; resolve(-1); }); });
  process.on("disconnect", () => { try { proc.kill(); } catch { } process.exit(0); });   // the parent went away
  const words = [], gaps = [];
  let samples = 0, speech = 0, segments = 0, read = 0, skipped = 0, carry = null, pending = new Float32Array(0);
  const decodeReady = async () => {
    while (!vad.isEmpty()) {
      const seg = vad.front(false), start = seg.start / RATE, audio = Float32Array.from(seg.samples);
      vad.pop();
      const one = await segmentWords(r, audio, start);
      words.push(...one.words); gaps.push(...one.gaps);
      if (one.read) read++;
      if (one.gaps.length) skipped++;
      speech += audio.length / RATE; segments++;
    }
  };
  try {
    for await (let chunk of proc.stdout) {
      if (carry) { chunk = Buffer.concat([carry, chunk]); carry = null; }
      if (chunk.length & 1) { carry = chunk.subarray(chunk.length - 1); chunk = chunk.subarray(0, chunk.length - 1); }
      const f = new Float32Array(pending.length + chunk.length / 2);
      f.set(pending);
      for (let i = 0, o = pending.length; i < chunk.length; i += 2, o++) f[o] = chunk.readInt16LE(i) / 32768;
      let k = 0;
      for (; k + WINDOW <= f.length; k += WINDOW) vad.acceptWaveform(f.subarray(k, k + WINDOW));
      pending = f.slice(k);
      samples += chunk.length / 2;
      await decodeReady();
      send({ t: "progress", seconds: samples / RATE });
    }
    const code = await exited;
    if (spawnError) throw Object.assign(new Error("ffmpeg could not be started: " + spawnError.message), { code: "ASR_READ_FAILED" });
    if (code !== 0) throw Object.assign(new Error("ffmpeg could not read the sound: " + stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300)), { code: "ASR_READ_FAILED" });
    if (pending.length) vad.acceptWaveform(pending);
    vad.flush();
    await decodeReady();
  } finally { try { proc.kill(); } catch { } }
  words.sort((x, y) => x[1] - y[1]); gaps.sort((x, y) => x.start - y.start);
  if (gaps.length && !read) throw Object.assign(new Error("no segment of the sound could be transcribed: " + gaps[0].reason), { code: "ASR_FAILED", gaps });
  // this process's peak memory (MB): it is all the optional engine's (the model, the VAD, the sound in flight)
  const maxRssMB = Math.round(process.resourceUsage().maxRSS / 1024);
  return { status: gaps.length ? "partial" : "complete", gaps, skippedSegments: skipped, words, duration: samples / RATE, speech, segments, punctuated: false, threads, maxRssMB };
}

if (require.main === module) {
  process.once("message", (job) => {
    // the last message is sent before the channel closes (then this process ends)
    const last = (m) => process.send(m, () => process.disconnect());
    run(job).then((result) => last({ t: "done", result }),
      (e) => last({ t: "error", code: e.code || "ASR_FAILED", message: String((e && e.message) || e).slice(0, 500), gaps: e.gaps }));
  });
}

module.exports = { run, segmentWords };
