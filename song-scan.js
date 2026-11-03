/* Reading a recording for songs.js (P2 「找出每首歌」, Deja 2026-11-03), on the server or in the MCP process.
 *
 * ffmpeg's own astats and aspectralstats read the file's first audio stream, mono at 16 kHz, one 8000-sample frame per
 * 0.5 s: [rms, flat, cent, ent, zcr] per row — the RMS level in dBFS, spectral flatness, centroid and entropy, and the
 * zero-crossing rate (the prototype's features; songs.js uses the level). The file is read in segments of SEGMENT
 * seconds and each finished segment is kept at once in analysis/songs/<file version>/, so a scan that is stopped (or
 * crashes) carries on from the first segment not read yet. The version is the file's name, size and modification time:
 * a replaced file is read again. One ffmpeg at a time per file; it is stopped with the scan. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const STEP = 0.5, RATE = 16000, SEGMENT = 300, PER = SEGMENT / STEP, FLOOR = -90;
const KEYS = ["rms", "flat", "cent", "ent", "zcr"];
const FILTER = "aformat=sample_fmts=fltp:channel_layouts=mono:sample_rates=" + RATE + ",asetnsamples=n=" + RATE * STEP + ":p=0," +
  "astats=metadata=1:reset=1:measure_overall=none:measure_perchannel=RMS_level+Zero_crossings_rate," +
  "aspectralstats=win_size=" + RATE * STEP + ":overlap=0:measure=flatness+centroid+entropy,ametadata=mode=print:file=-";
const FIELD = { "lavfi.astats.1.RMS_level": 0, "lavfi.aspectralstats.1.flatness": 1, "lavfi.aspectralstats.1.centroid": 2,
  "lavfi.aspectralstats.1.entropy": 3, "lavfi.astats.1.Zero_crossings_rate": 4 };

const stopped = () => Object.assign(new Error("the song scan was stopped; run it again to carry on"), { code: "SONGS_STOPPED" });

function createSongScan({ dir, ffmpeg = require("./ffmpeg-path").path("ffmpeg") }) {
  const running = new Map();
  const keyOf = (file) => {
    const st = fs.statSync(file);
    return crypto.createHash("sha256").update(path.basename(file) + "\0" + st.size + "\0" + Math.round(st.mtimeMs)).digest("hex").slice(0, 32);
  };
  const folder = (key) => path.join(dir, key);
  const segFile = (key, i) => path.join(folder(key), String(i).padStart(4, "0") + ".json");
  function readSeg(key, i) {
    try {
      const s = JSON.parse(fs.readFileSync(segFile(key, i), "utf8"));
      return s && s.v === 1 && s.i === i && Array.isArray(s.rows) && typeof s.last === "boolean" ? s : null;
    } catch { return null; }
  }
  function writeSeg(key, i, rows, last) {
    fs.mkdirSync(folder(key), { recursive: true });
    const out = segFile(key, i), tmp = out + "." + crypto.randomUUID() + ".tmp";
    try { fs.writeFileSync(tmp, JSON.stringify({ v: 1, i, step: STEP, start: i * SEGMENT, last, rows }), { flag: "wx" }); fs.renameSync(tmp, out); }
    catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { } throw e; }
  }
  /** The segments already read, in order from the first: their rows, and whether the file has been read to its end. */
  function stored(key) {
    const rows = []; let i = 0, complete = false;
    for (let s; (s = readSeg(key, i)); i++) { rows.push(...s.rows); if (s.last) { complete = true; i++; break; } }
    return { done: i, complete, rows };
  }
  function cached(file) {
    const s = stored(keyOf(file));
    return { done: s.done, complete: s.complete, scanned: Math.round(s.rows.length * STEP * 1000) / 1000 };
  }
  /* One ffmpeg from segment `from` to the end of the file; each full segment is written as soon as it is read. */
  function read(file, key, from, { signal, onSegment }) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(stopped());
      const proc = spawn(ffmpeg, ["-v", "error", "-nostdin", ...(from ? ["-ss", String(from * SEGMENT)] : []), "-i", file,
        "-vn", "-map", "0:a:0", "-af", FILTER, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let seg = from, rows = [], row = null, buf = "", err = "", aborted = false, failed = null;
      const onAbort = () => { aborted = true; proc.kill(); };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const flush = (last) => {
        writeSeg(key, seg, rows, last);
        if (onSegment) onSegment(seg, seg * SEGMENT);
        seg++; rows = [];
      };
      const take = () => {
        if (!row) return;
        rows.push(row.map((v, k) => (v == null ? (k === 0 ? FLOOR : 0) : v)));
        row = null;
        if (rows.length === PER) flush(false);
      };
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        if (failed || aborted) return;
        buf += chunk;
        let nl;
        try {
          while (!aborted && (nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (line.startsWith("frame:")) { take(); row = [null, null, null, null, null]; continue; }
            const eq = line.indexOf("="), k = FIELD[line.slice(0, eq)];
            if (row && k !== undefined) {
              const v = parseFloat(line.slice(eq + 1));
              row[k] = Number.isFinite(v) ? (k === 0 ? Math.max(FLOOR, v) : v) : (k === 0 ? FLOOR : 0);   // -inf: digital silence
              row[k] = Math.round(row[k] * 1e4) / 1e4;
            }
          }
        } catch (e) { failed = e; proc.kill(); }
      });
      proc.stderr.on("data", (d) => { if (err.length < 4000) err += d; });
      proc.on("error", (e) => { failed = failed || e; });
      proc.on("close", (code) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (failed) return reject(failed);
        if (aborted || (signal && signal.aborted)) return reject(stopped());
        if (code !== 0) return reject(Object.assign(new Error("ffmpeg could not read the sound: " + err.trim().split("\n").pop()), { code: "SONGS_FAILED" }));
        try { take(); flush(true); resolve(); } catch (e) { reject(e); }
      });
    });
  }
  /** Read what is not read yet, then answer every row: {key, step, keys, rows, complete, scanned}. */
  async function scan(file, { signal, onSegment } = {}) {
    const key = keyOf(file);
    while (running.has(key)) { try { await running.get(key); } catch { } }   // one reader per file version
    const job = (async () => {
      const have = stored(key);
      if (!have.complete) await read(file, key, have.done, { signal, onSegment });
    })();
    running.set(key, job);
    try { await job; } finally { if (running.get(key) === job) running.delete(key); }
    const s = stored(key);
    return { key, step: STEP, keys: KEYS.slice(), rows: s.rows, complete: s.complete, scanned: Math.round(s.rows.length * STEP * 1000) / 1000 };
  }
  /** What has been read so far, without reading more: {key, step, keys, rows, complete, scanned, done}. */
  function load(file) {
    const key = keyOf(file), s = stored(key);
    return { key, step: STEP, keys: KEYS.slice(), rows: s.rows, complete: s.complete, scanned: Math.round(s.rows.length * STEP * 1000) / 1000, done: s.done };
  }
  /** Forget what was read of this file (to read it again). */
  function forget(file) { fs.rmSync(folder(keyOf(file)), { recursive: true, force: true }); }
  return { scan, cached, load, forget, keyOf, STEP, SEGMENT };
}
module.exports = { createSongScan, STEP, SEGMENT, KEYS };
