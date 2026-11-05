/* Speed and memory of asr-local.js (the server's own transcription path: ffmpeg → silero VAD → recognizer, decodeAsync)
   on one recording, with Meta's model or the default (2026-11-04). Numbers only: no text, no file name.
     node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <file> <meta|paraformer> <asr folder> [threads]
   <asr folder>: engine/, silero_vad.onnx and models/{asr, asrMeta} (vendor/asr, or a folder laid out the same way).
   Peak memory: this process's maxRSS (it holds the engine, as the server does). The consent record is the server's
   gate (asr-consent.js), not asr-local.js's: this measures the engine only. */
"use strict";
const path = require("node:path");
const os = require("node:os");
const ROOT = path.join(__dirname, "..", "..", "..");
const FF = require(path.join(ROOT, "ffmpeg-path"));
const { createAsr } = require(path.join(ROOT, "asr-local"));
(async () => {
  const [file, which, dir, th] = process.argv.slice(2);
  if (!file || !/^(meta|paraformer)$/.test(which || "") || !dir) throw new Error("usage: rtf.cjs <file> meta|paraformer <asr folder> [threads]");
  const threads = Number(th) || 4;
  const asr = createAsr({ asrDir: path.resolve(dir), modelsDir: path.join(path.resolve(dir), "models"), ffmpeg: FF.path("ffmpeg"), threads, cacheDir: path.join(os.tmpdir(), "montclip-rtf-cache") });
  const la0 = os.loadavg(), t0 = Date.now();
  const r = await asr.transcribe(path.resolve(file), { model: which === "meta" ? "asrMeta" : "asr" });
  const wall = (Date.now() - t0) / 1000;
  process.stdout.write(JSON.stringify({ engine: which, model: r.model, cpu: os.cpus()[0].model.trim(), logicalCpus: os.cpus().length, threads, node: process.version,
    loadavgStart: la0.map((x) => +x.toFixed(2)), loadavgEnd: os.loadavg().map((x) => +x.toFixed(2)),
    duration: Math.round(r.duration * 10) / 10, speech: Math.round(r.speech * 10) / 10, segments: r.segments, words: r.words.length, punctuated: r.punctuated,
    status: r.status, gaps: r.gaps.length, wallSeconds: wall, rtfOfRecording: +(wall / r.duration).toFixed(4), rtfOfSpeech: +(wall / r.speech).toFixed(4),
    peakRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }) + "\n");
  process.exit(0);
})().catch((e) => { console.error("rtf: " + (e.code || "") + " " + e.message); process.exit(1); });
