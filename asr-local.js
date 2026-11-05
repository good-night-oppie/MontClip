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

const crypto = require("node:crypto");
const os = require("node:os");

const RATE = 16000, WINDOW = 512;
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
/** Meta's Omnilingual model reads nothing (or the wrong script) from a stretch of sound that starts right on a word, as
 *  the VAD cuts it; with a quarter second of silence on each side it reads the words (europa 2026-11-04, the model's
 *  en.wav: cut at 0.5 s → "", the same cut padded 0.25 s → the sentence). Its segments get that silence; the times are
 *  taken back to the file's. */
const META_PAD = 0.25;
/** The punctuation model is Chinese (CT-Transformer zh-en): on Meta's model it runs only for a segment that is mostly
 *  Chinese characters, so English and other languages get no 「。」 (Deja, 2026-11-04). Paraformer's words always go to it,
 *  as before. */
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
function mostlyChinese(ws) {
  let cjk = 0, all = 0;
  for (const w of ws) for (const ch of String(w[0])) { if (/\s/.test(ch)) continue; all++; if (CJK.test(ch)) cjk++; }
  return all > 0 && cjk * 2 >= all;
}
async function segmentWords(r, audio, start, p, toWords = W.words, pad = 0, punctFor = null) {
  const words = [], gaps = [];
  let read = false;
  const one = async (part, at) => {
    const s = r.createStream(), n = Math.round(pad * RATE);
    let samples = part;
    if (n) { samples = new Float32Array(part.length + 2 * n); samples.set(part, n); }
    s.acceptWaveform({ sampleRate: RATE, samples });
    const res = await r.decodeAsync(s);
    // 「＠」 is the "@" token of safeTokens: never a word
    let ws = toWords(res, { offset: at - n / RATE, end: at + part.length / RATE }).map((w) => [w[0].replace(/＠/g, ""), Math.max(w[1], r3(at)), Math.max(w[2], r3(at))]).filter((w) => w[0]);
    if (p && ws.length && (!punctFor || punctFor(ws))) { try { ws = W.punctuate(ws, p.addPunct(W.plain(ws))); } catch { } }
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
  const vadFile = path.join(asrDir, manifest.engine.vad.file);
  // sherpa: the engine module itself (tests give a stand-in; otherwise it is loaded from engineDir)
  let sherpa = engineModule, rec = null, recDir = null, recKind = null, punct = null, punctDir = null, idle = 0;

  function status() {
    let vadOk = false;
    try { vadOk = fs.statSync(vadFile).size === manifest.engine.vad.size; } catch { }
    return { model: manifest.models.asr.id, meta: manifest.models.asrMeta.id, engine: { ready: fs.existsSync(path.join(engineDir, "package.json")) }, vad: { ready: vadOk }, ...store.status() };
  }
  function engine() {
    if (!sherpa) sherpa = require(engineDir);
    return sherpa;
  }
  // key: "asr" (Paraformer, the default) or "asrMeta" (Meta Omnilingual ASR, optional; the owner, 2026-11-04)
  async function recognizer(dir, key = "asr") {
    if (rec && recDir === dir && recKind === key) return rec;
    const model = path.join(dir, "model.int8.onnx");
    rec = await engine().OfflineRecognizer.createAsync({ featConfig: { sampleRate: RATE, featureDim: 80 },
      modelConfig: { ...(key === "asrMeta" ? { omnilingual: { model } } : { paraformer: { model } }), tokens: safeTokens(path.join(dir, "tokens.txt"), cacheDir), numThreads: threads, provider: "cpu", debug: 0 } });
    recDir = dir; recKind = key;
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
    idle = setTimeout(() => { rec = null; recDir = null; recKind = null; punct = null; punctDir = null; }, 120000);
    if (idle.unref) idle.unref();
  }

  async function transcribe(file, { signal, onProgress = () => {}, duration = null, model = "asr" } = {}) {
    const key = model === "asrMeta" ? "asrMeta" : "asr";
    const st = status();
    if (!st.engine.ready || !st.vad.ready) throw Object.assign(new Error("the speech engine is missing from this copy of MontClip — unzip the package again"), { code: "ASR_ENGINE_MISSING" });
    const dir = store.dir(key);
    if (!dir) throw Object.assign(new Error("no speech model yet"), { code: "ASR_MODEL_MISSING" });
    clearTimeout(idle);
    const S = engine(), r = await recognizer(dir, key), p = punctuator(store.dir("punct")), toWords = key === "asrMeta" ? W.letterWords : W.words;
    const vad = new S.Vad({ sileroVad: { model: vadFile, ...VAD }, sampleRate: RATE, debug: false, numThreads: 1 }, 60);
    const proc = spawn(ffmpeg, ["-nostdin", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-acodec", "pcm_s16le", "-"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "", spawnError = null;
    proc.stderr.on("data", (c) => { if (stderr.length < 4000) stderr += c; });
    const exited = new Promise((resolve) => {
      proc.on("close", (code) => resolve(code));
      proc.on("error", (e) => { spawnError = e; resolve(-1); });   // ffmpeg could not be started at all
    });
    const stop = () => { try { proc.kill(); } catch { } };
    if (signal) { if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true }); }

    const words = [], gaps = [];
    let samples = 0, speech = 0, segments = 0, read = 0, skipped = 0, carry = null, pending = new Float32Array(0);
    const decodeReady = async () => {
      while (!vad.isEmpty()) {
        const seg = vad.front(false), start = seg.start / RATE, audio = Float32Array.from(seg.samples);
        vad.pop();
        const one = await segmentWords(r, audio, start, p, toWords, key === "asrMeta" ? META_PAD : 0, key === "asrMeta" ? mostlyChinese : null);
        words.push(...one.words); gaps.push(...one.gaps);
        if (one.read) read++;
        if (one.gaps.length) skipped++;
        speech += audio.length / RATE; segments++;
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
        if (duration > 0) onProgress(Math.min(0.99, samples / RATE / duration));
      }
      if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { code: "ASR_CANCELLED" });
      const code = await exited;
      if (spawnError) throw Object.assign(new Error("ffmpeg could not be started: " + spawnError.message), { code: "ASR_READ_FAILED" });
      if (code !== 0) throw Object.assign(new Error("ffmpeg could not read the sound: " + stderr.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300)), { code: "ASR_READ_FAILED" });
      if (pending.length) vad.acceptWaveform(pending);
      vad.flush();
      await decodeReady();
    } finally { stop(); rest(); }
    words.sort((x, y) => x[1] - y[1]); gaps.sort((x, y) => x.start - y.start);
    // nothing at all could be read: failed, not a transcript of silence
    if (gaps.length && !read) throw Object.assign(new Error("no segment of the sound could be transcribed: " + gaps[0].reason), { code: "ASR_FAILED", gaps });
    return { status: gaps.length ? "partial" : "complete", gaps, skippedSegments: skipped, words, duration: samples / RATE, speech, segments, model: manifest.models[key].id, language: key === "asrMeta" ? "auto" : "zh", punctuated: !!p };
  }

  return { status, transcribe, store };
}

module.exports = { createAsr, VAD, META_PAD, segmentWords, safeTokens, mostlyChinese };
