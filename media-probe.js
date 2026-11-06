/* Read a media file's metadata with ffprobe (Node only — the server and the
   MCP server). The parsing is media-lib.js's parseProbe, shared with the
   tests; this file only runs ffprobe and caches the answer per file version.

     probeFile(file) → Promise of {size, fps?, codec?, audioCodec?, audioChannels?,
                       sampleRate?, bitrate?, duration?, durationFrom?, durationUnknown?, width?, height?,
                       probe:"ffprobe"|"stat"|"failed", probeError?}
                       or null when the file is not there.
   Without the bundled ffprobe only `size` comes back (probe:"stat"). When ffprobe can't
   open the file, probe:"failed" with ffprobe's own reason (probeError). ffprobe runs
   asynchronously, at most PROBE_CONCURRENCY at a time, so a project full of
   unprobed files never stalls the server's other requests. */
"use strict";
const fs = require("fs");
const { execFile, spawn } = require("child_process");
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
/** → {json} or {error: ffprobe's own reason} (a file it can't open: an MP4 whose index was never written). */
// tests only: every ffprobe run waits this long first, so a test can show what a slow disk does to the callers
const TEST_DELAY = Math.max(0, Number(process.env.FABLECUT_TEST_PROBE_DELAY_MS) || 0);
function runProbe(file) {
  if (TEST_DELAY) return new Promise((r) => setTimeout(r, TEST_DELAY)).then(() => runProbeNow(file));
  return runProbeNow(file);
}
function runProbeNow(file) {
  return new Promise((resolve) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      { encoding: "utf8", timeout: 15_000, maxBuffer: 1 << 23, windowsHide: true },
      (err, stdout, stderr) => {
        // "[mov,mp4,… @ 0x…] moov atom not found" / "<file>: Invalid data found when processing input" → both reasons, no path
        const why = () => (String(stderr || "").trim().split(/\r?\n/)
          .map((l) => l.replace(/^\[[^\]]*\]\s*/, "").split(file + ": ").join("").trim()).filter(Boolean).join("; ")
          || (err && err.killed ? "it took too long" : "no answer")).slice(0, 300);
        if (err || !stdout) return resolve({ error: why() });
        try { resolve({ json: JSON.parse(stdout) }); } catch { resolve({ error: why() }); }
      });
  });
}

/* A recording stopped before its file was closed (a screen recorder killed mid-way: europa P3, 2026-11-05) may say
   its length nowhere — not in the header, the streams or their tags. Its packets still carry their times: the length
   is from the first packet's time to where the last one ends, across the video and sound. Only the packets' headers
   are read (nothing is decoded), but that is the whole file, so it runs only when nothing else says the length, and
   gives up after a while proportional to the size. → seconds, or 0 when no packet has a time. */
const SCAN_BASE_MS = 20_000, SCAN_PER_GB_MS = 15_000, SCAN_MAX_MS = 180_000;
function packetDuration(file, size = 0) {
  const timeout = Math.min(SCAN_MAX_MS, SCAN_BASE_MS + Math.ceil(size / 1e9) * SCAN_PER_GB_MS);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(FF.path("ffprobe"), ["-v", "quiet", "-show_entries", "packet=codec_type,pts_time,dts_time,duration_time", "-of", "compact=p=0", file],
        { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    } catch { return resolve(0); }
    let first = Infinity, last = -Infinity, rest = "";
    const line = (l) => {
      let type = "", t = NaN, dts = NaN, d = 0;
      for (const kv of l.split("|")) {
        const i = kv.indexOf("="), k = kv.slice(0, i), v = kv.slice(i + 1);
        if (k === "codec_type") type = v; else if (k === "pts_time") t = Number(v); else if (k === "dts_time") dts = Number(v); else if (k === "duration_time") d = Number(v) || 0;
      }
      if (type !== "video" && type !== "audio") return;
      if (!Number.isFinite(t)) t = dts;
      if (!Number.isFinite(t)) return;
      if (t < first) first = t;
      if (t + d > last) last = t + d;
    };
    const timer = setTimeout(() => { try { child.kill(); } catch { } }, timeout);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      const lines = (rest + c).split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) line(l);
    });
    child.on("error", () => { clearTimeout(timer); resolve(0); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (rest) line(rest);
      // killed for taking too long: what was read so far is not the whole file, so it is not the length
      if (signal) return resolve(0);
      resolve(last > first ? last - first : 0);
    });
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
          const r = await runProbe(file);
          if (r.json) {
            info = { ...MediaLib.parseProbe(r.json, st.size), probe: "ffprobe" };
            if (info.durationUnknown) {
              const d = await packetDuration(file, st.size);
              if (d > 0) { delete info.durationUnknown; info.duration = Math.round(d * 1000) / 1000; info.durationFrom = "packets"; }
            }
          } else {
            // ffprobe is there but can't open the file: say that (never "no ffprobe"); nothing here can say its length
            info = { size: st.size, probe: "failed", probeError: r.error, durationUnknown: true };
          }
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
  // P6: an entry holding the stored size of a file whose pixels aren't square takes the display size
  else if (entry && MediaLib.displaySize({ width: entry.width, height: entry.height }, info)) { out.width = info.width; out.height = info.height; }
  // nothing can say how long it is: marked, so it is never placed at 0 s (MediaLib.cannotCut)
  if (kind !== "image" && kind !== "svg" && info.durationUnknown && !(entry && entry.duration > 0) && !(out.duration > 0)) out.durationUnknown = true;
  return out;
}

module.exports = { probeFile, infoForEntry, packetDuration, ffprobeAvailable, PROBE_CONCURRENCY };
