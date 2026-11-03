/* Fetch the on-device transcription files MontClip bundles into vendor/transcribe/ (owner, 2026-11-03: transcription
   works offline, straight from the unzipped package; nothing is fetched at run time).

   node desktop/fetch-transcribe.cjs [--models base,small] [--force] [--pin]

   One source of truth: desktop/transcribe-manifest.json — the transformers.js and onnxruntime-web npm tarballs (pinned
   version, URL and integrity) and the Whisper model files (pinned Hugging Face revision, size and SHA-256). Every file
   placed in vendor/transcribe/ is checked against its SHA-256; a mismatch fails and nothing is kept. Packaging copies this
   checked folder into <resources>/transcribe; it never downloads. --pin (maintainers only) records the SHA-256 of files
   the manifest does not pin yet, after checking the npm integrity / the Hugging Face LFS hash they come with.

   vendor/transcribe/
     transformers/transformers.min.js
     ort/ort-wasm-simd-threaded.jsep.{mjs,wasm}
     models/onnx-community/whisper-<name>_timestamped/{config.json, …, onnx/*_quantized.onnx}
     SOURCE.json   — what was installed, with every file's SHA-256 */
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { download, sha256 } = require("./fetch-ffmpeg.cjs");

const ROOT = path.join(__dirname, "..");
const MANIFEST = path.join(__dirname, "transcribe-manifest.json");
const VENDOR = path.join(ROOT, "vendor", "transcribe");

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const integrityOk = (file, integrity) => {
  const [alg, b64] = integrity.split("-");
  return crypto.createHash(alg).update(fs.readFileSync(file)).digest("base64") === b64;
};

/** The files of one package, out of its npm tarball: [{from: path in the tarball, to: path under vendor/transcribe}] */
async function fromTarball(pkg, work) {
  const tgz = path.join(work, pkg.name.replace(/[@/]/g, "_") + ".tgz");
  await download(pkg.tarball, tgz);
  if (!integrityOk(tgz, pkg.integrity)) throw new Error(pkg.name + ": the tarball does not match its pinned integrity");
  const dir = path.join(work, pkg.name.replace(/[@/]/g, "_")); fs.mkdirSync(dir);
  execFileSync(process.platform === "win32" ? path.join(process.env.SystemRoot, "System32", "tar.exe") : "tar", ["-xzf", tgz, "-C", dir]);
  return Object.keys(pkg.files).map((rel) => ({ rel, src: path.join(dir, "package", pkg.files[rel].from) }));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const models = (arg("--models") || Object.keys(manifest.models).join(",")).split(",").filter(Boolean);
  for (const m of models) if (!manifest.models[m]) throw new Error("unknown model " + m);
  const pin = process.argv.includes("--pin");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-transcribe-"));
  const stage = path.join(work, "stage");
  const installed = {};
  try {
    const place = (rel, src, want) => {
      const got = sha256(src);
      if (want && got !== want) throw new Error(rel + ": SHA-256 " + got + " is not the pinned " + want);
      if (!want && !pin) throw new Error(rel + ": no SHA-256 pinned in transcribe-manifest.json (run with --pin to record it)");
      const to = path.join(stage, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(src, to);
      installed[rel] = got;
      return got;
    };
    for (const key of ["transformers", "ort"]) {
      const pkg = manifest[key];
      for (const f of await fromTarball(pkg, work)) {
        const got = place(f.rel, f.src, pkg.files[f.rel].sha256);
        if (pin) pkg.files[f.rel].sha256 = got;
      }
    }
    for (const name of models) {
      const m = manifest.models[name];
      for (const [file, info] of Object.entries(m.files)) {
        const rel = path.posix.join("models", m.repo, file), tmp = path.join(work, "dl-" + crypto.randomBytes(6).toString("hex"));
        await download(`https://huggingface.co/${m.repo}/resolve/${m.revision}/${file}`, tmp);
        if (fs.statSync(tmp).size !== info.size) throw new Error(rel + ": " + fs.statSync(tmp).size + " bytes, the manifest says " + info.size);
        if (info.lfsSha256 && sha256(tmp) !== info.lfsSha256) throw new Error(rel + ": does not match its Hugging Face LFS hash");
        const got = place(rel, tmp, info.sha256);
        if (pin) info.sha256 = got;
        fs.rmSync(tmp, { force: true });
      }
    }
    fs.writeFileSync(path.join(stage, "SOURCE.json"), JSON.stringify({ manifestSha256: sha256(MANIFEST), models, files: installed }, null, 2) + "\n");
    fs.rmSync(VENDOR, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(VENDOR), { recursive: true });
    fs.cpSync(stage, VENDOR, { recursive: true });
    if (pin) {
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
      const source = JSON.parse(fs.readFileSync(path.join(VENDOR, "SOURCE.json"), "utf8"));
      source.manifestSha256 = sha256(MANIFEST);
      fs.writeFileSync(path.join(VENDOR, "SOURCE.json"), JSON.stringify(source, null, 2) + "\n");
    }
    const bytes = Object.keys(installed).reduce((n, rel) => n + fs.statSync(path.join(VENDOR, rel)).size, 0);
    process.stdout.write("TRANSCRIBE_ASSETS " + JSON.stringify({ models, files: Object.keys(installed).length, bytes }) + "\n");
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

/** Every installed file still matches SOURCE.json and the manifest (packaging and the tests call this). */
function verify(dir = VENDOR) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const source = JSON.parse(fs.readFileSync(path.join(dir, "SOURCE.json"), "utf8"));
  const pinned = {};
  for (const key of ["transformers", "ort"]) for (const [rel, f] of Object.entries(manifest[key].files)) pinned[rel] = f.sha256;
  for (const name of source.models) for (const [file, f] of Object.entries(manifest.models[name].files)) pinned[path.posix.join("models", manifest.models[name].repo, file)] = f.sha256;
  const bad = [];
  for (const [rel, want] of Object.entries(pinned)) {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) bad.push(rel + ": missing");
    else if (sha256(file) !== want) bad.push(rel + ": SHA-256 differs from the manifest");
    else if (source.files[rel] !== want) bad.push(rel + ": SHA-256 differs from SOURCE.json");
  }
  return { ok: !bad.length, bad, models: source.models };
}

if (require.main === module) main().catch((e) => { console.error("fetch-transcribe: " + e.message); process.exitCode = 1; });
module.exports = { verify, MANIFEST, VENDOR };
