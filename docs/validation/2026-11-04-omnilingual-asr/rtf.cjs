/* Speed and memory of MontClip's own transcription paths on one long recording (2026-11-04). Numbers only: no text,
   no file name.
     node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <file> optional <model folder> [threads]
       asr-optional-engine.js: a child process, ffmpeg → silero VAD (≤ 20 s segments) → Omnilingual CTC int8
     node docs/validation/2026-11-04-omnilingual-asr/rtf.cjs <file> default <asr folder> [threads]
       asr-local.js as shipped: ffmpeg → silero VAD → Paraformer zh int8 (→ punctuation when installed), in this process
   <asr folder>: engine/, silero_vad.onnx and models/asr (vendor/asr, or resources/asr). The optional model folder holds
   model.int8.onnx + tokens.txt (fetch-model.cjs). MONTCLIP_ASR_DIR points at the engine for "optional" (default vendor/asr).
   Peak memory: the child's own peak for "optional" (process.resourceUsage().maxRSS in it), this process's for "default". */
"use strict";
const path = require("node:path");
const os = require("node:os");
const ROOT = path.join(__dirname, "..", "..", "..");
const FF = require(path.join(ROOT, "ffmpeg-path"));
(async () => {
  const [file, kind, dir, th] = process.argv.slice(2);
  if (!file || !/^(optional|default)$/.test(kind || "") || !dir) throw new Error("usage: rtf.cjs <file> optional|default <folder> [threads]");
  const threads = Number(th) || 4, ffmpeg = FF.path("ffmpeg");
  let asr;
  if (kind === "optional") {
    const { createOptionalAsr } = require(path.join(ROOT, "asr-optional-engine"));
    const store = { active: () => "bench", status: () => ({ name: "bench", ramMB: 0, missing: [], bad: [] }), dir: () => path.resolve(dir) };
    asr = createOptionalAsr({ asrDir: path.resolve(process.env.MONTCLIP_ASR_DIR || path.join(ROOT, "vendor", "asr")), optional: store, ffmpeg, threads });
  } else {
    const { createAsr } = require(path.join(ROOT, "asr-local"));
    asr = createAsr({ asrDir: path.resolve(dir), modelsDir: path.join(path.resolve(dir), "models"), ffmpeg, threads, cacheDir: path.join(os.tmpdir(), "montclip-rtf-cache") });
  }
  const la0 = os.loadavg(), t0 = Date.now();
  const r = await asr.transcribe(path.resolve(file), {});
  const wall = (Date.now() - t0) / 1000;
  process.stdout.write(JSON.stringify({ engine: kind, cpu: os.cpus()[0].model.trim(), logicalCpus: os.cpus().length, threads, node: process.version,
    loadavgStart: la0.map((x) => +x.toFixed(2)), loadavgEnd: os.loadavg().map((x) => +x.toFixed(2)),
    duration: Math.round(r.duration * 10) / 10, speech: Math.round(r.speech * 10) / 10, segments: r.segments, words: r.words.length,
    status: r.status, gaps: r.gaps.length, wallSeconds: wall, rtfOfRecording: +(wall / r.duration).toFixed(4), rtfOfSpeech: +(wall / r.speech).toFixed(4),
    peakRssMB: kind === "optional" ? r.maxRssMB : Math.round(process.resourceUsage().maxRSS / 1024),
    serverSidePeakRssMB: Math.round(process.resourceUsage().maxRSS / 1024) }) + "\n");
  process.exit(0);
})().catch((e) => { console.error("rtf: " + (e.code || "") + " " + e.message); process.exit(1); });
