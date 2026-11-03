/* On-device transcription in the local server (#70, Deja 2026-11-03; numbers: europa ~/asr-bench/RESULT.md).
   ffmpeg reads the file's sound as 16 kHz mono, the silero VAD finds the speech, sherpa-onnx's Paraformer zh model
   (int8, 4 threads, decodeAsync so the server keeps answering) turns each stretch of speech into characters with
   times, and the CT-Transformer model adds punctuation when it is installed. The sound streams through, so a
   three-hour recording never sits in memory whole. Nothing here touches the network.

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

const RATE = 16000, WINDOW = 512;
/** The VAD as measured on europa (RESULT.md §1): segments of at most 20 s. */
const VAD = { threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.5, maxSpeechDuration: 20, windowSize: WINDOW };

function createAsr({ asrDir, modelsDir, ffmpeg, threads = 4, store } = {}) {
  asrDir = path.resolve(asrDir); if (modelsDir) modelsDir = path.resolve(modelsDir);
  store = store || createStore({ roots: [path.join(asrDir, "models")], userDir: modelsDir });
  const engineDir = path.join(asrDir, "engine", "node_modules", "sherpa-onnx-node");
  const vadFile = path.join(asrDir, manifest.engine.vad.file);
  let sherpa = null, rec = null, recDir = null, punct = null, punctDir = null, idle = 0;

  function status() {
    let vadOk = false;
    try { vadOk = fs.statSync(vadFile).size === manifest.engine.vad.size; } catch { }
    return { model: manifest.models.asr.id, engine: { ready: fs.existsSync(path.join(engineDir, "package.json")) }, vad: { ready: vadOk }, ...store.status() };
  }
  function engine() {
    if (!sherpa) sherpa = require(engineDir);
    return sherpa;
  }
  async function recognizer(dir) {
    if (rec && recDir === dir) return rec;
    rec = await engine().OfflineRecognizer.createAsync({ featConfig: { sampleRate: RATE, featureDim: 80 },
      modelConfig: { paraformer: { model: path.join(dir, "model.int8.onnx") }, tokens: path.join(dir, "tokens.txt"), numThreads: threads, provider: "cpu", debug: 0 } });
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

  async function transcribe(file, { signal, onProgress = () => {}, duration = null } = {}) {
    const st = status();
    if (!st.engine.ready || !st.vad.ready) throw Object.assign(new Error("the speech engine is missing from this copy of MontClip — unzip the package again"), { code: "ASR_ENGINE_MISSING" });
    const dir = store.dir("asr");
    if (!dir) throw Object.assign(new Error("no speech model yet"), { code: "ASR_MODEL_MISSING" });
    clearTimeout(idle);
    const S = engine(), r = await recognizer(dir), p = punctuator(store.dir("punct"));
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

    const words = [];
    let samples = 0, speech = 0, segments = 0, carry = null, pending = new Float32Array(0);
    const decodeReady = async () => {
      while (!vad.isEmpty()) {
        const seg = vad.front(false), start = seg.start / RATE, audio = Float32Array.from(seg.samples);
        vad.pop();
        const s = r.createStream();
        s.acceptWaveform({ sampleRate: RATE, samples: audio });
        const res = await r.decodeAsync(s);
        let ws = W.words(res, { offset: start, end: start + audio.length / RATE });
        if (p && ws.length) { try { ws = W.punctuate(ws, p.addPunct(W.plain(ws))); } catch { } }
        words.push(...ws);
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
    words.sort((x, y) => x[1] - y[1]);
    return { words, duration: samples / RATE, speech, segments, model: manifest.models.asr.id, language: "zh", punctuated: !!p };
  }

  return { status, transcribe, store };
}

module.exports = { createAsr, VAD };
