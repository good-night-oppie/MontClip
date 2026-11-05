/* P8, DD's evidence on europa (Cindy main-2026-11-05.log): UnhandledPromiseRejection ENOENT
   …/montclip/node/app/desktop/asr-manifest.json at asr-models.js:22 — the plugin's package had no manifest, no
   engine (vendor/asr) and no VAD, and the agent only heard "the editor stopped reporting progress".
   Each way transcription can be unavailable has its own code, on /api/asr/status (code) and on
   /api/asr/transcribe (409 {code}), and the server keeps running:
     ASR_MANIFEST_MISSING  this copy of MontClip lacks desktop/asr-manifest.json
     ASR_ENGINE_MISSING    no engine folder (sherpa-onnx-node, its native part for this system, the VAD)
     ASR_MODEL_MISSING     the engine is there, the speech model is not
   fablecut_transcribe turns each into a plain sentence for the user (drafts for JJ). */
"use strict";
const test = require("node:test");
const a = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");

const ROOT = path.join(__dirname, "..");

/** A data folder with one (fake) recording; the server answers status and a transcribe request for it. */
async function ask(t, env, opts) {
  const dataDir = makeDataDir(t);
  fs.mkdirSync(path.join(dataDir, "media"), { recursive: true }); fs.writeFileSync(path.join(dataDir, "media", "a.wav"), Buffer.alloc(100));
  const s = await startServer(t, dataDir, { FABLECUT_NO_FS_WATCH: "1", ...env(dataDir) }, opts);
  const st = await fetch(s.base + "/api/asr/status");
  const status = { http: st.status, body: await st.json() };
  const tr = await fetch(s.base + "/api/asr/transcribe", { method: "POST", body: JSON.stringify({ src: "/media/a.wav" }) });
  const transcribe = { http: tr.status, body: await tr.json() };
  const alive = (await fetch(s.base + "/api/project")).status === 200;
  return { status, transcribe, alive };
}

test("no desktop/asr-manifest.json (the plugin's package): ASR_MANIFEST_MISSING, and the server keeps running", async (t) => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-nomanifest-"));
  t.after(() => fs.rmSync(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  for (const f of fs.readdirSync(ROOT)) if (/\.(js|html|css|json)$/.test(f) && f !== "project.json") fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
  fs.mkdirSync(path.join(app, "desktop"));
  for (const f of ["ffmpeg-manifest.json", "fetch-ffmpeg.cjs"]) fs.copyFileSync(path.join(ROOT, "desktop", f), path.join(app, "desktop", f));
  const r = await ask(t, (d) => ({ MONTCLIP_ASR_DIR: path.join(d, "asr") }), { serverJs: path.join(app, "server.js") });
  a.equal(r.status.http, 200);
  a.equal(r.status.body.code, "ASR_MANIFEST_MISSING");
  a.equal(r.transcribe.http, 409);
  a.equal(r.transcribe.body.code, "ASR_MANIFEST_MISSING");
  a.ok(r.alive, "still running");
});

test("no engine folder at all: ASR_ENGINE_MISSING", async (t) => {
  const r = await ask(t, (d) => ({ MONTCLIP_ASR_DIR: path.join(d, "no-such-folder"), MONTCLIP_ASR_MODELS_DIR: path.join(d, "no-models") }));
  a.equal(r.status.http, 200);
  a.equal(r.status.body.code, "ASR_ENGINE_MISSING");
  a.equal(r.status.body.engine.ready, false);
  a.equal(r.transcribe.http, 409);
  a.equal(r.transcribe.body.code, "ASR_ENGINE_MISSING");
  a.ok(r.alive);
});

test("the engine is there, the model is not: ASR_MODEL_MISSING", async (t) => {
  const r = await ask(t, (d) => {
    const asrDir = path.join(d, "asr"), nm = path.join(asrDir, "engine", "node_modules");
    for (const pkg of ["sherpa-onnx-node", require("../asr-local").nativePackage()]) {
      fs.mkdirSync(path.join(nm, pkg), { recursive: true }); fs.writeFileSync(path.join(nm, pkg, "package.json"), "{}");
    }
    fs.writeFileSync(path.join(asrDir, "silero_vad.onnx"), Buffer.alloc(643854));
    return { MONTCLIP_ASR_DIR: asrDir, MONTCLIP_ASR_MODELS_DIR: path.join(d, "no-models") };
  });
  a.equal(r.status.body.code, "ASR_MODEL_MISSING");
  a.equal(r.status.body.engine.ready, true);
  a.equal(r.transcribe.http, 409);
  a.equal(r.transcribe.body.code, "ASR_MODEL_MISSING");
  a.ok(r.alive);
});

test("everything installed: status says no code", () => {
  // the codes come from one place, in order: manifest, engine (with the VAD), model
  const S = require("../asr-status.js");
  a.equal(S.code(null), "ASR_MANIFEST_MISSING");
  a.equal(S.code({ engine: { ready: false }, vad: { ready: true }, asr: { ready: true } }), "ASR_ENGINE_MISSING");
  a.equal(S.code({ engine: { ready: true }, vad: { ready: false }, asr: { ready: true } }), "ASR_ENGINE_MISSING");
  a.equal(S.code({ engine: { ready: true }, vad: { ready: true }, asr: { ready: false } }), "ASR_MODEL_MISSING");
  a.equal(S.code({ engine: { ready: true }, vad: { ready: true }, asr: { ready: true } }), null);
});

test("fablecut_transcribe: a package without the speech manifest is said plainly too", () => {
  const src = fs.readFileSync(path.join(ROOT, "mcp-server.js"), "utf8");
  a.match(src, /ASR_MANIFEST_MISSING/, "mcp-server knows the code");
  const S = require("../asr-status.js");
  for (const code of ["ASR_MANIFEST_MISSING", "ASR_ENGINE_MISSING", "ASR_MODEL_MISSING"]) {
    a.match(S.SAY[code], /nothing was transcribed/i, code);
    a.match(S.SAY[code], /「[^」]+」/, code + " carries a sentence for the user");
  }
});

/* JJ's final words (2026-11-05, through Deja), word for word. 「剪辑、导出照常能用」 was added only after import, cut
   and export were run on a computer without the transcription program (europa, see #165). The model's size comes
   from desktop/asr-manifest.json, never written by hand. */
const JJ = {
  engine: {
    zh: "这台电脑上的 MontClip 还没有听写程序，现在还不能把说的话转成文字。剪辑、导出照常能用。",
    en: "MontClip on this computer doesn't have the transcription program yet, so speech can't be turned into text right now. Editing and exporting still work.",
  },
  model: {
    zh: (mb) => `还没装听写模型（约 ${mb} MB），现在还不能把说的话转成文字。装好以后再试一次。`,
    en: (mb) => `The speech model isn't installed yet (about ${mb} MB), so speech can't be turned into text right now. Try again after it's installed.`,
  },
};
const modelMb = () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "asr-manifest.json"), "utf8")).models.asr;
  // MB of 1,000,000 bytes, to the nearest 10 — the same rule as the plugin's status card (DD on MontClip-Cindy#7)
  return Math.round(Object.values(m.files).reduce((n, f) => n + f.size, 0) / 1e6 / 10) * 10;
};

test("JJ's final sentences for the user, word for word; the model's size from the manifest", () => {
  const S = require("../asr-status.js");
  a.equal(modelMb(), 240, "the pinned Paraformer files: 243,446,974 bytes, about 240 MB");
  a.deepEqual(S.userText("ASR_ENGINE_MISSING"), JJ.engine);
  a.deepEqual(S.userText("ASR_MANIFEST_MISSING"), JJ.engine, "a copy without the manifest has no transcription program either");
  a.deepEqual(S.userText("ASR_MODEL_MISSING"), { zh: JJ.model.zh(modelMb()), en: JJ.model.en(modelMb()) });
  for (const code of ["ASR_MANIFEST_MISSING", "ASR_ENGINE_MISSING", "ASR_MODEL_MISSING"]) {
    const say = S.SAY[code];
    a.ok(say.includes(S.userText(code).zh) && say.includes(S.userText(code).en), code + ": both sentences, as written");
    a.doesNotMatch(say, /draft|JJ to finalise|草稿/i, code + ": final, no draft marks");
  }
});

test("the agent alone hears what is missing: missing and the manifest's ids, marked not for the user", () => {
  const S = require("../asr-status.js");
  const { nativePackage } = require("../asr-local");
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop", "asr-manifest.json"), "utf8"));
  a.deepEqual(S.agentCode("ASR_MODEL_MISSING"), { code: "ASR_MODEL_MISSING", missing: "model", ids: [m.models.asr.id] });
  a.deepEqual(S.agentCode("ASR_ENGINE_MISSING"), { code: "ASR_ENGINE_MISSING", missing: "engine", ids: ["sherpa-onnx-node@2.0.1", nativePackage() + "@2.0.1", m.engine.vad.file] });
  a.deepEqual(S.agentCode("ASR_MANIFEST_MISSING"), { code: "ASR_MANIFEST_MISSING", missing: "manifest", ids: ["desktop/asr-manifest.json"] });
  for (const code of ["ASR_MANIFEST_MISSING", "ASR_ENGINE_MISSING", "ASR_MODEL_MISSING"]) {
    const say = S.SAY[code];
    const i = say.indexOf(JSON.stringify(S.agentCode(code)));
    a.ok(i > 0, code + ": the code is in the reply");
    a.match(say.slice(0, i), /never show (it|this) to the user/i, code + ": marked as the agent's only");
  }
});

/* QQ on #165: the ENOENT from asr-models.js (a missing manifest) and the require error from asr-local.js (an engine
   that can't be loaded) carry the full install path, and went out in /api/asr/status's engine.why and the 409's error.
   What reaches the page names no path on this computer: not the app's folder, the user's home or the temp folder. */
const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out); return out; };
function noLocalPath(body, roots, what) {
  for (const s of strings(body)) for (const r of roots.filter(Boolean)) {
    a.ok(!s.toLowerCase().includes(r.toLowerCase()), `${what}: "${s}" names ${r}`);
    a.ok(!s.toLowerCase().includes(r.split("\\").join("/").toLowerCase()), `${what}: "${s}" names ${r}`);
  }
}
const localRoots = (...more) => [os.homedir(), os.tmpdir(), fs.realpathSync(os.tmpdir()), ROOT, ...more];

test("no manifest: status and the 409 name no path on this computer", async (t) => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-nomanifest-"));
  t.after(() => fs.rmSync(app, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  for (const f of fs.readdirSync(ROOT)) if (/\.(js|html|css|json)$/.test(f) && f !== "project.json") fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
  fs.mkdirSync(path.join(app, "desktop"));
  for (const f of ["ffmpeg-manifest.json", "fetch-ffmpeg.cjs"]) fs.copyFileSync(path.join(ROOT, "desktop", f), path.join(app, "desktop", f));
  const r = await ask(t, (d) => ({ MONTCLIP_ASR_DIR: path.join(d, "asr") }), { serverJs: path.join(app, "server.js") });
  a.equal(r.status.body.code, "ASR_MANIFEST_MISSING");
  a.match(r.status.body.engine.why, /asr-manifest\.json/, "still says which file");
  noLocalPath(r.status.body, localRoots(app), "status");
  noLocalPath(r.transcribe.body, localRoots(app), "409");
});

test("an engine that can't be loaded: the error names no path on this computer", async (t) => {
  const { manifest } = require("../asr-models");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-badengine-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const nm = path.join(dir, "engine", "node_modules");
  // sherpa-onnx-node whose main file is not there: require() throws "Cannot find module '<full path>'"
  fs.mkdirSync(path.join(nm, "sherpa-onnx-node"), { recursive: true }); fs.writeFileSync(path.join(nm, "sherpa-onnx-node", "package.json"), '{"main":"gone.js"}');
  const native = path.join(nm, require("../asr-local").nativePackage()); fs.mkdirSync(native); fs.writeFileSync(path.join(native, "package.json"), "{}");
  const vad = path.join(dir, manifest.engine.vad.file); fs.writeFileSync(vad, ""); fs.truncateSync(vad, manifest.engine.vad.size);
  fs.mkdirSync(path.join(dir, "model"));
  const store = { dir: (k) => (k === "asr" ? path.join(dir, "model") : null), status: () => ({ asr: { ready: true, missing: [], bad: [] }, punct: { ready: false, missing: [], bad: [] } }) };
  const asr = require("../asr-local").createAsr({ asrDir: dir, store, ffmpeg: "ffmpeg" });
  let err = null;
  try { await asr.transcribe(path.join(dir, "x.wav"), {}); } catch (e) { err = e; }
  a.equal(err && err.code, "ASR_ENGINE_MISSING");
  noLocalPath({ message: err.message }, localRoots(dir), "engine error");
});

test("hidePaths: a path keeps only its last part; a URL, a ratio or a time is left alone", () => {
  const { hidePaths } = require("../asr-status.js");
  a.equal(hidePaths("open 'C:\\Users\\name\\AppData\\x\\desktop\\asr-manifest.json'"), "open '…/asr-manifest.json'");
  a.equal(hidePaths("Cannot find module '/home/name/x/sherpa-onnx-node/gone.js'. Please"), "Cannot find module '…/gone.js'. Please");
  a.equal(hidePaths("open '~/MontClip/desktop/asr-manifest.json'"), "open '…/asr-manifest.json'");
  a.equal(hidePaths("\\\\server\\share\\a.txt"), "…/a.txt");
  for (const keep of ["see http://127.0.0.1:7777/api/asr", "ratio 1/2 at 12:30", "basic_string::_S_create"]) a.equal(hidePaths(keep), keep);
});
