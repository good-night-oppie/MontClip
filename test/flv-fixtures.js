"use strict";
/* Synthetic FLV fixtures for the FLV import tests (no real recordings). Not a test file: node --test loads it, finds
   no tests and moves on. Everything is cut out of Rea's C0-clean.flv (test/fixtures/flv-truth-v2: 60 s, H.264 30 fps +
   AAC 44.1 kHz, a flash and a beep at 2, 7, … 57 s), so no H.264 encoder is needed and the tests run on Linux too.
   FLV tags are edited in place; timestamps are FLV's whole milliseconds. A gap here is what the import measures: the
   next packet's time minus the previous one's end (time + its duration: 33 ms a frame, 23 ms an AAC packet). */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const FF = require("../ffmpeg-path");

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
    const r = { drop, jump, jitter, damage, shift }[what](f, opts);
    if (Array.isArray(r)) made.push(...r); else if (r) made.push(r);
  }
  const file = path.join(dir, name);
  write(file, f);
  // where each break is once every edit is in (a later jump moves the drops after it)
  const at = made.map(({ stream, after, len }) => ({ stream, at: (after.ts + DUR[stream]) / 1000, len }));
  return { file, made: at.sort((a, b) => a.at - b.at || (a.stream < b.stream ? -1 : 1)) };
}
const probe = (file) => JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
module.exports = { CLEAN, make, probe };
