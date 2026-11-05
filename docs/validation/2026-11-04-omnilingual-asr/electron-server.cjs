/* Windows acceptance (Deja, 2026-11-04): the desktop path as it runs. Electron's utilityProcess runs server.js exactly
   as desktop/main.js starts it (PORT 0, 127.0.0.1, the session token, a data folder, the models folder), and the page's
   request POST /api/asr/transcribe {src, model} goes through server.js → asr-local.js → sherpa-onnx in that process.
     <electron 45> docs/validation/2026-11-04-omnilingual-asr/electron-server.cjs <models folder> <meta|paraformer> <audio file>
   <models folder>: asrMeta/{model.int8.onnx, tokens.txt, LICENSE} for Meta (the app's own layout); Paraformer comes from
   vendor/asr/models (node desktop/fetch-asr.cjs --models asr). DEVELOPMENT ONLY: for "meta" this script writes the
   consent record itself so no one has to click (in the app only the streamer agrees, in the host's own box), and
   removes it when it is done. Prints one JSON line: words, wall time, RTF, and the utility process's peak memory
   (Windows PeakWorkingSet64 of that process, read after the transcription). */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..", "..", "..");
const { app, utilityProcess } = require("electron");
const [modelsDir, which, audio] = process.argv.slice(-3);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const peakMB = (pid) => { try { return Math.round(Number(execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).PeakWorkingSet64`]).toString().trim()) / 1048576); } catch { return null; } };

app.whenReady().then(async () => {
  const consent = require(path.join(ROOT, "asr-consent")).createConsent({ modelsDir: path.resolve(modelsDir) });
  if (which === "meta") consent.agree("asrMeta", "validation");   // development only (see above)
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-electron-server-"));
  fs.mkdirSync(path.join(data, "media"), { recursive: true });
  const name = "speech" + path.extname(audio);
  fs.copyFileSync(audio, path.join(data, "media", name));
  const token = crypto.randomBytes(32).toString("hex");
  const env = { ...process.env, PORT: "0", HOST: "127.0.0.1", MONTCLIP_DESKTOP: "1", MONTCLIP_SESSION_TOKEN: token, FABLECUT_DATA_DIR: data,
    MONTCLIP_ASR_MODELS_DIR: path.resolve(modelsDir) };
  delete env.NODE_OPTIONS;
  const worker = utilityProcess.fork(path.join(ROOT, "server.js"), [], { env, stdio: "pipe" });
  worker.stderr?.on("data", (d) => process.stderr.write(d));
  try {
    const origin = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("server did not start")), 30000);
      worker.on("message", (m) => { if (m && m.type === "montclip-ready") { clearTimeout(t); resolve(m.origin); } });
    });
    // plain http, no time limit: a long recording answers only when it is done
    const call = (p, body) => new Promise((resolve, reject) => {
      const req = http.request(origin + p, { method: body ? "POST" : "GET", headers: { "X-MontClip-Session": token, "Content-Type": "application/json" } }, (res) => {
        let b = ""; res.setEncoding("utf8"); res.on("data", (c) => { b += c; });
        res.on("end", () => { let j = {}; try { j = JSON.parse(b); } catch { } resolve({ ...j, http: res.statusCode }); });
      });
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
    const st = await call("/api/asr/status");
    const t0 = Date.now();
    const r = await call("/api/asr/transcribe", which === "meta" ? { src: "/media/" + name, model: "meta" } : { src: "/media/" + name });
    const wall = (Date.now() - t0) / 1000;
    const doc = await call("/api/transcript?src=" + encodeURIComponent("/media/" + name));
    const w = (doc.transcript && doc.transcript.words) || [];
    out({ which, electron: process.versions.electron, utilityPid: worker.pid, ready: which === "meta" ? st.asrMeta : st.asr && st.asr.ready,
      http: r.http, result: r.status, code: r.code, error: r.error, words: r.words, duration: r.duration, speech: r.speech, gaps: r.gaps,
      wallSeconds: wall, rtfOfRecording: r.duration ? +(wall / r.duration).toFixed(4) : null, threads: 4, utilityPeakMB: peakMB(worker.pid),
      savedModel: doc.transcript && doc.transcript.model, firstWords: w.slice(0, 9).map((x) => x[0]).join(" "),
      cpu: os.cpus()[0].model.trim(), logicalCpus: os.cpus().length });
  } finally {
    if (which === "meta") fs.rmSync(path.join(path.resolve(modelsDir), "consent", "asrMeta.json"), { force: true });
    worker.kill();
    setTimeout(() => { fs.rmSync(data, { recursive: true, force: true }); app.quit(); }, 500);
  }
}).catch((e) => { out({ error: String(e.message || e) }); app.quit(); });
