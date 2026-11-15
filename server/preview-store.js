"use strict";
/* #321 / #325 (QQ, Rea): quick samples live in previews/, and only what the exporter itself made there is ever removed.
   Ownership is a registry in that folder (.preview-registry.json, replaced atomically), not a file-name pattern:
   - "file": a finished sample, recorded with the size and modification time it had when it was written. It is removed
     only while both still match; a file that changed, or one this registry never saw, is left alone (and forgotten).
   - "work": a fablecut-* work folder or a .part file of a sample being written. Removed once it is older than workMs
     and no running export is using it (a crash leftover); one that is now the other kind of entry is left alone.
   prune() keeps the newest `keep` samples and none older than maxAgeMs. An unreadable registry counts as empty: then
   nothing is removed. */
const fs = require("fs");
const path = require("path");

const REGISTRY = ".preview-registry.json";
const NAME_RE = /^[^\\/]+$/;

function createPreviewStore(dir, { keep = 20, maxAgeMs = 24 * 3600 * 1000, workMs = 3600 * 1000, clock = Date.now, log = () => { } } = {}) {
  const regPath = path.join(dir, REGISTRY);
  const okName = (n) => typeof n === "string" && NAME_RE.test(n) && n !== "." && n !== ".." && n !== REGISTRY && n === path.basename(n);

  function read() {
    try {
      const j = JSON.parse(fs.readFileSync(regPath, "utf8"));
      if (j && j.v === 1 && j.entries && typeof j.entries === "object" && !Array.isArray(j.entries)) {
        const entries = {};
        for (const [n, e] of Object.entries(j.entries)) if (okName(n) && e && (e.kind === "file" || e.kind === "work")) entries[n] = e;
        return entries;
      }
    } catch { }
    return {};
  }
  function write(entries) {
    const tmp = path.join(dir, `${REGISTRY}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    try {
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, entries }));
      fs.renameSync(tmp, regPath);
    } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { } throw e; }
  }
  const say = (n, why) => { try { log(`removed ${n} (${why})`); } catch { } };   // QQ, #325: when something goes, the log says what and why
  function update(fn) { const entries = read(); fn(entries); write(entries); }

  return {
    REGISTRY,
    /** A work folder (fablecut-*) or .part file this exporter has just created in the folder. */
    addWork(name, type) {
      if (!okName(name)) throw new Error("not a name in previews/");
      update((e) => { e[name] = { kind: "work", type: type === "dir" ? "dir" : "file", at: clock() }; });
    },
    /** A finished sample: recorded with its size and mtime now, so a later change makes it no longer ours. */
    addFile(name, { replaces } = {}) {
      if (!okName(name)) throw new Error("not a name in previews/");
      const st = fs.statSync(path.join(dir, name));
      update((e) => {
        if (replaces && e[replaces] && e[replaces].kind === "work") delete e[replaces];
        e[name] = { kind: "file", size: st.size, mtimeMs: st.mtimeMs, at: clock() };
      });
    },
    /** Registers what a sample run has just made (its work folder and .part files). If the registry cannot be written, what was just made is removed
     *  again instead of being left in previews/ for good (QQ, #325); a name outside previews/ is refused and nothing is removed. */
    registerRun(dirName, parts = []) {
      const names = [dirName, ...parts.filter(Boolean)];
      if (!names.every(okName)) throw new Error("not a name in previews/");
      try { update((e) => { e[dirName] = { kind: "work", type: "dir", at: clock() }; for (const p of parts) if (p) e[p] = { kind: "work", type: "file", at: clock() }; }); }
      catch (err) {
        for (const n of names) { try { fs.rmSync(path.join(dir, n), { recursive: true, force: true }); say(n, "the registry could not be written"); } catch { } }
        throw new Error("the preview registry could not be written: " + (err && err.code || "error"));
      }
    },
    entries: read,
    /** live: names (work folders, .part files) a running export still uses. Returns the names removed. */
    prune({ now = clock(), live = new Set() } = {}) {
      const entries = read();
      const removed = [], samples = [];
      let changed = false;
      for (const [n, e] of Object.entries(entries)) {
        const p = path.join(dir, n);
        let st = null;
        try { st = fs.lstatSync(p); } catch { delete entries[n]; changed = true; continue; }
        if (e.kind === "work") {
          if (live.has(n)) continue;
          const sameKind = e.type === "dir" ? st.isDirectory() : st.isFile();
          if (!sameKind) { delete entries[n]; changed = true; continue; }
          if (now - e.at > workMs) {
            try { fs.rmSync(p, { recursive: e.type === "dir", force: true }); removed.push(n); say(n, `leftover work, older than ${Math.round(workMs / 60000)} min`); } catch { continue; }
            delete entries[n]; changed = true;
          }
          continue;
        }
        if (!st.isFile() || st.size !== e.size || st.mtimeMs !== e.mtimeMs) { delete entries[n]; changed = true; continue; }
        samples.push({ n, t: st.mtimeMs });
      }
      samples.sort((a, b) => b.t - a.t);
      samples.forEach((s, i) => {
        if (i < keep && now - s.t <= maxAgeMs) return;
        try { fs.rmSync(path.join(dir, s.n), { force: true }); removed.push(s.n); say(s.n, now - s.t > maxAgeMs ? `older than ${Math.round(maxAgeMs / 3600000)} h` : `over the newest ${keep}`); delete entries[s.n]; changed = true; } catch { }
      });
      if (changed) write(entries);
      return removed;
    },
  };
}

module.exports = { createPreviewStore, REGISTRY };
