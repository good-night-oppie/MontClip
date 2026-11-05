/* Consent for an optional speech model (Deja, 2026-11-04; ADR 2026-11-04 #122 §6 「可选模型的分发与同意」). The first
   one is Meta's Omnilingual ASR (`asrMeta` in desktop/asr-manifest.json); Paraformer (`asr`) and the punctuation model
   need none and are untouched.

   A model whose manifest entry has `consent` is used only when this computer holds a consent record for it:
     <models folder>/consent/<key>.json = {model, revision, licenseSha256, agreedAt, montclipVersion}
   written by the desktop host after the streamer read the licence text (shipped with MontClip, checked against its
   SHA-256) in the host's own box, said yes, and the model's files were checked. No upload, no log. A record for another
   revision or licence text does not count. Files that are here without a record (a USB import) are not used either.
   Revoking deletes the model's files, what was half-downloaded of them, and the record: back to the default model.

   choose(key, {ask, installed, download, version}) is the order the host follows, so it can be tested: the licence, then
   (only when the files are not here yet) the site, then one more box naming the address chosen, then the download — nothing is requested before both answers — then
   the record. No answer or "no" at any step: revoked. There is no "agree" argument anywhere. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { manifest } = require("./asr-models");

const err = (code, message, extra) => Object.assign(new Error(message), { code }, extra);
/** The manifest entry's consent terms, or null when the model needs no consent. */
const termsOf = (key, m = manifest) => (m.models[key] && m.models[key].consent) || null;

function createConsent({ modelsDir, root = __dirname, manifest: m = manifest, now = () => new Date() } = {}) {
  const fileOf = (key) => path.join(path.resolve(modelsDir), "consent", key + ".json");
  const terms = (key) => { const t = termsOf(key, m); if (!t) throw err("ASR_NO_CONSENT_NEEDED", key + " needs no consent"); return t; };

  /** The licence text MontClip ships for this model, refused when it is not the pinned text. */
  function licenseText(key) {
    const lic = terms(key).license, file = path.join(root, ...lic.file.split("/"));
    let bytes;
    try { bytes = fs.readFileSync(file); } catch { throw err("ASR_LICENSE_MISSING", "the licence text is missing from this copy of MontClip: " + lic.file); }
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== lic.sha256) throw err("ASR_LICENSE_MISSING", "the licence text in this copy of MontClip was changed: " + lic.file);
    return bytes.toString("utf8");
  }
  /** The record, when it is one for this model at the pinned revision and licence text; else null. */
  function record(key) {
    const t = termsOf(key, m);
    if (!t) return null;
    let j;
    try { j = JSON.parse(fs.readFileSync(fileOf(key), "utf8")); } catch { return null; }
    return j && j.model === m.models[key].id && j.revision === t.revision && j.licenseSha256 === t.license.sha256 && typeof j.agreedAt === "string" ? j : null;
  }
  /** true when the model needs no consent, or this computer holds a valid record for it. */
  const allowed = (key) => !termsOf(key, m) || !!record(key);
  /** Write the record (atomically). Only choose() calls this, after the licence and a checked model. */
  function agree(key, version) {
    licenseText(key);
    const t = terms(key);
    const rec = { model: m.models[key].id, revision: t.revision, licenseSha256: t.license.sha256, agreedAt: now().toISOString(), montclipVersion: String(version || "?") };
    const file = fileOf(key), tmp = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.writeFileSync(tmp, JSON.stringify(rec), { flag: "wx" }); fs.renameSync(tmp, file); } finally { fs.rmSync(tmp, { force: true }); }
    return rec;
  }
  /** Revoke: the model's files (in the user's folder only), its half-downloaded parts and the record go. */
  function revoke(key) {
    terms(key);
    const dir = path.resolve(modelsDir), model = m.models[key];
    fs.rmSync(fileOf(key), { force: true });
    fs.rmSync(path.join(dir, key), { recursive: true, force: true });
    const shas = [...Object.values(model.files).map((f) => f.sha256), ...(model.sources || []).filter((s) => s.sha256).map((s) => s.sha256)];
    for (const sha of shas) fs.rmSync(path.join(dir, ".partial", sha + ".part"), { force: true });
    return { ok: true, revoked: key };
  }

  /** What revoke() would delete, in bytes: the model's folder (in the user's folder only) and its half-downloaded parts. */
  function size(key) {
    terms(key);
    const dir = path.resolve(modelsDir), model = m.models[key];
    const sum = (p) => { let st; try { st = fs.lstatSync(p); } catch { return 0; } if (!st.isDirectory()) return st.isFile() ? st.size : 0; let names; try { names = fs.readdirSync(p); } catch { return 0; } return names.reduce((n, f) => n + sum(path.join(p, f)), 0); };
    const shas = [...Object.values(model.files).map((f) => f.sha256), ...(model.sources || []).filter((s) => s.sha256).map((s) => s.sha256)];
    return sum(path.join(dir, key)) + shas.reduce((n, sha) => n + sum(path.join(dir, ".partial", sha + ".part")), 0);
  }

  /** The streamer chooses the model: licence → (site → download, when the files are not here) → record. */
  async function choose(key, { ask, installed, download, version } = {}) {
    const t = terms(key), model = m.models[key];
    if (!ask || typeof ask.license !== "function" || typeof ask.source !== "function" || typeof ask.confirm !== "function") throw err("ASR_CONSENT_NO_ASK", "only the streamer can agree, in the host's own box");
    const text = licenseText(key);
    if ((await ask.license({ key, name: model.name, licenseName: t.license.name, text })) !== true) { revoke(key); return { ok: false, declined: "license" }; }
    if (!(installed && installed())) {
      const sites = (model.sources || []).map((s) => new URL(s.base || s.url).hostname);
      const pick = await ask.source({ key, sites });
      if (!(Number.isInteger(pick) && pick >= 0 && pick < sites.length)) { revoke(key); return { ok: false, declined: "download" }; }
      // the rule for anything sent out (Deja 11-04): the last box before the request names the address chosen this time
      const s = model.sources[pick], size = s.size || Object.values(model.files).reduce((n, f) => n + f.size, 0);
      if ((await ask.confirm({ key, site: sites[pick], url: s.base || s.url, mb: Math.round(size / 1048576 / 10) * 10 })) !== true) { revoke(key); return { ok: false, declined: "download" }; }
      try { await download(pick); }
      catch (e) {
        if (e.code === "ASR_DOWNLOAD_CANCELLED") { revoke(key); return { ok: false, declined: "cancelled" }; }
        // site: which one failed, so the page can suggest the other one (hf-mirror passes a US connection on to a host
        // that is not listed, Deja 11-04)
        return { ok: false, code: e.code || "ASR_DOWNLOAD_FAILED", error: String(e.message || e), needBytes: e.needBytes, freeBytes: e.freeBytes, drive: e.drive, failed: e.failed, site: sites[pick] };
      }
      if (!(installed && installed())) return { ok: false, code: "ASR_CHECK_FAILED", error: "the model's files are not all there after the download" };
    }
    agree(key, version);
    return { ok: true };
  }

  return { licenseText, record, allowed, agree, revoke, size, choose };
}

module.exports = { createConsent, termsOf };
