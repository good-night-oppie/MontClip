/* Export self-check (Deja, the black export): a finished file that is black from start to end, or silent, while the
   footage on the timeline at those moments is not, is not a finished export. It used to be called done — a recording
   whose timestamps start at 3600 s exported as 20 s of black with every check ticked — and the person streaming got a
   black video with no error.

   The editor sends a plan with /api/export/begin (app.js exportCheckPlan): at 8 moments of the range, the video clips on
   screen and where in their file they are, and up to 8 stretches of sound the mix plays. After the file is written:
     • picture: the file's frames at those moments, a 16×9 grey copy each. Brightest cell ≤ BLACK in every one = black.
       Only then are the source frames read (ffmpeg -ss, the same media time the editor uses): one brighter than SOURCE_LIT
       means the footage had a picture the export lost.
     • sound: silent = the measured loudness says so (delivery report), or the mix sent with the export peaks under
       QUIET_DB, or there was no mix although the plan has sound. Only then are the sources' stretches read
       (volumedetect): one louder than QUIET_DB means the footage had sound the export lost.
     • each piece (MC-14): the editor names the pieces (第 N 段) whose sound was silent where the mix played them
       (app.js exportSilentSegments). Each one's part of its file is read (volumedetect): louder than QUIET_DB there means
       the mix lost it — the export failed (EXPORT_AUDIO_FAILED, with N; the file is deleted); silent there too is a
       warning in the report (EXPORT_CLIP_SILENT, 「第 N 段是无声的」), so loud music over the whole export never hides it.
   A normal export pays for the 8 frame reads of the picture check (and, without a delivery report, one read of the mix);
   the sources are read only when the file looks blank. Zero dependencies. */
"use strict";
const { execFile } = require("child_process");

const BLACK = 40;          // 8-bit luma: limited-range black is 16; a dark but real shot has cells far above 40
const SOURCE_LIT = 60;
const QUIET_DB = -50;      // dBFS peak
const PARALLEL = 4;
const TIMEOUT_MS = 20000;
const MAX_POINTS = 64;

function run(ffmpeg, args, encoding) {
  return new Promise((resolve) => {
    execFile(ffmpeg, args, { encoding, timeout: TIMEOUT_MS, maxBuffer: 1 << 20, windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, stdout, stderr: String(stderr || "") }));
  });
}
/** The brightest cell of a 16×9 grey copy of the frame at t (0–255); null when no frame could be read. */
async function frameMax(ffmpeg, file, t) {
  const r = await run(ffmpeg, ["-hide_banner", "-nostdin", "-v", "error", "-ss", String(Math.max(0, t)), "-i", file,
    "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=16:9,format=gray", "-f", "rawvideo", "-"], "buffer");
  if (!r.ok || !r.stdout || r.stdout.length < 144) return null;
  let max = 0;
  for (let i = 0; i < 144; i++) max = Math.max(max, r.stdout[i]);
  return max;
}
/** The peak of the first sound of file from `at` for `dur` seconds, dBFS: −Infinity for digital silence, or for a file
 *  with no sound stream at all; null when it could not be read (MC-14, QQ on #229): ffmpeg failed or ran out of time,
 *  or decoded nothing there — volumedetect says nothing then. A read that failed used to count as silence, so a
 *  source that couldn't be read never showed that the export had lost its sound. */
async function soundPeak(ffmpeg, file, at = 0, dur = null) {
  const r = await run(ffmpeg, ["-hide_banner", "-nostdin", "-nostats", ...(at > 0 ? ["-ss", String(at)] : []), "-i", file,
    ...(dur > 0 ? ["-t", String(dur)] : []), "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], "utf8");
  const m = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr);
  // no sound stream at all, in older ffmpeg's words and in 8 / 9's ("Failed to set value '0:a:0' for option 'map'")
  if (!m) return /Stream map '0:a:0' matches no streams|does not contain any stream|value '0:a:0' for option 'map'/i.test(r.stderr) ? -Infinity : null;
  return m[1] === "-inf" ? -Infinity : Number(m[1]);
}
async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}
/** The editor's plan, checked: numbers where numbers go, at most MAX_POINTS of each. */
function cleanPlan(plan) {
  const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : null);
  const video = [], audio = [], silent = [];
  for (const p of (plan && Array.isArray(plan.video) ? plan.video : []).slice(0, MAX_POINTS)) {
    if (p && typeof p.src === "string" && num(p.t) != null && num(p.at) != null) video.push({ t: num(p.t), src: p.src, at: num(p.at) });
  }
  for (const p of (plan && Array.isArray(plan.audio) ? plan.audio : []).slice(0, MAX_POINTS)) {
    if (p && typeof p.src === "string" && num(p.at) != null && num(p.dur) > 0) audio.push({ src: p.src, at: num(p.at), dur: Math.min(30, num(p.dur)) });
  }
  for (const p of (plan && Array.isArray(plan.silent) ? plan.silent : []).slice(0, MAX_POINTS)) {
    if (p && Number.isInteger(p.n) && p.n > 0 && typeof p.src === "string" && num(p.at) != null && num(p.dur) > 0)
      silent.push({ n: p.n, src: p.src, at: num(p.at), dur: Math.min(30, num(p.dur)) });
  }
  return { video, audio, silent };
}
/** → {ok, picture, sound, lost, quiet, ms}: picture / sound true when the file lost the footage's picture / sound;
 *  lost: the pieces (N) whose sound the mix lost; quiet: the pieces silent in their files too (a warning).
 *  o: {ffmpeg, file (the export), plan (cleanPlan), resolve(src) → file | null,
 *      silent: true | false | null (null: measure the mix), mix: the WAV sent with the export, or null} */
async function check(o) {
  const t0 = Date.now();
  const plan = o.plan || { video: [], audio: [] };
  let picture = false, sound = false;
  const times = [...new Set(plan.video.map((p) => p.t))];
  if (times.length) {
    const outs = await pool(times, (t) => frameMax(o.ffmpeg, o.file, t));
    if (outs.every((v) => v != null && v <= BLACK)) {
      const seen = new Map();
      for (const p of plan.video) { const f = o.resolve(p.src); if (f) seen.set(f + "\0" + p.at.toFixed(3), [f, p.at]); }
      const lit = await pool([...seen.values()], ([f, at]) => frameMax(o.ffmpeg, f, at));
      picture = lit.some((v) => v != null && v > SOURCE_LIT);
    }
  }
  if (plan.audio.length) {
    let silent = o.silent;
    // a mix that can't be read is not known to have sound: the sources are read
    if (silent == null) silent = o.mix ? await soundPeak(o.ffmpeg, o.mix).then((db) => db == null || db < QUIET_DB) : true;
    if (silent) {
      const seen = new Map();
      for (const p of plan.audio) { const f = o.resolve(p.src); if (f) seen.set(f + "\0" + p.at.toFixed(3), [f, p.at, p.dur]); }
      const peaks = await pool([...seen.values()], ([f, at, dur]) => soundPeak(o.ffmpeg, f, at, dur));
      // a source that couldn't be read never counts as silent (MC-14): the export can't be shown to be right
      sound = peaks.some((db) => db == null || db > QUIET_DB);
    }
  }
  const lost = [], quiet = [];
  const silent = plan.silent || [];
  if (silent.length) {
    const peaks = await pool(silent, (p) => { const f = o.resolve(p.src); return f ? soundPeak(o.ffmpeg, f, p.at, p.dur) : null; });
    // sound there, or its file couldn't be read: lost — never "silent in its file too"
    silent.forEach((p, i) => (peaks[i] == null || peaks[i] > QUIET_DB ? lost : quiet).push(p.n));
  }
  return { ok: !picture && !sound && !lost.length, picture, sound, lost, quiet, ms: Date.now() - t0 };
}
/** The reason code of a failed check (app.js CODE_TEXT says it in the interface language). */
function failCode(r) {
  if (r.lost && r.lost.length) return "EXPORT_AUDIO_FAILED";
  return r.picture && r.sound ? "EXPORT_BLANK_BOTH" : r.picture ? "EXPORT_BLANK_PICTURE" : r.sound ? "EXPORT_BLANK_SOUND" : null;
}
/** The failure's params for the interface sentence: {n} of the first lost piece. */
function failParams(r) { return r.lost && r.lost.length ? { n: r.lost[0] } : null; }
/** English, for agents and logs. */
function failText(r) {
  if (r.lost && r.lost.length) return `the sound of clip ${r.lost.join(", ")} could not be read (the export is silent there, ` +
    "its file is not) — the export stopped and no file was kept; the originals are unchanged";
  const what = r.picture && r.sound ? "black and silent" : r.picture ? "black" : "silent";
  return `the exported file is ${what} from start to end, but the footage on the timeline is not — the export went wrong; ` +
    "don't use this file (the originals are unchanged)";
}

/** A delivery report with a warning for each silent piece (EXPORT_CLIP_SILENT, n): the report is then not "passed",
 *  however loud the whole export measured. The page says it in the interface language (app.js exportCheckText). */
function withQuiet(report, quiet) {
  if (!report || !quiet || !quiet.length) return report;
  const checks = [...report.checks, ...quiet.map((n) => ({ ok: false, code: "EXPORT_CLIP_SILENT", n, text: `clip ${n} is silent — check that it is meant to be` }))];
  return { ...report, ok: false, checks, line: checks.map((x) => (x.ok ? "" : "⚠ ") + x.text).join(" · ") };
}

module.exports = { check, cleanPlan, frameMax, soundPeak, failCode, failParams, failText, withQuiet, BLACK, SOURCE_LIT, QUIET_DB };
