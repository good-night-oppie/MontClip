/* The optional speech engine, as the local server sees it (Deja, 2026-11-04; asr-optional.js has the rules).
   Each transcription runs in a child process of its own (asr-optional-run.js), never in the server: if the optional
   model crashes the engine, or the computer runs out of memory, only that child ends. The server keeps answering, the
   default engine (asr-local.js, in the server) is untouched, and the streamer gets a plain message saying so.
   Before it starts: the model must be ready (agreed to, every file matching its SHA-256 — a damaged or missing file is
   never loaded), and there must be about as much free memory as the model was measured to need (ramMB).

   createOptionalAsr({asrDir, optional, ffmpeg, threads, fork, freeMem}) → {active(), transcribe(file, {signal, onProgress, duration})} */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { manifest } = require("./asr-models");

const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

function createOptionalAsr({ asrDir, optional, ffmpeg, threads = 4, fork = childProcess.fork, freeMem = os.freemem, runner = path.join(__dirname, "asr-optional-run.js") } = {}) {
  asrDir = path.resolve(asrDir);
  const engineDir = path.join(asrDir, "engine", "node_modules", "sherpa-onnx-node");
  const vadFile = path.join(asrDir, manifest.engine.vad.file);
  const active = () => optional.active();

  function transcribe(file, { signal, onProgress = () => {}, duration = null } = {}) {
    const id = optional.active();
    if (!id) return Promise.reject(err("ASR_OPTIONAL_NOT_READY", "no optional speech model is in use"));
    let vadOk = false;
    try { vadOk = fs.statSync(vadFile).size === manifest.engine.vad.size; } catch { }
    if (!vadOk || !fs.existsSync(path.join(engineDir, "package.json"))) return Promise.reject(err("ASR_ENGINE_MISSING", "the speech engine is missing from this copy of MontClip — unzip the package again"));
    const st = optional.status(id), modelDir = optional.dir(id);
    if (!modelDir) return Promise.reject(err("ASR_OPTIONAL_NOT_READY", "the optional model's files are missing or changed: " + [...st.missing, ...st.bad].join(", ")));
    const needMB = st.ramMB || 0, freeMB = Math.round(freeMem() / 1048576);
    if (needMB && freeMB < needMB) return Promise.reject(err("ASR_OPTIONAL_NO_MEMORY", `not enough free memory for ${st.name}: about ${needMB} MB needed, ${freeMB} MB free`, { needMB, freeMB, model: id }));
    if (signal && signal.aborted) return Promise.reject(err("ASR_CANCELLED", "cancelled"));

    return new Promise((resolve, reject) => {
      let settled = false, tail = "";
      const child = fork(runner, [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
      if (child.stderr) child.stderr.on("data", (c) => { tail = (tail + c).slice(-2000); });
      const settle = (fn, v) => { if (settled) return; settled = true; if (signal) signal.removeEventListener("abort", onAbort); fn(v); };
      const onAbort = () => { try { child.kill(); } catch { } settle(reject, err("ASR_CANCELLED", "cancelled")); };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      child.on("message", (m) => {
        if (!m || typeof m !== "object") return;
        if (m.t === "progress" && duration > 0) onProgress(Math.min(0.99, m.seconds / duration));
        else if (m.t === "done") settle(resolve, { ...m.result, model: id, language: "multi" });
        else if (m.t === "error") settle(reject, err(m.code || "ASR_FAILED", m.message || "the optional engine failed", { gaps: m.gaps, model: id }));
      });
      child.on("error", (e) => settle(reject, err("ASR_OPTIONAL_CRASHED", "the optional engine could not be started: " + e.message, { model: id })));
      // it ended without an answer: crashed (a broken model, out of memory, killed). Only this process ended.
      child.on("exit", (code, sig) => settle(reject, err("ASR_OPTIONAL_CRASHED",
        `the optional engine stopped (${sig ? "signal " + sig : "exit code " + code}) — the default engine is not affected` + (tail.trim() ? ": " + tail.trim().split(/\r?\n/).slice(-2).join(" ").slice(0, 300) : ""),
        { model: id, exitCode: code, signal: sig })));
      child.send({ file, ffmpeg, engineDir, vadFile, modelDir, threads });
    });
  }
  return { active, transcribe };
}

module.exports = { createOptionalAsr };
