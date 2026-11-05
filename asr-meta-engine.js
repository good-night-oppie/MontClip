/* Meta's model, as the local server runs it (Deja, 2026-11-04; ADR #122: "只让可选的引擎失败"). Each transcription with
   Meta's model runs in a child process (asr-meta-run.js, which uses asr-local.js's own path), never in the server: if
   the model crashes the engine, or the computer runs out of memory, only that child ends. The server keeps answering,
   Paraformer (asr-local.js, in the server) is untouched, and the streamer gets a plain message.
   Before it starts: about as much free memory as the model was measured to need (desktop/asr-manifest.json asrMeta.ramMB).
   The server checks the files and the consent record first (asr-consent.js).

   createMetaEngine({asrDir, modelsDir, ffmpeg, cacheDir, threads, fork, freeMem, runner}) → {
     transcribe(file, {signal, onProgress, duration}),
     release({timeoutMs}) → {released, stopped}: stops every Meta transcription and resolves once its process has ended
       (〔删掉 Meta 的模型〕: Windows keeps the model's files while the process loads them; Rea, 11-05). Until unhold(),
       no new one starts (ASR_BUSY).
     unhold() }
   Errors: ASR_OPTIONAL_NO_MEMORY {needMB, freeMB}, ASR_OPTIONAL_CRASHED {exitCode, signal}, ASR_OPTIONAL_MODEL_BROKEN,
   ASR_CANCELLED, ASR_BUSY (being removed), and asr-local.js's own codes passed through. */
"use strict";
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { manifest } = require("./asr-models");

const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

function createMetaEngine({ asrDir, modelsDir, ffmpeg, cacheDir, threads = 4, fork = childProcess.fork, freeMem = os.freemem, runner = path.join(__dirname, "asr-meta-run.js") } = {}) {
  const live = new Set();      // the processes running now
  let held = false;            // being removed: no new transcription
  let waiters = [];            // release() calls waiting for every process to end
  const ended = (child) => { live.delete(child); if (!live.size) { for (const w of waiters) w(); waiters = []; } };
  function transcribe(file, { signal, onProgress = () => {}, duration = null } = {}) {
    if (held) return Promise.reject(err("ASR_BUSY", "Meta's model is being removed"));
    const needMB = (manifest.models.asrMeta && manifest.models.asrMeta.ramMB) || 0, freeMB = Math.round(freeMem() / 1048576);
    if (needMB && freeMB < needMB) return Promise.reject(err("ASR_OPTIONAL_NO_MEMORY", `not enough free memory for Meta's model: about ${needMB} MB needed, ${freeMB} MB free`, { needMB, freeMB }));
    if (signal && signal.aborted) return Promise.reject(err("ASR_CANCELLED", "cancelled"));
    return new Promise((resolve, reject) => {
      let settled = false, tail = "";
      // in the desktop app this server is Electron's utilityProcess: the child is the same binary run as plain Node
      const child = fork(runner, [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
      live.add(child);
      if (child.stderr) child.stderr.on("data", (c) => { tail = (tail + c).slice(-2000); });
      const settle = (fn, v) => { if (settled) return; settled = true; if (signal) signal.removeEventListener("abort", onAbort); fn(v); };
      const onAbort = () => { try { child.kill(); } catch { } settle(reject, err("ASR_CANCELLED", "cancelled")); };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      child.on("message", (m) => {
        if (!m || typeof m !== "object") return;
        if (m.t === "progress") onProgress(m.frac);
        else if (m.t === "done") settle(resolve, m.result);
        else if (m.t === "error") settle(reject, err(m.code || "ASR_FAILED", m.message || "Meta's model failed", { gaps: m.gaps }));
      });
      child.on("error", (e) => { ended(child); settle(reject, err("ASR_OPTIONAL_CRASHED", "Meta's model could not be started: " + e.message)); });
      // it ended without an answer: crashed (a broken model, out of memory, killed) — or stopped by release(). Only this
      // process ended.
      child.on("exit", (code, sig) => {
        ended(child);
        settle(reject, child.released ? err("ASR_CANCELLED", "cancelled: Meta's model is being removed") : err("ASR_OPTIONAL_CRASHED",
          `Meta's model stopped (${sig ? "signal " + sig : "exit code " + code}); Paraformer is not affected` + (tail.trim() ? ": " + tail.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300) : ""),
          { exitCode: code, signal: sig }));
      });
      child.send({ file, duration, asrDir, modelsDir, ffmpeg, cacheDir, threads });
    });
  }
  function release({ timeoutMs = 10000 } = {}) {
    held = true;
    const stopped = live.size;
    for (const child of live) { child.released = true; try { child.kill(); } catch { } }
    if (!live.size) return Promise.resolve({ released: true, stopped });
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); resolve({ released: true, stopped }); };
      const timer = setTimeout(() => { waiters = waiters.filter((w) => w !== done); resolve({ released: false, stopped }); }, timeoutMs);
      waiters.push(done);
    });
  }
  return { transcribe, release, unhold: () => { held = false; } };
}

module.exports = { createMetaEngine };
