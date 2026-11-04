/* Optional speech models (Deja, 2026-11-04; ADR 2026-11-04 SenseVoice §6 「可选模型的分发与同意」). The first one is Meta's
   Omnilingual ASR (CTC, int8, via sherpa-onnx's `omnilingual`): an extra choice next to the default Paraformer zh,
   which stays the default and is never touched here (asr-models.js, asr-local.js). Evaluation and reasons:
   docs/validation/2026-11-04-omnilingual-asr/README.md.

   An optional model is never in the package. It is used only when all of these hold:
     - the streamer read its licence in the host's own box and said yes, then chose the site to download from;
     - every file was downloaded into a staging folder, matched its pinned size and SHA-256, and the whole folder was
       then renamed into place in one step (a half-downloaded model is never where the engine looks);
     - a consent record is on this computer: {model, revision, licenseSha256, agreedAt, montclipVersion} (no upload, no
       log), and its revision and licence hash are the ones this build pins.
   Revoking = the model's folder, its staging folder and its consent record are deleted; transcription goes back to the
   default engine. One optional model at a time: choosing another one revokes the first once the new one is in place.
   Nothing here downloads until select() has had both answers; there is no "agree" parameter anywhere.

   desktop/asr-optional-manifest.json pins every file (size, SHA-256), the revision of each source (never a branch),
   the hosts (https only, exact names; a redirect to any other host is not followed — asr-download.js), and the
   licence text MontClip ships (licenses/asr/…, with its SHA-256).

   createOptional({manifest, userDir, root, version, freeBytes, extract}) → {
     list()               → [{id, name, …, installed, consented, ready, missing, bad}]
     status(id) · active() (the ready model chosen last, else null) · dir(id) (its folder when ready, else null)
     licenseText(id)      → the licence text shipped with MontClip, checked against its pinned SHA-256
     select(id, {ask, fetchFile, signal, onProgress})  → {ok, source} | {ok:false, declined|code, error}
                             ask.license({id, name, text}) → true to agree; ask.source({id, name, mb, sites}) → index or null
     download(id, {source, fetchFile, signal, onProgress}) · consent(id) · revoke(id)
   } */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const { allowedUrl, sha256 } = require("./asr-models");

const MANIFEST_FILE = path.join(__dirname, "desktop", "asr-optional-manifest.json");
const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));

const HEX40 = /^[0-9a-f]{40}$/, HEX64 = /^[0-9a-f]{64}$/, ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
/** Only plain data: model weights and token lists. Never pickle, never .bin, never anything that runs. */
/** (and the model repo's LICENSE, which is downloaded with it: the same bytes MontClip ships as the licence text) */
const DATA_FILE = /^(LICENSE|[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(onnx|txt))$/;
const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/** The manifest's rules, checked (the tests run this on the shipped manifest; the store refuses a model that fails). */
function checkModel(id, model, hosts) {
  const bad = (why) => { throw err("ASR_OPTIONAL_MANIFEST", `optional model ${id}: ${why}`); };
  if (!ID.test(id)) bad("bad id");
  if (!model || typeof model !== "object") bad("not an object");
  if (model.engine !== "omnilingual") bad("unknown engine " + model.engine);
  if (!HEX40.test(String(model.revision))) bad("the revision must be a commit (40 hex), not a branch");
  const names = Object.keys(model.files || {});
  if (!names.length) bad("no files");
  for (const n of names) {
    if (!DATA_FILE.test(n) || n.includes("..")) bad("not a plain data file name: " + n);
    const f = model.files[n];
    if (!(Number.isSafeInteger(f.size) && f.size > 0) || !HEX64.test(String(f.sha256))) bad("size / sha256 of " + n);
  }
  if (!model.files["model.int8.onnx"] || !model.files["tokens.txt"]) bad("needs model.int8.onnx and tokens.txt");
  if (!model.license || !/^licenses\/asr\/[A-Za-z0-9._-]+\.txt$/.test(String(model.license.file)) || !HEX64.test(String(model.license.sha256))) bad("licence file / sha256");
  if (!Array.isArray(model.sources) || !model.sources.length) bad("no sources");
  for (const s of model.sources) {
    if (s.kind === "files") {
      if (!allowedUrl(s.base, hosts) || !String(s.base).endsWith("/")) bad("source not on a listed https host: " + s.base);
      if (!String(s.base).includes("/" + model.revision + "/")) bad("source not pinned to the revision: " + s.base);
    } else if (s.kind === "archive") {
      if (!allowedUrl(s.url, hosts)) bad("source not on a listed https host: " + s.url);
      if (!(Number.isSafeInteger(s.size) && s.size > 0) || !HEX64.test(String(s.sha256))) bad("archive size / sha256");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/$/.test(String(s.dir || ""))) bad("archive dir");
    } else bad("unknown source kind " + s.kind);
  }
  return model;
}
function checkManifest(m) {
  if (!Array.isArray(m.hosts) || !m.hosts.length) throw err("ASR_OPTIONAL_MANIFEST", "no hosts");
  for (const [id, model] of Object.entries(m.models || {})) checkModel(id, model, m.hosts);
  return m;
}

/** Free bytes on the disk that holds `dir` (or the nearest folder above it that exists), null when it cannot be told. */
function diskFree(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { const st = fs.statfsSync(d); return st.bavail * st.bsize; } catch { }
    if (path.dirname(d) === d) return null;
  }
}
const tarBin = () => (process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar");
/** The entries of a .tar.bz2 (names only). */
function listArchive(archive) {
  return new Promise((resolve, reject) => execFile(tarBin(), ["-tjf", archive], { windowsHide: true, timeout: 600000, maxBuffer: 16 << 20 },
    (e, out) => (e ? reject(err("ASR_CHECK_FAILED", "could not read " + path.basename(archive) + ": " + e.message)) : resolve(String(out).split(/\r?\n/).filter(Boolean)))));
}
/** An archive entry that would land outside the folder it is unpacked into. */
const escapes = (name) => /^([\\/]|[A-Za-z]:)/.test(name) || name.split(/[\\/]+/).includes("..");
/** Unpack only `members` of an archive into `into` — after checking that no entry in it leaves the folder. */
async function safeExtract(archive, into, members) {
  const names = await listArchive(archive);
  const evil = names.find(escapes);
  if (evil) throw err("ASR_CHECK_FAILED", "the archive has an entry outside its folder (" + evil.slice(0, 80) + "); nothing was unpacked");
  for (const m of members) if (!names.includes(m)) throw err("ASR_CHECK_FAILED", "the archive has no " + m);
  return new Promise((resolve, reject) => execFile(tarBin(), ["-xjf", archive, "-C", into, ...members], { windowsHide: true, timeout: 600000 },
    (e) => (e ? reject(err("ASR_CHECK_FAILED", "could not unpack " + path.basename(archive) + ": " + e.message)) : resolve())));
}

function createOptional({ manifest: m = manifest, userDir, root = __dirname, version = null, freeBytes = diskFree, extract = safeExtract, now = () => new Date() } = {}) {
  checkManifest(m);
  if (!version) { try { version = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version; } catch { version = "?"; } }
  const base = () => { if (!userDir) throw err("ASR_OPTIONAL_NO_FOLDER", "no folder to keep models in"); return path.join(path.resolve(userDir), "optional"); };
  const modelDir = (id) => path.join(base(), id);
  const stagingDir = (id) => path.join(base(), ".staging-" + id);
  const consentFile = (id) => path.join(base(), ".consent", id + ".json");
  const model = (id) => { const x = Object.prototype.hasOwnProperty.call(m.models, id) ? m.models[id] : null; if (!x) throw err("ASR_OPTIONAL_UNKNOWN", "unknown optional model " + id); return x; };

  /** The licence text MontClip ships for this model; refused when it is not the pinned text. */
  function licenseText(id) {
    const lic = model(id).license, file = path.join(root, ...lic.file.split("/"));
    let bytes;
    try { bytes = fs.readFileSync(file); } catch { throw err("ASR_OPTIONAL_LICENSE", "the licence text is missing from this copy of MontClip: " + lic.file); }
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== lic.sha256) throw err("ASR_OPTIONAL_LICENSE", "the licence text in this copy of MontClip was changed: " + lic.file);
    return bytes.toString("utf8");
  }

  // a file is hashed once per version (size + mtime), as asr-models.js does; a file changed within 2 s is hashed again
  const known = new Map(), RACY_MS = 2000;
  const hashOf = (file, st) => {
    const k = known.get(file);
    if (k && k.size === st.size && k.mtimeMs === st.mtimeMs && k.at - st.mtimeMs > RACY_MS) return k.sha;
    const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
    try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
    const sha = h.digest("hex");
    known.set(file, { size: st.size, mtimeMs: st.mtimeMs, at: Date.now(), sha });
    return sha;
  };
  function files(id) {
    const missing = [], bad = [];
    for (const [name, f] of Object.entries(model(id).files)) {
      const file = path.join(modelDir(id), name);
      let st = null;
      try { st = fs.statSync(file); } catch { }
      if (!st || !st.isFile()) missing.push(name);
      else if (st.size !== f.size || hashOf(file, st) !== f.sha256) bad.push(name);
    }
    return { missing, bad };
  }
  /** The consent record, if it is one for this model at the pinned revision and licence text; else null. */
  function consentOf(id) {
    let j;
    try { j = JSON.parse(fs.readFileSync(consentFile(id), "utf8")); } catch { return null; }
    const x = model(id);
    if (!j || j.model !== id || j.revision !== x.revision || j.licenseSha256 !== x.license.sha256 || typeof j.agreedAt !== "string") return null;
    return j;
  }
  function status(id) {
    const x = model(id), f = userDir ? files(id) : { missing: Object.keys(x.files), bad: [] }, c = userDir ? consentOf(id) : null;
    const installed = !f.missing.length && !f.bad.length;
    return { id, name: x.name, family: x.family, params: x.params, mb: mbOf(x), ramMB: x.ramMB || null, languages: x.languages, recommend: x.recommend,
      license: x.license.name, revision: x.revision, installed, consented: !!c, agreedAt: c ? c.agreedAt : null, ready: installed && !!c, missing: f.missing, bad: f.bad };
  }
  const list = () => Object.keys(m.models).map(status);
  /** The optional model in use: ready (agreed and every file right), the one agreed to last. */
  function active() {
    const ready = list().filter((s) => s.ready).sort((a, b) => String(b.agreedAt).localeCompare(String(a.agreedAt)));
    return ready.length ? ready[0].id : null;
  }
  const dir = (id) => (status(id).ready ? modelDir(id) : null);

  /** Write the consent record (atomically). Only select() calls this, after both answers and a checked download. */
  function consent(id) {
    const x = model(id);
    licenseText(id);   // the text the streamer agreed to is the pinned one
    const rec = { model: id, revision: x.revision, licenseSha256: x.license.sha256, agreedAt: now().toISOString(), montclipVersion: version };
    const file = consentFile(id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    try { fs.writeFileSync(tmp, JSON.stringify(rec), { flag: "wx" }); fs.renameSync(tmp, file); } finally { fs.rmSync(tmp, { force: true }); }
    return rec;
  }
  /** Revoke: the model, anything half-downloaded and the consent record go; the default engine is used again. */
  function revoke(id) {
    model(id);
    for (const p of [consentFile(id), modelDir(id), stagingDir(id)]) fs.rmSync(p, { recursive: true, force: true });
    for (const n of safeReaddir(base())) if (n.startsWith(".old-" + id + "-")) fs.rmSync(path.join(base(), n), { recursive: true, force: true });
    known.clear();
    return { ok: true, revoked: id, active: active() };
  }
  const safeReaddir = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
  const sizeOf = (file) => { try { return fs.statSync(file).size; } catch { return 0; } };
  async function verify(file, size, sha, what) {
    if (sizeOf(file) !== size || (await sha256(file)) !== sha) {
      fs.rmSync(file, { force: true });
      throw err("ASR_CHECK_FAILED", what + " does not match its pinned SHA-256; it was deleted");
    }
  }

  /** Download one source into the staging folder, check every file, then rename the folder into place in one step. */
  async function download(id, { source = 0, fetchFile, signal, onProgress = () => {} } = {}) {
    const x = model(id), s = x.sources[source];
    if (!s) throw err("ASR_OPTIONAL_UNKNOWN", "no such source");
    if (typeof fetchFile !== "function") throw err("ASR_OPTIONAL_NO_FETCH", "no downloader");
    const host = new URL(s.base || s.url).hostname, stage = stagingDir(id);
    const total = Object.values(x.files).reduce((n, f) => n + f.size, 0) + (s.kind === "archive" ? s.size : 0);
    const need = Math.max(0, total - safeReaddir(stage).reduce((n, f) => n + sizeOf(path.join(stage, f)), 0)) + 16 * 1048576;
    const free = freeBytes(base());
    if (free != null && free < need) throw err("ASR_NO_SPACE", `not enough room: about ${Math.round(need / 1048576)} MB needed, ${Math.round(free / 1048576)} MB free`, { needBytes: need, freeBytes: free });
    fs.mkdirSync(stage, { recursive: true });
    const cancelled = () => err("ASR_DOWNLOAD_CANCELLED", "cancelled");
    const get = async (url, dest, label, size) => {
      if (!allowedUrl(url, m.hosts)) throw err("ASR_HOST_REFUSED", "not a listed host: " + host);
      if (signal && signal.aborted) throw cancelled();
      if (sizeOf(dest) < size) await fetchFile(url, dest, { hosts: m.hosts, signal, onProgress: (n) => onProgress({ host, file: label, loaded: n, total: size }) });
    };
    try {
      if (s.kind === "files") {
        for (const [name, f] of Object.entries(x.files)) {
          const part = path.join(stage, name + ".part");
          await get(s.base + name, part, name, f.size);
          await verify(part, f.size, f.sha256, name + " from " + host);
          fs.renameSync(part, path.join(stage, name));
        }
      } else {
        const part = path.join(stage, ".archive.part"), label = path.basename(new URL(s.url).pathname);
        await get(s.url, part, label, s.size);
        await verify(part, s.size, s.sha256, label + " from " + host);
        const work = fs.mkdtempSync(path.join(base(), ".unpack-"));
        try {
          await extract(part, work, Object.keys(x.files).map((n) => s.dir + n));
          for (const [name, f] of Object.entries(x.files)) {
            const from = path.join(work, ...s.dir.split("/").filter(Boolean), name);
            await verify(from, f.size, f.sha256, name + " in " + label);
            fs.renameSync(from, path.join(stage, name));
          }
        } finally { fs.rmSync(work, { recursive: true, force: true }); }
        fs.rmSync(part, { force: true });
      }
      // every file is in the staging folder and matches: check once more, then one rename puts the model in place
      for (const [name, f] of Object.entries(x.files)) await verify(path.join(stage, name), f.size, f.sha256, name);
      const to = modelDir(id), old = path.join(base(), ".old-" + id + "-" + crypto.randomBytes(4).toString("hex"));
      if (fs.existsSync(to)) fs.renameSync(to, old);
      fs.renameSync(stage, to);
      fs.rmSync(old, { recursive: true, force: true });
      known.clear();
      return { source: host };
    } catch (e) {
      if ((signal && signal.aborted) || e.code === "ASR_DOWNLOAD_CANCELLED") throw cancelled();
      throw Object.assign(e, { code: e.code || "ASR_DOWNLOAD_INTERRUPTED", source: host });
    }
  }

  /** The streamer picks this model: licence (agree?) → site (which one?) → download, check, move → consent record.
   *  No answer, or "no", at either question: revoked (back to the default engine), and nothing was requested. */
  async function select(id, { ask, fetchFile, signal, onProgress } = {}) {
    const x = model(id);
    const text = licenseText(id);
    if (!ask || typeof ask.license !== "function" || typeof ask.source !== "function") throw err("ASR_OPTIONAL_NO_ASK", "only the streamer can agree, in the host's own box");
    if ((await ask.license({ id, name: x.name, licenseName: x.license.name, text })) !== true) { revoke(id); return { ok: false, declined: "license" }; }
    const sites = x.sources.map((s) => new URL(s.base || s.url).hostname);
    const pick = await ask.source({ id, name: x.name, mb: mbOf(x), sites, hosts: m.hosts.slice() });
    if (!(Number.isInteger(pick) && pick >= 0 && pick < sites.length)) { revoke(id); return { ok: false, declined: "download" }; }
    try {
      const r = await download(id, { source: pick, fetchFile, signal, onProgress });
      consent(id);
      // one optional model at a time: the one used before is revoked (its files and record go) once this one is in place
      const replaced = Object.keys(m.models).filter((k) => k !== id && (fs.existsSync(modelDir(k)) || fs.existsSync(consentFile(k))));
      for (const k of replaced) revoke(k);
      return { ok: true, source: r.source, active: active(), replaced };
    } catch (e) {
      // 〔取消〕 while downloading: revoked; a dropped connection keeps what came, for the next try from the same site
      if (e.code === "ASR_DOWNLOAD_CANCELLED") { revoke(id); return { ok: false, declined: "cancelled" }; }
      return { ok: false, code: e.code || "ASR_DOWNLOAD_FAILED", error: String(e.message || e), needBytes: e.needBytes, freeBytes: e.freeBytes };
    }
  }

  return { list, status, active, dir, licenseText, consent, revoke, download, select, manifest: m };
}
/** The size to tell the streamer: the files, MiB, to the nearest 10. */
const mbOf = (x) => Math.round(Object.values(x.files).reduce((n, f) => n + f.size, 0) / 1048576 / 10) * 10;

module.exports = { manifest, createOptional, checkManifest, checkModel, safeExtract, escapes, DATA_FILE };
