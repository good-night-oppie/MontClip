/* Fill vendor/asr/ with the on-device transcription files (#70, Deja 2026-11-03), for development and packaging.

   node desktop/fetch-asr.cjs [--models asr,punct] [--platform win32-x64]

   One source of truth: desktop/asr-manifest.json.
   - Always: the sherpa-onnx-node 2.0.1 npm tarballs (this platform's native package too), each checked against its
     pinned integrity, and the silero VAD, checked against its SHA-256. Every package carries these.
   - --models asr[,punct]: the speech model (and the punctuation model) through asr-models.js, the same code the app
     downloads with (the sources in order, every file against its SHA-256). Only the 完整版 package carries them.
   A mismatch fails and nothing is kept. Packaging copies this checked folder; it never downloads.

   vendor/asr/
     engine/node_modules/sherpa-onnx-node/…, engine/node_modules/sherpa-onnx-<platform>/…
     silero_vad.onnx
     models/asr/{model.int8.onnx, tokens.txt}, models/punct/{model.int8.onnx, tokens.json}   (with --models)
     test_wavs/0.wav   (with --models asr: the model's own test sentence, for the engine test; never packaged)
     SOURCE.json       what was installed, with every file's SHA-256 */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { download, sha256 } = require("./fetch-ffmpeg.cjs");

const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(__dirname, "asr-manifest.json");
const VENDOR = path.join(ROOT, "vendor", "asr");
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const integrityOk = (file, integrity) => {
  const [alg, b64] = integrity.split("-");
  return crypto.createHash(alg).update(fs.readFileSync(file)).digest("base64") === b64;
};
const tar = () => (process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar");
const walk = (dir, base = dir, out = []) => {
  for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); if (fs.statSync(f).isDirectory()) walk(f, base, out); else out.push(path.relative(base, f).split(path.sep).join("/")); }
  return out;
};

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const platform = arg("--platform") || `${process.platform}-${process.arch}`;
  const models = (arg("--models") || "").split(",").filter(Boolean);
  for (const m of models) if (!manifest.models[m]) throw new Error("unknown model " + m);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-asr-"));
  const stage = path.join(work, "stage");
  try {
    // the engine: the JS package and this platform's native package
    for (const pkg of manifest.engine.packages.filter((p) => !p.platform || p.platform === platform)) {
      const tgz = path.join(work, pkg.name + ".tgz");
      await download(pkg.tarball, tgz);
      if (!integrityOk(tgz, pkg.integrity)) throw new Error(pkg.name + ": the tarball does not match its pinned integrity");
      const to = path.join(stage, "engine", "node_modules", pkg.name);
      fs.mkdirSync(to, { recursive: true });
      execFileSync(tar(), ["-xzf", tgz, "-C", to, "--strip-components=1"]);
    }
    if (!fs.existsSync(path.join(stage, "engine", "node_modules", "sherpa-onnx-" + platform.replace(/^win32/, "win"))))
      throw new Error("no sherpa-onnx native package for " + platform);
    // the VAD
    const vad = manifest.engine.vad, vadTo = path.join(stage, vad.file);
    await download(vad.url, vadTo);
    if (fs.statSync(vadTo).size !== vad.size || sha256(vadTo) !== vad.sha256) throw new Error(vad.file + ": does not match its SHA-256");
    // the models, the way the app gets them
    if (models.length) {
      const { createStore } = require("../asr-models"), { fetchFile } = require("../asr-download");
      const store = createStore({ manifest, roots: [], userDir: path.join(stage, "models") });
      for (const m of models) {
        const r = await store.download(m, { fetchFile });
        process.stdout.write(`ASR_MODEL ${m} from ${r.source}${r.failed.length ? " (" + r.failed.map((f) => f.source + ": " + f.error).join("; ") + ")" : ""}\n`);
      }
      if (models.includes("asr")) {
        const t = manifest.devTest, to = path.join(stage, t.file);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        await download(t.url, to);
        if (sha256(to) !== t.sha256) throw new Error(t.file + ": does not match its SHA-256");
      }
    }
    const files = {};
    for (const rel of walk(stage)) files[rel] = sha256(path.join(stage, rel));
    fs.writeFileSync(path.join(stage, "SOURCE.json"), JSON.stringify({ manifestSha256: sha256(MANIFEST), platform, models, files }, null, 2) + "\n");
    fs.rmSync(VENDOR, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(VENDOR), { recursive: true });
    fs.cpSync(stage, VENDOR, { recursive: true });
    const bytes = Object.keys(files).reduce((n, rel) => n + fs.statSync(path.join(VENDOR, rel)).size, 0);
    process.stdout.write("ASR_ASSETS " + JSON.stringify({ platform, models, files: Object.keys(files).length, bytes }) + "\n");
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

/** Everything installed still matches SOURCE.json, and the VAD and (with `models`) the models match the manifest.
 *  Packaging calls this on vendor/asr before copying, and on resources/asr inside the package after. */
function verify({ dir = VENDOR, models = false } = {}) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const bad = [];
  let source = null;
  try { source = JSON.parse(fs.readFileSync(path.join(dir, "SOURCE.json"), "utf8")); } catch { return { ok: false, bad: ["SOURCE.json: missing or unreadable"] }; }
  const check = (rel, want) => {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) bad.push(rel + ": missing");
    else if (sha256(file) !== want) bad.push(rel + ": SHA-256 differs");
  };
  for (const [rel, want] of Object.entries(source.files)) {
    if (rel.startsWith("test_wavs/")) continue;
    if (rel.startsWith("models/") && !models) continue;
    check(rel, want);
  }
  check(manifest.engine.vad.file, manifest.engine.vad.sha256);
  if (!Object.keys(source.files).some((rel) => rel.startsWith("engine/node_modules/sherpa-onnx-node/"))) bad.push("engine: missing");
  if (models) for (const key of ["asr", "punct"]) for (const [name, f] of Object.entries(manifest.models[key].files)) check(`models/${key}/${name}`, f.sha256);
  return { ok: !bad.length, bad, platform: source.platform, models: source.models };
}

if (require.main === module) main().catch((e) => { console.error("fetch-asr: " + e.message); process.exitCode = 1; });
module.exports = { verify, MANIFEST, VENDOR };
