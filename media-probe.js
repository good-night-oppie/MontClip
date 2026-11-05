/* Read a media file's metadata with ffprobe (Node only — the server and the
   MCP server). The parsing is media-lib.js's parseProbe, shared with the
   tests; this file only runs ffprobe and caches the answer per file version.

     probeFile(file) → Promise of {size, fps?, codec?, audioCodec?, audioChannels?,
                       sampleRate?, bitrate?, duration?, width?, height?, probe:"ffprobe"|"stat"}
                       or null when the file is not there.
   Without the bundled ffprobe only `size` comes back (probe:"stat"). ffprobe runs
   asynchronously, at most PROBE_CONCURRENCY at a time, so a project full of
   unprobed files never stalls the server's other requests. */
"use strict";
const fs = require("fs");
const { execFile } = require("child_process");
const FF = require("./ffmpeg-path");
const MediaLib = require("./media-lib");

const PROBE_CONCURRENCY = 4;

let hasProbe = null;
function ffprobeAvailable() {
  if (hasProbe == null) {
    // the bundled file being there is enough: a 100+ MB static ffprobe can take
    // longer than any short "-version" timeout to start on a slow or busy disk
    hasProbe = FF.available("ffprobe");
  }
  return hasProbe;
}

const cache = new Map();     // file → {key, info}
const inflight = new Map();  // file + key → Promise
const CACHE_MAX = 2000;
let active = 0;
const waiting = [];
function slot() {
  if (active < PROBE_CONCURRENCY) { active++; return Promise.resolve(); }
  return new Promise((r) => waiting.push(r));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else active--;
}
function runProbe(file) {
  return new Promise((resolve) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      { encoding: "utf8", timeout: 15_000, maxBuffer: 1 << 23, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      });
  });
}

/** The time of the first packet of the first sound stream, or null (media-lib.js probeClock). */
function firstAudioPts(file) {
  return new Promise((resolve) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time", "-read_intervals", "%+#1", "-of", "csv=p=0", file],
      { encoding: "utf8", timeout: 15_000, windowsHide: true },
      (err, stdout) => { const line = String(stdout || "").trim().split(/\s+/)[0], t = Number(line); resolve(!err && line && Number.isFinite(t) ? t : null); });
  });
}

async function probeFile(file) {
  let st;
  try { st = await fs.promises.stat(file); } catch { return null; }
  if (!st.isFile()) return null;
  const key = st.size + ":" + st.mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.key === key) return { ...hit.info };
  const id = file + "\0" + key;
  if (!inflight.has(id)) {
    inflight.set(id, (async () => {
      let info = { size: st.size, probe: "stat" };
      if (ffprobeAvailable()) {
        await slot();
        try {
          const json = await runProbe(file);
          const pts = json && MediaLib.needsFirstAudioPts(json) ? await firstAudioPts(file) : null;
          if (json) info = { ...MediaLib.parseProbe(json, st.size, pts), probe: "ffprobe" };
        } finally { release(); }
      }
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(file, { key, info });
      return info;
    })().finally(() => inflight.delete(id)));
  }
  return { ...(await inflight.get(id)) };
}

/** The INFO_KEYS of probeFile's answer, ready to merge into a media entry
 *  (duration / width / height only when the entry lacks them). */
function infoForEntry(info, entry) {
  const out = {};
  if (!info) return out;
  for (const k of MediaLib.INFO_KEYS) if (info[k] != null) out[k] = info[k];
  const kind = entry && entry.kind;
  if (kind !== "image" && kind !== "svg" && info.duration > 0 && !(entry && entry.duration > 0)) out.duration = info.duration;
  if (info.width > 0 && !(entry && entry.width > 0)) { out.width = info.width; out.height = info.height; }
  return out;
}

module.exports = { probeFile, infoForEntry, ffprobeAvailable, PROBE_CONCURRENCY };
