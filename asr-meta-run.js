/* Meta's model in a process of its own (Deja, 2026-11-04; ADR #122: only the optional engine may fail). asr-meta-engine.js
   forks this; it runs asr-local.js's own path — ffmpeg → silero VAD → Omnilingual with 0.25 s of silence each side →
   letter words, punctuation only on Chinese segments — exactly as the server would, and sends the result back. If the
   model crashes the engine, or the computer runs out of memory, only this process ends.
   Messages to the parent: {t:"progress", frac}, {t:"done", result}, {t:"error", code, message, gaps}. */
"use strict";
const { createAsr } = require("./asr-local");

const send = (m) => { try { process.send(m); } catch { } };
// the last message goes out before the channel closes (then this process ends)
const last = (m) => process.send(m, () => process.disconnect());

if (require.main === module) {
  process.on("disconnect", () => process.exit(0));   // the parent went away, or is done with us
  process.once("message", (job) => {
    const asr = createAsr({ asrDir: job.asrDir, modelsDir: job.modelsDir, ffmpeg: job.ffmpeg, threads: job.threads, cacheDir: job.cacheDir });
    asr.transcribe(job.file, { model: "asrMeta", duration: job.duration, onProgress: (frac) => send({ t: "progress", frac }) }).then(
      (r) => last({ t: "done", result: { ...r, threads: job.threads, maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024) } }),
      (e) => {
        const message = String((e && e.message) || e).slice(0, 500);
        // the engine could not read a model that passed its checks: a damaged file, or not this kind of model
        const code = /create offline recognizer/i.test(message) ? "ASR_OPTIONAL_MODEL_BROKEN" : (e && e.code) || "ASR_FAILED";
        last({ t: "error", code, message, gaps: e && e.gaps });
      });
  });
}
