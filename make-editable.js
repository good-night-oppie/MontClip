/* 〔帮我修好〕 (one button for every repair and conversion): make a video MontClip can cut (JJ, P3, 2026-11-05; Deja).

     makeEditable(file, {outDir, signal, onProgress(p 0…1, phase)}) →
       Promise of {file, duration, preparation: "remux" | "transcode", encoder?}

   A new MP4 is written beside the others (<name>.repaired.mp4); the original is never touched. In order:
     1. remux (-c copy): quick and lossless. The new file gets a header with its length, so a recording that was cut
        off before it was saved has one again.
     2. check: the new file says its length, it is the length of what the original holds (within 1 s), and it decodes
        from start to end with the decoders' error detection turned up (-xerror). The check reads the NEW file: the
        original's last packet is cut in half, and a remux leaves that behind.
     3. only when 1 or 2 fails — VP8 can't go into an MP4, a codec the browser can't play, a broken frame — re-encode
        from the original, skipping what can't be decoded, and check again. The encoder is chosen the way exports
        choose (ADR 2026-11-02-h264-encoder / 2026-11-05-ffmpeg-detect-and-download): the user's own FFmpeg when it
        has libx264, then an H.264 encoder of the bundled LGPL FFmpeg that works here (prepare-media usableH264, as
        #130 uses), then the bundled LGPL VP9 (an MP4 the browser plays). No GPL encoder is ever bundled.
   An FLV goes through prepareMedia first (#130's 〔帮我转〕: its breaks and drift rules); the request is the user's
   yes, so allowTranscode / fixGaps are given. When that path can't do it (no H.264 encoder here, …) the steps above
   run instead.
   Errors carry `code`: REPAIR_FAILED (too damaged: nothing usable came out), REPAIR_CANCELLED. No half-written file
   is left behind either way. */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const FF = require("./ffmpeg-path");
const MediaProbe = require("./media-probe");
const Prepare = require("./prepare-media");
const X = require("./external-ffmpeg");

const MIN_USABLE = 0.5;   // seconds: less than this is not a video one can cut
const failure = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });
const cancelled = () => failure("REPAIR_CANCELLED");

/** Run ffmpeg / ffprobe; `onTime(seconds)` follows -progress. Rejects with {stderr}; with REPAIR_CANCELLED on abort. */
function run(bin, args, { signal, onTime } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(cancelled());
    let child;
    try { child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { return reject(e); }
    let stdout = "", stderr = "", rest = "";
    const kill = () => { try { child.kill("SIGKILL"); } catch { } };
    if (signal) signal.addEventListener("abort", kill, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      if (!onTime) { stdout += c; return; }
      const lines = (rest + c).split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) { const m = /^out_time_us=(\d+)/.exec(l); if (m) onTime(Number(m[1]) / 1e6); }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c) => { stderr = (stderr + c).slice(-4000); });
    child.on("error", (e) => { if (signal) signal.removeEventListener("abort", kill); reject(e); });
    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", kill);
      if (signal && signal.aborted) return reject(cancelled());
      if (code === 0) resolve(stdout);
      else reject(Object.assign(new Error(stderr.trim().split(/\r?\n/).pop() || "ffmpeg failed"), { stderr }));
    });
  });
}

function probeJson(file, signal) {
  return run(FF.path("ffprobe"), ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { signal }).then(JSON.parse);
}

/** Where the new file goes: <outDir>/<name>.repaired.mp4, a number added when that is taken. */
function target(file, outDir) {
  const stem = path.basename(file, path.extname(file)).replace(/\.repaired(_\d+)?$/, "");
  let out = path.join(outDir, stem + ".repaired.mp4");
  for (let i = 1; fs.existsSync(out) || fs.existsSync(out + ".part"); i++) out = path.join(outDir, `${stem}.repaired_${i}.mp4`);
  return out;
}
const rm = (f) => { try { fs.rmSync(f, { force: true }); } catch { /* best effort */ } };

/** After a remux or a re-encode: the new file is as long as what the original holds, within 1 s (JJ, 2026-11-05) —
 *  nothing to compare with (the original says no length at all), its own length. */
const lengthHolds = (expected, got) => !(expected > 0) || Math.abs(got - expected) <= 1;
/** The bundled ffmpeg's encoder names (once). */
let bundledList = null;
function bundledEncoders() {
  return bundledList || (bundledList = run(FF.path("ffmpeg"), ["-hide_banner", "-encoders"])
    .then((out) => new Set(String(out).split(/\r?\n/).map((l) => (l.match(/^\s*V\S*\s+(\S+)/) || [])[1]).filter(Boolean)))
    .catch(() => new Set()));
}
/** The encoders a re-encode may use, best first: [{bin, video:[args], name}]. Empty: nothing here can re-encode. */
async function encoders() {
  const out = [];
  try {
    const ext = await X.createExternal().current();
    if (ext.ok) out.push({ name: "libx264", bin: ext.path, video: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"] });
  } catch { /* no local FFmpeg chosen */ }
  try { for (const e of await Prepare.usableH264()) out.push({ name: e, bin: FF.path("ffmpeg"), video: Prepare.transcodeVideoArgs(e) }); }
  catch { /* none answered */ }
  if ((await bundledEncoders()).has("libvpx-vp9"))
    out.push({ name: "libvpx-vp9", bin: FF.path("ffmpeg"), video: ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-pix_fmt", "yuv420p"] });
  return out;
}

async function makeEditable(file, { outDir = path.dirname(file), signal, onProgress, encoders: listEncoders = encoders } = {}) {
  const say = (p, phase) => { if (onProgress) try { onProgress(Math.max(0, Math.min(1, p)), phase); } catch { } };
  if (signal && signal.aborted) throw cancelled();
  const info = await MediaProbe.probeFile(file);
  if (!info || info.probe === "failed") throw failure("REPAIR_FAILED", info && info.probeError ? new Error(info.probeError) : undefined);
  if (info.probe === "stat") throw failure("REPAIR_FAILED", new Error(FF.why("ffprobe", "to repair a video")));
  const expected = info.duration > 0 ? info.duration : 0;
  const out = target(file, outDir), part = out + ".part";
  const span = (p0, p1, phase) => (s) => say(p0 + (p1 - p0) * (expected > 0 ? Math.min(1, s / expected) : 0), phase);

  /** The new file holds: it says its length, close to what the original holds, and decodes cleanly. → seconds or 0 */
  async function check(p0, p1) {
    say(p0, "check");
    let json;
    try { json = await probeJson(part, signal); } catch (e) { if (e.code === "REPAIR_CANCELLED") throw e; return 0; }
    const d = Number(json.format && json.format.duration);
    if (!(d >= MIN_USABLE)) return 0;
    if (!lengthHolds(expected, d)) return 0;
    try { await run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-xerror", "-err_detect", "explode", "-progress", "pipe:1", "-nostats", "-i", part, "-f", "null", "-"], { signal, onTime: span(p0, p1, "check") }); }
    catch (e) { if (e.code === "REPAIR_CANCELLED") throw e; return 0; }
    return Math.round(d * 1000) / 1000;
  }

  try {
    // an FLV: #130's preparation first (breaks, drift, its own checks); the request is the yes it asks for
    if (path.extname(file).toLowerCase() === ".flv") {
      say(0, "convert");
      try {
        const r = await Prepare.prepareMedia(file, { allowTranscode: true, fixGaps: true, signal });
        const made = path.join(path.dirname(file), decodeURIComponent(String(r.src).replace(/^\/media\//, "")));
        if (r.originalSrc && fs.existsSync(made)) {
          fs.renameSync(made, part);
          const d = await check(0.8, 1);
          if (d > 0) { fs.renameSync(part, out); say(1, "done"); return { file: out, duration: d, preparation: r.preparation || "remux" }; }
          rm(part);
        }
      } catch (e) {
        if (signal && signal.aborted) throw cancelled();
        if (e.code === "FLV_SOURCE_DAMAGED") throw failure("REPAIR_FAILED", e);
        // anything else (no H.264 encoder here, …): the general steps below
      }
    }

    // 1. remux
    say(0, "remux");
    let remuxed = true;
    try {
      await run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", "-i", file,
        "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", part], { signal, onTime: span(0, 0.15, "remux") });
    } catch (e) { if (e.code === "REPAIR_CANCELLED") throw e; remuxed = false; }
    // 2. check
    if (remuxed) {
      const d = await check(0.15, 0.3);
      if (d > 0) { fs.renameSync(part, out); say(1, "done"); return { file: out, duration: d, preparation: "remux" }; }
    }
    rm(part);

    // 3. re-encode, from the original, past whatever can't be decoded
    let audio = true;
    try { audio = (await probeJson(file, signal)).streams.some((s) => s.codec_type === "audio"); } catch (e) { if (e.code === "REPAIR_CANCELLED") throw e; }
    const list = await listEncoders();
    // re-encoding is needed and nothing here can do it: refused before anything is written (JJ)
    if (!list.length) throw failure("REPAIR_ENCODER_MISSING");
    for (const enc of list) {
      say(0.3, "transcode");
      try {
        await run(enc.bin, ["-v", "error", "-nostdin", "-y", "-progress", "pipe:1", "-nostats", "-err_detect", "ignore_err", "-fflags", "+discardcorrupt+genpts",
          "-i", file, "-map", "0:v:0?", "-map", "0:a:0?", ...enc.video, ...(audio ? ["-c:a", "aac", "-b:a", "192k"] : []),
          "-movflags", "+faststart", "-f", "mp4", part], { signal, onTime: span(0.3, 0.85, "transcode") });
      } catch (e) { if (e.code === "REPAIR_CANCELLED") throw e; rm(part); continue; }
      const d = await check(0.85, 1);
      if (d > 0) { fs.renameSync(part, out); say(1, "done"); return { file: out, duration: d, preparation: "transcode", encoder: enc.name }; }
      rm(part);
    }
    throw failure("REPAIR_FAILED");
  } catch (e) {
    rm(part);
    if (e.code === "REPAIR_CANCELLED" || (signal && signal.aborted)) throw cancelled();
    if (e.code === "REPAIR_FAILED" || e.code === "REPAIR_ENCODER_MISSING") throw e;
    throw failure("REPAIR_FAILED", e);
  }
}

/* Background jobs, the convention every long MontClip operation follows (P2, MontClip-Cindy #3): starting one answers
   at once with {job, status, progress, phase}; asking again with the job id says how far it got; the result (or the
   error's code) is on the job once it is done; cancel stops it. Starting the same work again while it runs (the same
   key) joins that job instead of starting another, so a caller that timed out can simply call again. */
function createJobs({ prefix = "r_", keep = 50 } = {}) {
  const jobs = new Map();
  const view = (j) => ({ job: j.id, status: j.status, progress: Math.round(j.progress * 1000) / 1000, phase: j.phase,
    ...(j.result ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}) });
  function start(key, work) {
    for (const j of jobs.values()) if (j.key === key && (j.status === "pending" || j.status === "running")) return view(j);
    const id = prefix + Math.random().toString(36).slice(2, 10);
    const ac = new AbortController();
    const j = { id, key, status: "running", progress: 0, phase: "start", ac };
    jobs.set(id, j);
    while (jobs.size > keep) { const old = [...jobs.values()].find((x) => x.status !== "running"); if (!old) break; jobs.delete(old.id); }
    Promise.resolve()
      .then(() => work({ signal: ac.signal, onProgress: (p, phase) => { j.progress = p; if (phase) j.phase = phase; } }))
      .then((result) => { j.status = "done"; j.progress = 1; j.phase = "done"; j.result = result; },
        (e) => {
          j.status = e && e.code === "REPAIR_CANCELLED" ? "cancelled" : "failed";
          j.error = { code: (e && e.code) || "REPAIR_FAILED", message: String((e && e.message) || e) };
        });
    return view(j);
  }
  const get = (id) => { const j = jobs.get(String(id)); return j ? view(j) : null; };
  function cancel(id) {
    const j = jobs.get(String(id));
    if (!j) return null;
    if (j.status === "running") j.ac.abort();
    return view(j);
  }
  return { start, get, cancel };
}

module.exports = { makeEditable, createJobs, lengthHolds, MIN_USABLE };
