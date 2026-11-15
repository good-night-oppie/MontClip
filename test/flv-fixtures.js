"use strict";
/* Synthetic FLV fixtures for the FLV import tests (no real recordings). Not a test file: node --test loads it, finds
   no tests and moves on. Everything is cut out of Rea's C0-clean.flv (test/fixtures/flv-truth-v2: 60 s, H.264 30 fps +
   AAC 44.1 kHz, a flash and a beep at 2, 7, … 57 s), so no H.264 encoder is needed and the tests run on Linux too.
   FLV tags are edited in place; timestamps are FLV's whole milliseconds. A gap here is what the import measures: the
   next packet's time minus the previous one's end (time + its duration: 33 ms a frame, 23 ms an AAC packet). */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const FF = require("../server/ffmpeg-path");

const CLEAN = path.join(__dirname, "fixtures", "flv-truth-v2", "C0-clean.flv");
const DUR = { video: 33, audio: 23 };   // ms, as ffprobe reports these packets
const TYPE = { 9: "video", 8: "audio" };

function parse(buf) {
  const tags = [];
  let off = buf.readUInt32BE(5) + 4;
  while (off + 11 <= buf.length) {
    const len = buf.readUIntBE(off + 1, 3), ts = (buf[off + 7] << 24 >>> 0) + buf.readUIntBE(off + 4, 3);
    tags.push({ off, type: buf[off], ts, len, size: 11 + len + 4 });
    off += 11 + len + 4;
  }
  return { head: buf.subarray(0, buf.readUInt32BE(5) + 4), tags, buf };
}
function write(file, { head, tags, buf }) {
  const out = [head];
  for (const t of tags) {
    if (t.dropped) continue;
    const b = Buffer.from(buf.subarray(t.off, t.off + t.size));
    b.writeUIntBE(t.ts & 0xffffff, 4, 3); b[7] = (t.ts >>> 24) & 0xff;
    if (t.body) t.body.copy(b, 11);
    out.push(b);
  }
  fs.writeFileSync(file, Buffer.concat(out));
}
const media = (f, stream) => f.tags.filter((t) => TYPE[t.type] === stream);

/** Loses packets of one stream after `at` (ms) while the clock runs on (a dropped frame, a hole in the sound), so the
 *  gap is exactly `len` ms when FLV's timestamps allow it, else the nearest above. With `exact`, a gap FLV's packet
 *  grid cannot give (an AAC packet is 23 ms: 58 ms is not a whole number of them) is made exact by nudging that
 *  stream's later packets by under a packet, choosing the nudge that keeps the stream's total nudge nearest zero (a
 *  recorder's clock jitter; picture and sound stay within a few ms). Returns the gap made (seconds). */
function drop(f, { stream, at, len, exact = false }) {
  const list = media(f, stream).filter((t) => !t.dropped);
  const start = list.findIndex((t) => t.ts >= at), cands = [];
  for (let i = start; i >= 0 && i < start + 8 && i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const gap = list[j].ts - list[i].ts - DUR[stream];
      if (gap > len + 2 * DUR[stream]) break;
      if (gap >= len - (exact ? 2 * DUR[stream] : 0)) cands.push({ i, j, gap });
    }
  const off = (f.offset ||= { video: 0, audio: 0 });
  const cost = (c) => exact ? Math.abs(off[stream] + len - c.gap) * 1000 + (c.gap < len ? 1 : 0) : c.gap - len;
  const best = cands.sort((a, b) => cost(a) - cost(b) || a.i - b.i)[0];
  for (let k = best.i + 1; k < best.j; k++) list[k].dropped = true;
  if (exact && best.gap !== len) { for (const t of list.slice(best.j)) t.ts += len - best.gap; off[stream] += len - best.gap; }
  return { stream, after: list[best.i], len: (exact ? len : best.gap) / 1000 };
}
/** Every packet of one stream `by` ms later (picture and sound out of step for the whole recording). */
function shift(f, { stream, by }) { for (const t of media(f, stream)) t.ts += by; }
/** The clock jumps `len` ms after `at` in the given streams (a recorder that stopped): every later packet of those
 *  streams moves so that the gap is exactly `len`. Returns the gaps made (seconds). */
function jump(f, { streams = ["video", "audio"], at, len }) {
  return streams.map((stream) => {
    const list = media(f, stream).filter((t) => !t.dropped);
    const i = list.findIndex((t) => t.ts >= at);
    const delta = len - (list[i].ts - list[i - 1].ts - DUR[stream]);
    for (const t of list.slice(i)) t.ts += delta;
    return { stream, after: list[i - 1], len: len / 1000 };
  });
}
/** The clock runs back (Rea on #130): from `at` ms on, every packet of both streams is put back to start again at `to` ms. */
function rewind(f, { at, to }) { for (const t of f.tags) if (TYPE[t.type] && t.ts >= at) t.ts -= at - to; }
/** The picture starts later than the sound while both stay on one clock (a live recording whose first keyframe came
 *  after its first sound, VV: 0.058 / 0.092 s): every packet moves later until the first picture is at `to` ms, the
 *  first sound packets are repeated in front, so the sound still starts at 0, and the packets moved past the old end are
 *  lost, so it still ends where it did (its stated length stays right). */
function lead(f, { to }) {
  const by = to - media(f, "video").find((t) => !t.dropped && f.buf[t.off + 12] === 1).ts;
  const end = Object.fromEntries(["video", "audio"].map((s) => [s, Math.max(...media(f, s).map((t) => t.ts))]));
  for (const t of f.tags) if (TYPE[t.type] && t.ts + by > end[TYPE[t.type]]) t.dropped = true;
  for (const t of f.tags) if (TYPE[t.type] && t.ts > 0 || TYPE[t.type] === "audio" && f.buf[t.off + 12] === 1) t.ts += by;
  const raw = media(f, "audio").filter((t) => f.buf[t.off + 12] === 1), at = f.tags.indexOf(raw[0]), front = [];
  for (let k = 0; Math.round(k * 1024000 / 44100) < by; k++) front.push({ ...raw[k], ts: Math.round(k * 1024000 / 44100) });
  f.tags.splice(at, 0, ...front);
}
/** The sound starts later than the picture, on the same clock: its packets before `before` ms are lost. */
function late(f, { before }) { for (const t of media(f, "audio")) if (f.buf[t.off + 12] === 1 && t.ts < before) t.dropped = true; }
/** The sound's clock creeps against the picture's: from `from` ms on, each sound packet a little later, `by` ms in all
 *  by `to` and after it (picture and sound move apart during the recording). */
function creep(f, { from, to, by }) {
  for (const t of media(f, "audio")) if (f.buf[t.off + 12] === 1 && t.ts >= from) t.ts += Math.round(by * Math.min(1, (t.ts - from) / (to - from)));
}
/** Every second picture between `from` and `to` (ms) late by `late` ms: the jitter of a variable-rate recorder. */
function jitter(f, { from, to, late }) {
  media(f, "video").filter((t) => t.ts >= from && t.ts < to).forEach((t, k) => { if (k % 2) t.ts += late; });
}
/** Damaged bytes behind normal timestamps: the payload of `count` pictures from `at` (ms) on is overwritten (the
 *  tag header, the AVC packet header and the first NAL's length stay as they were). */
function damage(f, { at, count }) {
  let n = 0;
  for (const t of media(f, "video")) {
    if (t.ts < at || n >= count || t.len < 64) continue;
    const body = Buffer.from(f.buf.subarray(t.off + 11, t.off + 11 + t.len));
    for (let k = 12; k < body.length; k++) body[k] = (k * 131 + 7) & 0xff;
    t.body = body; n++;
  }
}
/** A fixture: Rea's clean file with the edits applied; returns {file, made: [{stream, at, len}]}, at in the file's
 *  seconds as the import reports them (from its first packet, which is at 0 here). */
function make(dir, name, edits) {
  const f = parse(fs.readFileSync(CLEAN)), made = [];
  for (const [what, opts] of edits) {
    const r = { drop, jump, jitter, damage, shift, lead, late, creep, rewind }[what](f, opts);
    if (Array.isArray(r)) made.push(...r); else if (r) made.push(r);
  }
  const file = path.join(dir, name);
  write(file, f);
  // where each break is once every edit is in (a later jump moves the drops after it)
  const at = made.map(({ stream, after, len }) => ({ stream, at: (after.ts + DUR[stream]) / 1000, len }));
  return { file, made: at.sort((a, b) => a.at - b.at || (a.stream < b.stream ? -1 : 1)) };
}
const probe = (file) => JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
/* Edits in make()'s form, shared by the tests and desktop/flv-export-av-sync-smoke.cjs. */
const V = (at, len) => ["drop", { stream: "video", at, len }], A = (at, len) => ["drop", { stream: "audio", at, len, exact: true }];
// Rea's flash + beep are at 2, 7, … 57 s for 100 ms: breaks are put clear of them, so the A/V offset can be measured
// (slots at these offsets after each marker, 2 … 52 s, so a break of up to 0.43 s ends well before the next one)
const times = (n, offsets) => { const out = []; for (let k = 0; out.length < n; k++) for (const o of offsets) if (out.length < n) out.push(Math.round((2 + 5 * k + o) * 1000)); return out; };
// a typical live recording, as VV measured five real ones (europa, 2026-11-04): 25 picture drops of 34–100 ms, one of
// them 0.133 s between two frames (a 100 ms gap), and 4 holes in the sound of 58–65 ms
const LIVE = [...times(25, [0.5, 1.8, 3.1]).map((t, i) => V(t, i === 12 ? 100 : [34, 67, 34, 34, 67][i % 5])),
  A(9600, 58), A(24600, 60), A(39600, 62), A(54600, 65)];
module.exports = { CLEAN, make, probe, V, A, times, LIVE };
/* QQ (#130, 2026-11-05): the export reads sound with decodeAudioData, which puts the decoded samples back to back and
   ignores their timestamps — a hole in the sound is squeezed out and everything after it comes early. This measures a
   file that way: the flashes by their frames' times (as the picture plays), the beeps by sample count from the first
   sample (asetpts=N/SR/TB). Returns every flash with its nearest beep and the worst distance (seconds). */
function samplesAV(file) {
  const { spawnSync } = require("node:child_process");
  const flashes = [];
  const lines = execFileSync(FF.path("ffprobe"), ["-v", "error", "-f", "lavfi", "-i", `movie=${file.replace(/\\/g, "/").replace(/:/g, "\\\\:")},signalstats`,
    "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG", "-of", "csv=p=0"], { encoding: "utf8", maxBuffer: 64 << 20 }).trim().split(/\r?\n/);
  for (const [t, y] of lines.map((l) => l.split(",").map(Number))) if (y > 128 && (!flashes.length || t - flashes.at(-1) > 1)) flashes.push(t);
  const r = spawnSync(FF.path("ffmpeg"), ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "asetpts=N/SR/TB,silencedetect=n=-30dB:d=0.5", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const beeps = [...String(r.stderr).matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const pairs = flashes.map((f) => { const b = beeps.reduce((best, s) => Math.abs(s - f) < Math.abs(best - f) ? s : best, Infinity); return { flash: f, beep: b, off: b - f }; });
  return { flashes, beeps, pairs, worst: Math.max(0, ...pairs.map((p) => Math.abs(p.off))) };
}
module.exports.samplesAV = samplesAV;
/** The same recording with its sound as MP3 (VV's five real recordings are H.264 + MP3, europa 2026-11-06): the picture
 *  copied, the sound encoded with the bundled libmp3lame at 44.1 kHz. Its holes stay where they were (the encoder keeps
 *  the frames' timestamps). `codec` picks another sound codec for the tests that need one MontClip cannot copy or fill
 *  without a picture encoder. Returns the new file. */
function withSound(file, out, codec = "libmp3lame") {
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-i", file, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-c:a", codec,
    ...(codec === "libmp3lame" ? ["-b:a", "128k"] : []), out]);
  return out;
}
module.exports.withSound = withSound;
