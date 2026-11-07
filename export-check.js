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
/** The peak of the first sound of file from `at` for `dur` seconds, dBFS (−Infinity for digital silence); null when it
 *  could not be read. */
async function soundPeak(ffmpeg, file, at = 0, dur = null) {
  const r = await run(ffmpeg, ["-hide_banner", "-nostdin", "-nostats", ...(at > 0 ? ["-ss", String(at)] : []), "-i", file,
    ...(dur > 0 ? ["-t", String(dur)] : []), "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], "utf8");
  const m = /max_volume:\s*(-?[\d.]+|-inf)\s*dB/.exec(r.stderr);
  if (!m) return r.ok && !/Stream map '0:a:0' matches no streams|does not contain any stream/i.test(r.stderr) ? -Infinity : null;
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
  const video = [], audio = [];
  for (const p of (plan && Array.isArray(plan.video) ? plan.video : []).slice(0, MAX_POINTS)) {
    if (p && typeof p.src === "string" && num(p.t) != null && num(p.at) != null) video.push({ t: num(p.t), src: p.src, at: num(p.at) });
  }
  for (const p of (plan && Array.isArray(plan.audio) ? plan.audio : []).slice(0, MAX_POINTS)) {
    if (p && typeof p.src === "string" && num(p.at) != null && num(p.dur) > 0) audio.push({ src: p.src, at: num(p.at), dur: Math.min(30, num(p.dur)) });
  }
  return { video, audio };
}
/** → {ok, picture, sound, ms}: picture / sound true when the file lost the footage's picture / sound.
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
    if (silent == null) silent = o.mix ? await soundPeak(o.ffmpeg, o.mix).then((db) => db != null && db < QUIET_DB) : true;
    if (silent) {
      const seen = new Map();
      for (const p of plan.audio) { const f = o.resolve(p.src); if (f) seen.set(f + "\0" + p.at.toFixed(3), [f, p.at, p.dur]); }
      const peaks = await pool([...seen.values()], ([f, at, dur]) => soundPeak(o.ffmpeg, f, at, dur));
      sound = peaks.some((db) => db != null && db > QUIET_DB);
    }
  }
  return { ok: !picture && !sound, picture, sound, ms: Date.now() - t0 };
}
/** The reason code of a failed check (app.js CODE_TEXT says it in the interface language). */
function failCode(r) {
  return r.picture && r.sound ? "EXPORT_BLANK_BOTH" : r.picture ? "EXPORT_BLANK_PICTURE" : r.sound ? "EXPORT_BLANK_SOUND" : null;
}
/** English, for agents and logs. */
function failText(r) {
  const what = r.picture && r.sound ? "black and silent" : r.picture ? "black" : "silent";
  return `the exported file is ${what} from start to end, but the footage on the timeline is not — the export went wrong; ` +
    "don't use this file (the originals are unchanged)";
}

module.exports = { check, cleanPlan, frameMax, soundPeak, failCode, failText, BLACK, SOURCE_LIT, QUIET_DB };
