/* The local real-time factor of MontClip's own transcription path (asr-local.js: ffmpeg → silero VAD → Paraformer zh
   int8, 4 threads → CT-Transformer punctuation), on one recording. Prints numbers only: no text, no file name.

     MONTCLIP_FFMPEG_DIR=<bundled ffmpeg dir> node docs/validation/2026-11-03-asr-local/rtf.cjs <audio or video file>

   Needs vendor/asr with the models (node desktop/fetch-asr.cjs --models asr,punct). */
"use strict";
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..", "..");
const { createAsr } = require(path.join(ROOT, "asr-local"));
const FF = require(path.join(ROOT, "ffmpeg-path"));
(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("usage: rtf.cjs <file>");
  const asr = createAsr({ asrDir: path.join(ROOT, "vendor", "asr"), modelsDir: path.join(ROOT, "vendor", "asr", "models"), ffmpeg: FF.path("ffmpeg") });
  let peak = 0;
  const t = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 200);
  const t0 = Date.now();
  const r = await asr.transcribe(path.resolve(file), {});
  const wall = (Date.now() - t0) / 1000;
  clearInterval(t);
  peak = Math.max(peak, process.memoryUsage().rss);
  const os = require("node:os");
  process.stdout.write(JSON.stringify({ cpu: os.cpus()[0].model.trim(), threads: os.cpus().length, node: process.version,
    duration: Math.round(r.duration * 10) / 10, speech: Math.round(r.speech * 10) / 10, segments: r.segments, characters: r.words.length,
    punctuated: r.punctuated, wallSeconds: wall, rtfOfRecording: +(wall / r.duration).toFixed(3), rtfOfSpeech: +(wall / r.speech).toFixed(3),
    peakRssMB: Math.round(peak / 1e6) }) + "\n");
  process.exit(0);
})().catch((e) => { console.error("rtf: " + e.message); process.exit(1); });
