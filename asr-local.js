/* On-device transcription in the local server (#70, Deja 2026-11-03; numbers: europa ~/asr-bench/RESULT.md).
   ffmpeg reads the file's sound as 16 kHz mono, the silero VAD finds the speech, sherpa-onnx's Paraformer zh model
   (int8, 4 threads, decodeAsync so the server keeps answering) turns each stretch of speech into characters with
   times, and the CT-Transformer model adds punctuation when it is installed. The sound streams through, so a
   three-hour recording never sits in memory whole. Nothing here touches the network.

   One segment the engine cannot read never fails the recording (Deja, 2026-11-03, from Rea on #93: one of 1485
   segments of a 3.8-hour stream made sherpa-onnx throw basic_string::_S_create, and the whole transcription failed).
   A failing segment is tried again as its two halves, once; a part that still fails is a gap {start, end, reason}
   and the transcription goes on. The result is complete, partial (with gaps), or failed (ASR_FAILED: nothing at all
   could be read). Every decode is on a new stream, so a stream the engine broke is never used again. Rea: the failing
   segment is at 3603.7 s and 4.74 s long, the only one of 1485 — not a long segment, so the VAD keeps its 20 s maximum.
   The root (Rea, #93 ADR §10): the model's tokens.txt has a token that is exactly "@" (line 7252, "@ 7251"), and
   sherpa-onnx 2.0.1 (gitSha1 af2d8d81) takes 2 off the length of a token ending in "@" — for "@" alone that underflows
   (std::length_error: basic_string::_S_create, "string too long" on MSVC). The recognizer reads a copy of tokens.txt
   with that token as the full-width 「＠」 (safeTokens), and 「＠」 is taken out of the words. Only decodeAsync is ever
   called: the synchronous decode() aborts the whole process on this. The segment guard stays for anything else.

   asrDir   the engine and the VAD (resources/asr in the package, vendor/asr in a checkout):
              engine/node_modules/sherpa-onnx-node, engine/node_modules/sherpa-onnx-<platform>-<arch>, silero_vad.onnx,
              models/ (the 完整版 package's models, or a checkout's)
   modelsDir the user's models (downloaded or imported; userData/asr-models in the desktop app) */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { manifest, createStore } = require("./asr-models");
const W = require("./asr-words");
const { hidePaths } = require("./asr-status");
/* The media's own clock for every read (Rea on #165): #149's filter, imported (Deja, 2026-11-05: one clock filter for
   the export's audio window and for transcription, with #149's tests behind it) — a late sound track is padded with
   silence so sample 0 is media time 0. */
const { CLOCK_FILTER } = require("./audio-window");
/** Below this a window is read from the start of the file, not with -ss: an input seek near 0 missed by −21 ms on AAC,
 *  −105 ms when the picture starts late, and an FLV lost its first ~1.2 s of sound (Rea on #165). */
const SEEK_MIN = 3;
/** ffmpeg's arguments for 16 kHz mono PCM of `file` (all of it, or from…to) on the media's own clock.
 *  → {args, start}: start is the media time of the first sample (0, or `from` when it seeks). */
function readArgs({ file, from = null, to = null, rate = RATE, channels = 1 } = {}) {
  const f = from == null ? 0 : Math.max(0, +from || 0);
  const seek = from != null && f >= SEEK_MIN;
  const start = seek ? f : 0;
  const t = to == null ? null : Math.max(0, +to - start);
  return { start, args: ["-nostdin", "-v", "error", ...(seek ? ["-ss", String(f)] : []), "-i", file, ...(t != null ? ["-t", String(Math.round(t * 1e6) / 1e6)] : []),
    "-vn", "-af", CLOCK_FILTER, "-ac", String(channels), "-ar", String(rate), "-f", "s16le", "-acodec", "pcm_s16le", "-"] };
}

const crypto = require("node:crypto");
const os = require("node:os");

const RATE = 16000, WINDOW = 512;
/** sherpa-onnx-node's native part for this computer: sherpa-onnx-win-x64, sherpa-onnx-linux-x64, sherpa-onnx-darwin-arm64… */
const nativePackage = (platform = process.platform, arch = process.arch) => "sherpa-onnx-" + (platform === "win32" ? "win" : platform) + "-" + arch;
/** tokens.txt without a token that is exactly "@": that line's token becomes the full-width 「＠」 (its id unchanged) in a
 *  copy in cacheDir, named by the source's SHA-256, so a changed source gets a new copy; the source is never changed.
 *  → the file the recognizer reads (the source itself when there is nothing to fix). */
function safeTokens(file, cacheDir) {
  let bytes;
  try { bytes = fs.readFileSync(file); } catch { return file; }   // unreadable: the engine says so itself
  const text = bytes.toString("utf8");
  if (!/^@ \d+\r?$/m.test(text)) return file;
  const out = path.join(cacheDir, "tokens-" + crypto.createHash("sha256").update(bytes).digest("hex") + ".txt");
  if (!fs.existsSync(out)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmp = out + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, text.replace(/^@( \d+\r?)$/gm, "＠$1"));
    fs.renameSync(tmp, out);
  }
  return out;
}
/** The VAD as measured on europa (RESULT.md §1): segments of at most 20 s. */
const VAD = { threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.5, maxSpeechDuration: 20, windowSize: WINDOW };

/** One VAD segment's words: decoded whole; if the engine throws, its two halves once each (with at least MIN_PART s of
 *  sound each). A part that cannot be read is a gap {start, end, reason}. → {words, gaps, read} (read: any part read). */
const MIN_PART = 0.25;
async function segmentWords(r, audio, start, p) {
  const words = [], gaps = [];
  let read = false;
  const one = async (part, at) => {
    const s = r.createStream();
    s.acceptWaveform({ sampleRate: RATE, samples: part });
    const res = await r.decodeAsync(s);
    // 「＠」 is the "@" token of safeTokens: never a word
    let ws = W.words(res, { offset: at, end: at + part.length / RATE }).map((w) => [w[0].replace(/＠/g, ""), w[1], w[2]]).filter((w) => w[0]);
    if (p && ws.length) { try { ws = W.punctuate(ws, p.addPunct(W.plain(ws))); } catch { } }
    words.push(...ws); read = true;
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
const r3 = (x) => Math.round(x * 1000) / 1000;

function createAsr({ asrDir, modelsDir, ffmpeg, threads = 4, store, sherpa: engineModule = null, cacheDir = null } = {}) {
  // where the safe tokens copy goes (the server gives one in its data folder, userData in the desktop app)
  cacheDir = path.resolve(cacheDir || path.join(os.tmpdir(), "montclip-asr-cache"));
  asrDir = path.resolve(asrDir); if (modelsDir) modelsDir = path.resolve(modelsDir);
  store = store || createStore({ roots: [path.join(asrDir, "models")], userDir: modelsDir });
  const engineDir = path.join(asrDir, "engine", "node_modules", "sherpa-onnx-node");
  const nativeDir = path.join(asrDir, "engine", "node_modules", nativePackage());
  const vadFile = path.join(asrDir, manifest.engine.vad.file);
  // sherpa: the engine module itself (tests give a stand-in; otherwise it is loaded from engineDir)
  let sherpa = engineModule, rec = null, recDir = null, punct = null, punctDir = null, idle = 0;

  function status() {
    let vadOk = false;
    try { vadOk = fs.statSync(vadFile).size === manifest.engine.vad.size; } catch { }
    // the engine is two packages: sherpa-onnx-node and its native part for this system (a package made for Windows
    // carries only sherpa-onnx-win-x64, so on Linux the engine is not there even though sherpa-onnx-node is)
    const ready = fs.existsSync(path.join(engineDir, "package.json")) && (!!engineModule || fs.existsSync(path.join(nativeDir, "package.json")));
    return { model: manifest.models.asr.id, engine: { ready, native: path.basename(nativeDir) }, vad: { ready: vadOk }, ...store.status() };
  }
  function engine() {
    if (!sherpa) {
      try { sherpa = require(engineDir); }
      // which module, never where it is on this computer (QQ on #165)
      catch (e) { throw Object.assign(new Error("the speech engine could not be loaded on this computer: " + hidePaths(String((e && e.message) || e).split("\n")[0]).slice(0, 200)), { code: "ASR_ENGINE_MISSING" }); }
    }
    return sherpa;
  }
  async function recognizer(dir) {
    if (rec && recDir === dir) return rec;
    rec = await engine().OfflineRecognizer.createAsync({ featConfig: { sampleRate: RATE, featureDim: 80 },
      modelConfig: { paraformer: { model: path.join(dir, "model.int8.onnx") }, tokens: safeTokens(path.join(dir, "tokens.txt"), cacheDir), numThreads: threads, provider: "cpu", debug: 0 } });
    recDir = dir;
    return rec;
  }
  function punctuator(dir) {
    if (!dir) return null;
    if (punct && punctDir === dir) return punct;
    punct = new (engine().OfflinePunctuation)({ model: { ctTransformer: path.join(dir, "model.int8.onnx"), numThreads: 1, debug: 0, provider: "cpu" } });
    punctDir = dir;
    return punct;
  }
  /** Let the models go after two quiet minutes (a few hundred MB). */
  function rest() {
    clearTimeout(idle);
    idle = setTimeout(() => { rec = null; recDir = null; punct = null; punctDir = null; }, 120000);
    if (idle.unref) idle.unref();
  }

  /** ranges: [[from, to], …] in file seconds — listen to those parts only (a long recording's clips), each read from
   *  the file with ffmpeg -ss / -t, so nothing before or after them is decoded; times stay file seconds. None: all of it.
   *  duration: the file's length (progress, and the result's duration when only parts are read). */
  async function transcribe(file, { signal, onProgress = () => {}, duration = null, ranges = null } = {}) {
    const st = status();
    if (!st.engine.ready || !st.vad.ready) throw Object.assign(new Error("the speech engine is missing from this copy of MontClip"), { code: "ASR_ENGINE_MISSING" });
    const dir = store.dir("asr");
    if (!dir) throw Object.assign(new Error("no speech model yet"), { code: "ASR_MODEL_MISSING" });
    clearTimeout(idle);
    const parts = Array.isArray(ranges) && ranges.length ? ranges.map((x) => [Math.max(0, +x[0] || 0), +x[1] || 0]).filter((x) => x[1] > x[0]) : null;
    if (parts && !parts.length) throw Object.assign(new Error("nothing to listen to: every range is empty"), { code: "ASR_BAD_RANGES" });
    const want = parts ? parts.reduce((n, x) => n + x[1] - x[0], 0) : duration;
    const words = [], gaps = [], spans = [];
    let samples = 0, speech = 0, segments = 0, read = 0, skipped = 0, p = null;
    try {
      const S = engine(), r = await recognizer(dir);
      p = punctuator(store.dir("punct"));
      for (const part of parts || [null]) {
        // a part that starts under SEEK_MIN is read from the file's start: what comes before the part's own start is
        // another part's (or nobody's), so only words and gaps whose middle is at or after it are this part's — two
        // reads that both start at 0 never keep a word twice (Rea on #165, 17:14)
        const from = part ? part[0] : 0, mine = (a, b) => (a + b) / 2 >= from;
        const { samples: got, at } = await listen(S, r, p, file, part, { signal,
          onSegment: (one, len) => { words.push(...one.words.filter((w) => mine(w[1], w[2]))); const g = one.gaps.filter((x) => mine(x.start, x.end)); gaps.push(...g);
            if (one.read) read++; if (g.length) skipped++; speech += len; segments++; },
          onSamples: (n) => { if (want > 0) onProgress(Math.min(0.99, (samples + n) / RATE / want)); } });
        samples += got;
        if (part) spans.push([r3(Math.max(at, from)), r3(at + got / RATE)]);
      }
    } finally { rest(); }
    words.sort((x, y) => x[1] - y[1]); gaps.sort((x, y) => x.start - y.start);
    // nothing at all could be read: failed, not a transcript of silence
    if (gaps.length && !read) throw Object.assign(new Error("no segment of the sound could be transcribed: " + gaps[0].reason), { code: "ASR_FAILED", gaps });
    return { status: gaps.length ? "partial" : "complete", gaps, skippedSegments: skipped, words,
      duration: parts ? (duration > 0 ? duration : Math.max(...spans.map((x) => x[1]))) : samples / RATE,
      ...(parts ? { spans } : {}), speech, segments, model: manifest.models.asr.id, language: "zh", punctuated: !!p };
  }
  /** One stretch of the file (`part` [from, to], or null for all of it) through ffmpeg (16 kHz mono) and a fresh VAD;
   *  each segment's words go to onSegment with file times. Read by readArgs on the media's own clock: a part that
   *  starts before 3 s is read from the start of the file (Rea on #165). -> {samples, at}: what was read, from where. */
  async function listen(S, r, p, file, part, { signal, onSegment, onSamples }) {
    const plan = readArgs({ file, from: part ? part[0] : null, to: part ? part[1] : null });
    const at = plan.start;
    const vad = new S.Vad({ sileroVad: { model: vadFile, ...VAD }, sampleRate: RATE, debug: false, numThreads: 1 }, 60);
    const proc = spawn(ffmpeg, plan.args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "", spawnError = null;
    proc.stderr.on("data", (c) => { if (stderr.length < 4000) stderr += c; });
    const exited = new Promise((resolve) => {
      proc.on("close", (code) => resolve(code));
      proc.on("error", (e) => { spawnError = e; resolve(-1); });   // ffmpeg could not be started at all
    });
    const stop = () => { try { proc.kill(); } catch { } };
    if (signal) { if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true }); }
    let samples = 0, carry = null, pending = new Float32Array(0);
    const decodeReady = async () => {
      while (!vad.isEmpty()) {
        const seg = vad.front(false), start = at + seg.start / RATE, audio = Float32Array.from(seg.samples);
        vad.pop();
        onSegment(await segmentWords(r, audio, start, p), audio.length / RATE);
      }
    };
    try {
      for await (let chunk of proc.stdout) {
        if (signal && signal.aborted) break;
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
        onSamples(samples);
      }
      if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { code: "ASR_CANCELLED" });
      const code = await exited;
      if (spawnError) throw Object.assign(new Error("ffmpeg could not be started: " + spawnError.message), { code: "ASR_READ_FAILED" });
      if (code !== 0) throw Object.assign(new Error("ffmpeg could not read the sound: " + stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300)), { code: "ASR_READ_FAILED" });
      if (pending.length) vad.acceptWaveform(pending);
      vad.flush();
      await decodeReady();
    } finally { stop(); if (signal) signal.removeEventListener("abort", stop); }
    return { samples, at };
  }

  return { status, transcribe, store };
}

module.exports = { createAsr, VAD, segmentWords, safeTokens, nativePackage, readArgs, SEEK_MIN, CLOCK_FILTER };
