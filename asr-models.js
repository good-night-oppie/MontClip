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
/** Unpack an archive into a folder: only `members` when given (the model's own files, which is what the room check counts). */
function systemExtract(archive, into, members = []) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  return new Promise((resolve, reject) => execFile(tar, ["-xjf", archive, "-C", into, ...members], { windowsHide: true, timeout: 600000 },
    (err) => (err ? reject(new Error("could not unpack " + path.basename(archive) + ": " + err.message)) : resolve())));
}

/** Free bytes on the disk that holds `dir` (or the nearest folder above it that exists), null when it cannot be told. */
function diskFree(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    try { const st = fs.statfsSync(d); return st.bavail * st.bsize; } catch { }
    if (path.dirname(d) === d) return null;
  }
}
/** "C" for a folder on C:, else the folder's root. */
const driveOf = (dir) => { const r = path.parse(path.resolve(dir)).root; return /^[A-Za-z]:/.test(r) ? r[0].toUpperCase() : r; };

function createStore({ manifest: m = manifest, roots = [], userDir, extract = systemExtract, freeBytes = diskFree } = {}) {
  // file path → {size, mtimeMs, at, sha}: a file is hashed once per version. A version is only trusted when the file had
  // not changed for RACY_MS before it was hashed (git's "racy" rule): a rewrite inside the same clock tick keeps size and
  // mtime, so a file that was still fresh is hashed again rather than given its old result.
  const RACY_MS = 2000, known = new Map();
  const hashOf = (file, st) => {
    const k = known.get(file);
    if (k && k.size === st.size && k.mtimeMs === st.mtimeMs && k.at - st.mtimeMs > RACY_MS) return k.sha;
    const at = Date.now(), sha = sha256Sync(file);
    known.set(file, { size: st.size, mtimeMs: st.mtimeMs, at, sha });
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
      for (const s of model.sources || []) if (s.kind === "archive") (bySize.get(s.size) || bySize.set(s.size, []).get(s.size)).push({ type: "archive", key, sha256: s.sha256, source: s });
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
          await extract(file, work, membersOf(m.models[hit.key], hit.source));
          const inner = await importPaths([work]);
          res.imported.push(...inner.imported); res.already += inner.already; res.rejected += inner.rejected;
        } finally { fs.rmSync(work, { recursive: true, force: true }); }
      }
    }
    res.models = status();
    return res;
  }

  /* Downloads resume (Deja, 2026-11-03): each file (or archive) is fetched into userDir/.partial/<its pinned SHA-256>.part,
     which stays when the connection drops, so the next attempt asks only for the rest. Once whole it is checked; a part
     that does not match is deleted (ASR_CHECK_FAILED), one that matches is renamed into place. */
  const partDir = () => path.join(userDir, ".partial");
  const partOf = (sha) => path.join(partDir(), sha + ".part");
  const sizeOf = (file) => { try { return fs.statSync(file).size; } catch { return 0; } };
  const dropEmptyPartDir = () => { try { if (!fs.readdirSync(partDir()).length) fs.rmdirSync(partDir()); } catch { } };
  async function finished(part, size, sha, what) {
    if (sizeOf(part) !== size || (await sha256(part)) !== sha) {
      fs.rmSync(part, { force: true });
      throw Object.assign(new Error(what + " does not match its SHA-256; it was deleted"), { code: "ASR_CHECK_FAILED" });
    }
  }
  async function moveIn(file, key, name, sha) {
    const to = path.join(userDir, key, name);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.rmSync(to, { force: true });
    fs.renameSync(file, to);
    known.delete(to);
    if ((await sha256(to)) !== sha) { fs.rmSync(to, { force: true }); throw Object.assign(new Error(name + " changed while it was moved into place"), { code: "ASR_CHECK_FAILED" }); }
  }
  /** The archive members that are this model's files: "<dir>/<name>" for each. */
  const membersOf = (model, s) => Object.keys(model.files).map((name) => (s.dir || "") + name);
  /** What a source still has to fetch, in bytes (parts already here count as fetched). */
  function remaining(model, s) {
    if (s.kind === "archive") return Math.max(0, s.size - sizeOf(partOf(s.sha256))) + Object.values(model.files).reduce((n, f) => n + f.size, 0);
    return Object.values(model.files).reduce((n, f) => n + Math.max(0, f.size - sizeOf(partOf(f.sha256))), 0);
  }

  async function download(key, opts = {}) {
    const { onProgress = () => {}, signal, hosts = m.hosts } = opts;
    const model = m.models[key];
    if (!model) throw new Error("unknown model " + key);
    if (!userDir) throw new Error("no folder to keep models in");
    fs.mkdirSync(partDir(), { recursive: true });
    const failed = [];
    const cancelled = () => Object.assign(new Error("cancelled"), { code: "ASR_DOWNLOAD_CANCELLED" });
    // a network error is tried once more, from where it stopped; a refused host or a cancel is not
    const fetchFile = async (url, dest, o) => {
      try { return await opts.fetchFile(url, dest, o); } catch (e) {
        if ((signal && signal.aborted) || e.code === "ASR_HOST_REFUSED" || e.code === "ASR_DOWNLOAD_CANCELLED") throw e;
        return opts.fetchFile(url, dest, o);
      }
    };
    // room for the source that needs the most — any of them may be the one used (hf-mirror is often passed on, then the
    // GitHub archive is) — counting an archive's download and its unpacked files, plus a margin (Deja, 11-03)
    const need = Math.max(0, ...(model.sources || []).map((s) => remaining(model, s))) + 16 * 1048576;
    const free = freeBytes(userDir);
    if (free != null && free < need)
      throw Object.assign(new Error(`not enough room on ${driveOf(userDir)}: about ${Math.round(need / 1048576)} MB needed, ${Math.round(free / 1048576)} MB free`),
        { code: "ASR_NO_SPACE", needBytes: need, freeBytes: free, drive: driveOf(userDir) });
    for (const s of model.sources || []) {
      const host = (() => { try { return new URL(s.base || s.url).hostname; } catch { return String(s.base || s.url); } })();
      try {
        if (s.kind === "files") {
          for (const [name, f] of Object.entries(model.files)) {
            const url = s.base + name;
            if (!allowedUrl(url, hosts)) throw Object.assign(new Error("not a listed host: " + host), { code: "ASR_HOST_REFUSED" });
            const part = partOf(f.sha256);
            if (sizeOf(part) < f.size) await fetchFile(url, part, { hosts, signal, onProgress: (n) => onProgress({ host, file: name, loaded: n, total: f.size }) });
            await finished(part, f.size, f.sha256, name + " from " + host);
          }
          for (const [name, f] of Object.entries(model.files)) await moveIn(partOf(f.sha256), key, name, f.sha256);
        } else if (s.kind === "archive") {
          if (!allowedUrl(s.url, hosts)) throw Object.assign(new Error("not a listed host: " + host), { code: "ASR_HOST_REFUSED" });
          const part = partOf(s.sha256), label = path.basename(new URL(s.url).pathname);
          if (sizeOf(part) < s.size) await fetchFile(s.url, part, { hosts, signal, onProgress: (n) => onProgress({ host, file: label, loaded: n, total: s.size }) });
          await finished(part, s.size, s.sha256, label + " from " + host);
          const work = fs.mkdtempSync(path.join(userDir, ".unpack-"));
          try {
            await extract(part, work, membersOf(model, s));
            for (const [name, f] of Object.entries(model.files)) await finished(path.join(work, s.dir || "", name), f.size, f.sha256, name + " in " + label);
            for (const [name, f] of Object.entries(model.files)) await moveIn(path.join(work, s.dir || "", name), key, name, f.sha256);
          } finally { fs.rmSync(work, { recursive: true, force: true }); }
          fs.rmSync(part, { force: true });
        } else throw new Error("unknown source kind " + s.kind);
        dropEmptyPartDir();
        return { source: host, failed };
      } catch (e) {
        if ((signal && signal.aborted) || e.code === "ASR_DOWNLOAD_CANCELLED") throw cancelled();
        failed.push({ source: host, code: e.code || "ASR_NETWORK", error: String((e && e.message) || e) });
      }
    }
    // what to tell the streamer: a file that failed its check was deleted (download again); otherwise the parts stay
    const code = failed.some((f) => f.code === "ASR_CHECK_FAILED") ? "ASR_CHECK_FAILED"
      : failed.some((f) => f.code === "ASR_NETWORK") ? "ASR_DOWNLOAD_INTERRUPTED" : "ASR_DOWNLOAD_FAILED";
    dropEmptyPartDir();
    throw Object.assign(new Error("the model could not be downloaded: " + failed.map((f) => f.source + ": " + f.error).join("; ")), { code, failed });
  }

  return { status, dir, importPaths, download };
}

module.exports = { manifest, allowedUrl, createStore, sha256, systemExtract };
