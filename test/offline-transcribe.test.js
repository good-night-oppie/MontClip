"use strict";
// On-device transcription, offline (owner, 2026-11-03): transformers.js, the ONNX Runtime wasm and the Whisper models
// ship in the package and load from the app itself; nothing is fetched from jsdelivr or Hugging Face at run time.
const test = require("node:test"), a = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { makeDataDir, startServer } = require("./helpers");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("the editor and the worker load transformers.js, the wasm and the models from the app, never from the network", () => {
  const T = require("../transcribe");
  a.equal(T.LIBRARY, "/transcribe-assets/transformers/transformers.min.js");
  a.equal(T.ASSETS, "/transcribe-assets/");
  for (const f of ["transcribe.js", "transcribe-worker.js"]) a.doesNotMatch(read(f), /https?:\/\//, f + " names no remote URL");
  const w = read("transcribe-worker.js");
  a.match(w, /T\.env\.allowRemoteModels = false;/);
  a.match(w, /T\.env\.allowLocalModels = true;/);
  a.match(w, /T\.env\.localModelPath = new URL\(m\.assets \+ "models\/", self\.location\.href\)\.href;/);
  a.match(w, /T\.env\.useBrowserCache = false;/);
  a.match(w, /T\.env\.backends\.onnx\.wasm\.wasmPaths = \{ mjs: new URL\(m\.assets \+ "ort\/ort-wasm-simd-threaded\.jsep\.mjs"/);
  a.doesNotMatch(read("app.js"), /check the internet connection \(it is needed the first time\)/, "no message about downloading the model");
});

test("every bundled file is pinned: a version, a source and a SHA-256", () => {
  const m = JSON.parse(read("desktop/transcribe-manifest.json"));
  a.equal(m.transformers.version, "4.3.1"); a.equal(m.transformers.license, "Apache-2.0");
  a.equal(m.ort.license, "MIT");
  const files = [...Object.values(m.transformers.files), ...Object.values(m.ort.files), ...Object.values(m.models).flatMap((x) => Object.values(x.files))];
  a.ok(files.length >= 16);
  for (const f of files) a.match(String(f.sha256), /^[0-9a-f]{64}$/);
  for (const x of Object.values(m.models)) { a.match(x.revision, /^[0-9a-f]{40}$/); a.match(x.license, /^Apache-2\.0/); }
});

// the files in vendor/transcribe/ (fetched by desktop/fetch-transcribe.cjs; not in git) match the manifest
test("the bundled model files' SHA-256 match the manifest", { skip: !fs.existsSync(path.join(ROOT, "vendor", "transcribe", "SOURCE.json")) && "vendor/transcribe not fetched here" }, () => {
  const r = require("../desktop/fetch-transcribe.cjs").verify();
  a.deepEqual(r.bad, []); a.equal(r.ok, true);
});

test("the server serves the bundled files, with the types a worker needs, and nothing outside them", async (t) => {
  const dir = makeDataDir(t);
  const assets = fs.mkdtempSync(path.join(os.tmpdir(), "mc-asr-")); t.after(() => fs.rmSync(assets, { recursive: true, force: true }));
  fs.mkdirSync(path.join(assets, "ort")); fs.mkdirSync(path.join(assets, "models", "x"), { recursive: true });
  fs.writeFileSync(path.join(assets, "ort", "a.wasm"), Buffer.from([0, 97, 115, 109]));
  fs.writeFileSync(path.join(assets, "ort", "a.mjs"), "export {}");
  fs.writeFileSync(path.join(assets, "models", "x", "m.onnx"), "x");
  fs.writeFileSync(path.join(dir, "secret.txt"), "no");
  const { base, port } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1", MONTCLIP_TRANSCRIBE_DIR: assets });
  const wasm = await fetch(base + "/transcribe-assets/ort/a.wasm");
  a.equal(wasm.status, 200); a.equal(wasm.headers.get("content-type"), "application/wasm"); await wasm.arrayBuffer();
  const mjs = await fetch(base + "/transcribe-assets/ort/a.mjs");
  a.match(mjs.headers.get("content-type"), /^text\/javascript/); await mjs.text();
  const onnx = await fetch(base + "/transcribe-assets/models/x/m.onnx");
  a.equal(onnx.status, 200); await onnx.arrayBuffer();
  a.equal((await fetch(base + "/transcribe-assets/models/x/none.onnx")).status, 404);
  const { rawGet } = require("./helpers");
  const up = await rawGet(port, "/transcribe-assets/..%2f..%2fsecret.txt");
  a.notEqual(up.status, 200);
});

test("the desktop window may compile wasm (and still nothing else changes in its policy)", () => {
  const main = read("desktop/main.js");
  a.match(main, /script-src 'self' 'wasm-unsafe-eval';/);
  a.doesNotMatch(main, /'unsafe-eval'[^-]/, "no general eval");
  a.match(main, /callback\(\{ cancel: !local\(details\.url\) && !embedded \}\);/, "every request off this computer is still refused");
  a.match(main, /env\.MONTCLIP_TRANSCRIBE_DIR = path\.join\(process\.resourcesPath, "transcribe"\);/);
});

test("packaging copies the checked vendor/transcribe folder into resources/transcribe", () => {
  const pkg = read("desktop/package-win.cjs");
  a.match(pkg, /require\('\.\/fetch-transcribe\.cjs'\)\.verify\(\)/);
  a.match(pkg, /path\.join\(out, 'resources', 'transcribe'\)/);
});
