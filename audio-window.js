/* Part of a file's audio for the export mix (GET /api/audio-window): the ffmpeg arguments and a WAV header reader.

   The window is on the container's clock: output sample 0 is container time `from`, even when the audio stream starts
   later than the video (`aresample=async=1:first_pts=0` pads the gap with silence) — QQ, 2026-11-05: audio 80 ms late
   put the beep at 5.000 / 5.021 s without it, at 5.080 s (where <video> and the container have it) with it.
   ffmpeg writes the WAV to a file, not a pipe, so its header carries the real lengths and the server never holds the
   samples in memory; the header is then walked chunk by chunk (never searched for "data"). */
"use strict";

/** ffmpeg arguments: the first audio stream from `from` for `dur` seconds, f32 WAV at 48 kHz, its own channels. */
function windowArgs(file, from, dur, out) {
  return ["-hide_banner", "-v", "error", "-y", "-ss", from.toFixed(6), "-t", dur.toFixed(6), "-i", file,
    "-map", "0:a:0", "-vn", "-sn", "-dn", "-af", "aresample=async=1:first_pts=0", "-ar", "48000", "-c:a", "pcm_f32le", "-f", "wav", out];
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

module.exports = { windowArgs, wavChunks };
