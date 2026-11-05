/* Development check of the whole desktop path on Windows (Deja, 2026-11-04): Electron's utilityProcess runs server.js
   exactly as desktop/main.js starts it (PORT 0, 127.0.0.1, the session token, a data folder, the models folder), and
   the page's request POST /api/asr/transcribe goes through the server → asr-optional-engine.js → its own child
   process → the real Omnilingual model. Then the consent record is taken away and the same server transcribes the
   same file with the default engine (asr-local.js, Paraformer), to show it is untouched.
     <electron 45> docs/validation/2026-11-04-omnilingual-asr/electron-server.cjs <models folder> <model id> <audio file>
   <models folder> holds optional/<model id>/ (fetch-model.cjs puts it there). DEVELOPMENT ONLY: this script writes a
   consent record itself so that no one has to click; in the app only the streamer agrees, in the host's own box.
   It removes the record when it is done. Prints JSON lines; no transcript text beyond the first words. */
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const ROOT = path.join(__dirname, "..", "..", "..");
const { app, utilityProcess } = require("electron");
const [modelsDir, id, audio] = process.argv.slice(-3);
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");

app.whenReady().then(async () => {
  const O = require(path.join(ROOT, "asr-optional"));
  const store = O.createOptional({ userDir: path.resolve(modelsDir) });
  if (!store.status(id).installed) throw new Error("the model is not in " + modelsDir + " (fetch-model.cjs)");
  for (const k of Object.keys(O.manifest.models)) fs.rmSync(path.join(path.resolve(modelsDir), "optional", ".consent", k + ".json"), { force: true });
  store.consent(id);   // development only (see above)
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
  const origin = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 30000);
    worker.on("message", (m) => { if (m && m.type === "montclip-ready") { clearTimeout(t); resolve(m.origin); } });
  });
  // plain http, no time limit: a long recording answers only when it is done (fetch gives up after 300 s of no headers)
  const http = require("node:http");
  const call = (p, body) => new Promise((resolve, reject) => {
    const req = http.request(origin + p, { method: body ? "POST" : "GET", headers: { "X-MontClip-Session": token, "Content-Type": "application/json" } }, (res) => {
      let b = ""; res.setEncoding("utf8"); res.on("data", (c) => { b += c; });
      res.on("end", () => { let j = {}; try { j = JSON.parse(b); } catch { } resolve({ ...j, http: res.statusCode }); });
    });
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
  try {
    const st = await call("/api/asr/status");
    out({ step: "status", workerPid: worker.pid, optionalActive: st.optional && st.optional.active, defaultModelReady: st.asr && st.asr.ready });
    let t0 = Date.now();
    const r1 = await call("/api/asr/transcribe", { src: "/media/" + name });
    const wall1 = (Date.now() - t0) / 1000;
    const doc1 = await call("/api/transcript?src=" + encodeURIComponent("/media/" + name));
    const w1 = (doc1.transcript && doc1.transcript.words) || [];
    out({ step: "optional engine through the server", http: r1.http, result: r1.status, code: r1.code, engine: r1.engine, model: r1.model,
      words: r1.words, duration: r1.duration, speech: r1.speech, wallSeconds: wall1, rtfOfRecording: +(wall1 / r1.duration).toFixed(4),
      threads: r1.threads, childPeakMB: r1.maxRssMB, savedModel: doc1.transcript && doc1.transcript.model, firstWords: w1.slice(0, 8).map((w) => w[0]).join(" "),
      cpu: os.cpus()[0].model.trim(), logicalCpus: os.cpus().length });
    // no consent record any more: the same server goes back to the default engine
    fs.rmSync(path.join(path.resolve(modelsDir), "optional", ".consent", id + ".json"), { force: true });
    t0 = Date.now();
    const r2 = await call("/api/asr/transcribe", { src: "/media/" + name });
    out({ step: "default engine after the record is gone, same server", http: r2.http, result: r2.status, engine: r2.engine || "default", words: r2.words, wallSeconds: (Date.now() - t0) / 1000,
      sameWorker: !worker.killed });
  } finally {
    fs.rmSync(path.join(path.resolve(modelsDir), "optional", ".consent", id + ".json"), { force: true });
    worker.kill();
    setTimeout(() => { fs.rmSync(data, { recursive: true, force: true }); app.quit(); }, 500);
  }
}).catch((e) => { out({ error: String(e.message || e) }); app.quit(); });
