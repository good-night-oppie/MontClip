/* Part of a file's audio for the export mix (GET /api/audio-window): the ffmpeg arguments and a WAV header reader.

   The window is on the container's clock: output sample 0 is container time `from`, even when the audio stream starts
   later than the video (`aresample=async=1:first_pts=0` pads the gap with silence) — QQ, 2026-11-05: audio 80 ms late
   put the beep at 5.000 / 5.021 s without it, at 5.080 s (where <video> and the container have it) with it — for a
   window from 0 too (Rea, #149: a clip within 0.5 s of the head was early by 59 / 80 ms on bf5820a5, before this filter).
   A timestamp gap in the audio (录播姬 recordings have them, up to about 101 ms) is filled with silence as well:
   min_hard_comp=0.01 fills any gap over 10 ms at once — the default (0.1 s) only stretches smaller ones by 1 sample a
   second, which left the sound after a 50 ms gap 50 ms early (Rea, comment 6650099788). Millisecond timestamp rounding
   stays under the 10 ms, so ordinary files are not touched.
   ffmpeg writes the WAV to a file, not a pipe, so its header carries the real lengths and the server never holds the
   samples in memory; the header is then walked chunk by chunk (never searched for "data"). */
"use strict";
const path = require("path");

/** The audio filter that puts a decoded window on the container's clock: sample 0 is container time `from`, a late
    start and any timestamp gap over 10 ms are silence. Shared: every decode whose sample count is read as time (this
    window; the transcript's decode in asr-local.js, #165) uses this one string, so their times agree. */
const CLOCK_FILTER = "aresample=async=1:min_hard_comp=0.01:first_pts=0";

/** ffmpeg arguments: audio stream `track` (the media entry's audioTrack; 0 = the first) from `from` for `dur` seconds,
    f32 WAV at 48 kHz, its own channels. */
function windowArgs(file, from, dur, out, track = 0) {
  return ["-hide_banner", "-v", "error", "-y", "-ss", from.toFixed(6), "-t", dur.toFixed(6), "-i", file,
    "-map", "0:a:" + track, "-vn", "-sn", "-dn", "-af", CLOCK_FILTER, "-ar", "48000", "-c:a", "pcm_f32le", "-f", "wav", out];
}

/** RIFF/WAVE chunks from the start of a file → {fmt:{format, channels, rate, bits}, data:{offset, size}} | null.
    Chunks are walked by their sizes (padded to even); a "data" that is only text inside another chunk never counts. */
function wavChunks(buf) {
  if (!buf || buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === "fmt " && off + 8 + 16 <= buf.length)
      fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") return fmt ? { fmt, data: { offset: off + 8, size } } : null;
    off += 8 + size + (size & 1);
  }
  return null;
}

/** Where fablecut_audio_track {listen} writes a few seconds of one track: <dir>/<id>-track<n>-<s>s.wav. The media id
    comes from the project, which anyone can edit, so only [A-Za-z0-9_-] of it is kept (an id with nothing left is
    refused) and the resolved path must be inside `dir` (QQ on #177: "../", an absolute path or a backslash in an id
    must never write outside analysis/listen). → the absolute path; throws otherwise. */
function listenPath(dir, id, track, at) {
  const safe = String(id == null ? "" : id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  if (!safe) throw Object.assign(new Error("this media id can't name a file"), { code: "BAD_MEDIA_ID" });
  if (!Number.isInteger(track) || track < 0 || !Number.isFinite(at) || at < 0) throw Object.assign(new Error("bad track or time"), { code: "BAD_LISTEN" });
  const root = path.resolve(dir), out = path.resolve(root, `${safe}-track${track}-${Math.round(at)}s.wav`);
  if (path.dirname(out) !== root) throw Object.assign(new Error("the listening file would be outside analysis/listen"), { code: "BAD_MEDIA_ID" });
  return out;
}

module.exports = { windowArgs, wavChunks, listenPath, CLOCK_FILTER };
