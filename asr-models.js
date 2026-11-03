/* The speech models on this computer (#70, Deja 2026-11-03; ADR 2026-11-03 local capability boundary, row 6).
   A model comes from the 完整版 package (a read-only root, found first), or is put in the user's folder by a download
   or by importing the streamer's own copy (a U 盘, a local file or folder). Every file is checked against the SHA-256
   and size in desktop/asr-manifest.json; a file that does not match is never used, never copied, never kept.

   createStore({manifest, roots, userDir, extract}) → {
     status()                 → {asr: {ready, where: "package"|"user"|null, missing, bad}, punct: {…}}
     dir(model)               → the folder that holds a ready model, else null
     importPaths(paths)       → {imported:[{model, file}], already, rejected, models}  (files and folders, ≤ 3 deep;
                                files are recognised by size + SHA-256, whatever their name; an archive is opened only
                                when its own SHA-256 is a pinned source)
     download(model, {fetchFile, onProgress, signal}) → {source, failed}   (the sources in order; the first that gives
                                every file right wins; fetchFile(url, dest, {onProgress, signal}) does the network)
   }
   allowedUrl(url, hosts) — https, one of the listed hosts exactly, no credentials, the default port. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "desktop", "asr-manifest.json"), "utf8"));

function allowedUrl(url, hosts = manifest.hosts) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && hosts.includes(u.hostname);
}

/** SHA-256 of a file, streamed. */
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file).on("error", reject).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex")));
  });
}
function sha256Sync(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}

/** The system tar (Windows 10+ ships bsdtar, which reads .tar.bz2) unpacks an archive into `into`. */
function systemExtract(archive, into) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  return new Promise((resolve, reject) => execFile(tar, ["-xjf", archive, "-C", into], { windowsHide: true, timeout: 600000 },
    (err) => (err ? reject(new Error("could not unpack " + path.basename(archive) + ": " + err.message)) : resolve())));
}

function createStore({ manifest: m = manifest, roots = [], userDir, extract = systemExtract } = {}) {
  const known = new Map();     // file path → {size, mtimeMs, sha}: a file is hashed once per version
  const hashOf = (file, st) => {
    const k = known.get(file);
    if (k && k.size === st.size && k.mtimeMs === st.mtimeMs) return k.sha;
    const sha = sha256Sync(file);
    known.set(file, { size: st.size, mtimeMs: st.mtimeMs, sha });
    return sha;
  };
  const check = (root, key) => {
    const model = m.models[key], missing = [], bad = [];
    for (const [name, f] of Object.entries(model.files)) {
      const file = path.join(root, key, name);
      let st = null;
      try { st = fs.statSync(file); } catch { }
      if (!st || !st.isFile()) missing.push(name);
      else if (st.size !== f.size || hashOf(file, st) !== f.sha256) bad.push(name);
    }
    return { missing, bad };
  };
  function status() {
    const out = {};
    for (const key of Object.keys(m.models)) {
      let res = null;
      for (const root of roots) { const c = check(root, key); if (!c.missing.length && !c.bad.length) { res = { ready: true, where: "package", missing: [], bad: [] }; break; } }
      if (!res && userDir) {
        const c = check(userDir, key);
        res = !c.missing.length && !c.bad.length ? { ready: true, where: "user", missing: [], bad: [] } : { ready: false, where: null, ...c };
      }
      out[key] = res || { ready: false, where: null, missing: Object.keys(m.models[key].files), bad: [] };
    }
    return out;
  }
  function dir(key) {
    for (const root of roots) { const c = check(root, key); if (!c.missing.length && !c.bad.length) return path.join(root, key); }
    if (userDir) { const c = check(userDir, key); if (!c.missing.length && !c.bad.length) return path.join(userDir, key); }
    return null;
  }

  // what a file of a given size could be: model files, and archives that are pinned sources
  const wanted = () => {
    const bySize = new Map();
    for (const [key, model] of Object.entries(m.models)) {
      for (const [name, f] of Object.entries(model.files)) (bySize.get(f.size) || bySize.set(f.size, []).get(f.size)).push({ type: "file", key, name, sha256: f.sha256 });
      for (const s of model.sources || []) if (s.kind === "archive") (bySize.get(s.size) || bySize.set(s.size, []).get(s.size)).push({ type: "archive", key, sha256: s.sha256 });
    }
    return bySize;
  };
  /** Copy a checked file into the user's folder: a temporary name, checked again, then renamed. */
  async function place(src, key, name, sha) {
    const to = path.join(userDir, key, name);
    try { if (fs.statSync(to).size === m.models[key].files[name].size && (await sha256(to)) === sha) return "already"; } catch { }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const tmp = to + "." + crypto.randomBytes(6).toString("hex") + ".part";
    try {
      await fs.promises.copyFile(src, tmp);
      if ((await sha256(tmp)) !== sha) throw new Error(name + " changed while it was being copied");
      fs.renameSync(tmp, to);
    } finally { fs.rmSync(tmp, { force: true }); }
    known.delete(to);
    return "imported";
  }
  function walk(p, depth, out) {
    let st;
    try { st = fs.statSync(p); } catch { return; }
    if (st.isFile()) { out.push({ file: p, size: st.size }); return; }
    if (!st.isDirectory() || depth > 3 || out.length > 2000) return;
    let names = [];
    try { names = fs.readdirSync(p); } catch { return; }
    for (const n of names) walk(path.join(p, n), depth + 1, out);
  }
  async function importPaths(paths) {
    if (!userDir) throw new Error("no folder to keep models in");
    const res = { imported: [], already: 0, rejected: 0 };
    const bySize = wanted(), files = [];
    for (const p of paths || []) walk(path.resolve(String(p)), 0, files);
    for (const { file, size } of files) {
      const options = bySize.get(size);
      if (!options) continue;
      const sha = await sha256(file);
      const hit = options.find((o) => o.sha256 === sha);
      if (!hit) { res.rejected++; continue; }
      if (hit.type === "file") {
        const r = await place(file, hit.key, hit.name, sha);
        if (r === "already") res.already++; else res.imported.push({ model: hit.key, file: hit.name });
      } else {
        const work = fs.mkdtempSync(path.join(userDir, ".unpack-"));
        try {
          await extract(file, work);
          const inner = await importPaths([work]);
          res.imported.push(...inner.imported); res.already += inner.already; res.rejected += inner.rejected;
        } finally { fs.rmSync(work, { recursive: true, force: true }); }
      }
    }
    res.models = status();
    return res;
  }

  async function download(key, opts = {}) {
    const { onProgress = () => {}, signal } = opts;
    const model = m.models[key];
    if (!model) throw new Error("unknown model " + key);
    if (!userDir) throw new Error("no folder to keep models in");
    fs.mkdirSync(userDir, { recursive: true });
    const failed = [];
    // a network error is tried once more (a 65 MB download once stalled for a minute and then went through); a file
    // with the wrong bytes, a refused host or a cancel is not
    const fetchFile = async (...args) => {
      try { return await opts.fetchFile(...args); } catch (e) {
        if ((signal && signal.aborted) || e.code === "ASR_HOST_REFUSED") throw e;
        return opts.fetchFile(...args);
      }
    };
    for (const s of model.sources || []) {
      const host = (() => { try { return new URL(s.base || s.url).hostname; } catch { return String(s.base || s.url); } })();
      const work = fs.mkdtempSync(path.join(userDir, ".download-"));
      try {
        if (s.kind === "files") {
          for (const [name, f] of Object.entries(model.files)) {
            const url = s.base + name;
            if (!allowedUrl(url, m.hosts)) throw Object.assign(new Error("not a listed host: " + host), { code: "ASR_HOST_REFUSED" });
            const tmp = path.join(work, name);
            await fetchFile(url, tmp, { onProgress: (n) => onProgress({ host, file: name, loaded: n, total: f.size }), signal });
            if (fs.statSync(tmp).size !== f.size || (await sha256(tmp)) !== f.sha256) throw new Error(name + " from " + host + " does not match its SHA-256");
          }
          for (const [name, f] of Object.entries(model.files)) await place(path.join(work, name), key, name, f.sha256);
        } else if (s.kind === "archive") {
          if (!allowedUrl(s.url, m.hosts)) throw Object.assign(new Error("not a listed host: " + host), { code: "ASR_HOST_REFUSED" });
          const tmp = path.join(work, path.basename(new URL(s.url).pathname));
          await fetchFile(s.url, tmp, { onProgress: (n) => onProgress({ host, file: path.basename(tmp), loaded: n, total: s.size }), signal });
          if (fs.statSync(tmp).size !== s.size || (await sha256(tmp)) !== s.sha256) throw new Error(path.basename(tmp) + " from " + host + " does not match its SHA-256");
          const into = path.join(work, "x"); fs.mkdirSync(into);
          await extract(tmp, into);
          for (const [name, f] of Object.entries(model.files)) {
            const file = path.join(into, s.dir || "", name);
            if (!fs.existsSync(file) || fs.statSync(file).size !== f.size || (await sha256(file)) !== f.sha256) throw new Error(name + " in the archive from " + host + " does not match its SHA-256");
          }
          for (const [name, f] of Object.entries(model.files)) await place(path.join(into, s.dir || "", name), key, name, f.sha256);
        } else throw new Error("unknown source kind " + s.kind);
        return { source: host, failed };
      } catch (e) {
        if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { code: "ASR_DOWNLOAD_CANCELLED" });
        failed.push({ source: host, error: String((e && e.message) || e) });
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
    }
    throw Object.assign(new Error("the model could not be downloaded: " + failed.map((f) => f.source + ": " + f.error).join("; ")), { code: "ASR_DOWNLOAD_FAILED", failed });
  }

  return { status, dir, importPaths, download };
}

module.exports = { manifest, allowedUrl, createStore, sha256, systemExtract };
