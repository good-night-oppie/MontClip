/* Reading a file's sound as raw samples, on the media's own clock (Rea on #165, 2026-11-05). One function for every
   reader that has to line its samples up with media time: transcription (asr-local.js) and #149's /api/audio-window.

   Two things went wrong before, both measured by Rea on 7 sources × 4 ways of reading:
   - read whole, sample 0 was the sound track's first sample, not media time 0, so a track that starts late put
     everything early by that much (−55 ms, −500 ms);
   - read from a seek near the start (`-ss 0`, where a recording's first clip almost always is), ffmpeg's input seek
     missed: −21 ms on AAC (its priming left in), −105 ms when the picture starts late, and an FLV lost its first
     ~1.2 s of sound.
   So: no -ss before SEEK_MIN (read from the start, `-t to`, and the caller skips to `from` itself), and always
   `-af aresample=async=1:first_pts=0`, which pads a late start with silence so sample 0 is media time 0. All 28 of
   Rea's readings then agree within 0.1 ms; what is left (MP3 +25 ms, AAC +21 ms) belongs to the codec and is the same
   whichever way the file is read.

     readAudioArgs({file, from?, to?, rate = 16000, channels = 1, format = "s16le"})
       → {args, start}   args: ffmpeg's arguments after the program name (output to stdout, "-");
                         start: the media time of the first sample it gives (0, or `from` when it seeks).
   Zero dependencies. */
"use strict";

/** Below this, a window is read from the start of the file instead of with -ss (Rea: 3 s). */
const SEEK_MIN = 3;
const CLOCK = "aresample=async=1:first_pts=0";
const CODECS = { s16le: "pcm_s16le", f32le: "pcm_f32le" };

function readAudioArgs({ file, from = null, to = null, rate = 16000, channels = 1, format = "s16le" } = {}) {
  const f = from == null ? 0 : Math.max(0, +from || 0);
  const seek = from != null && f >= SEEK_MIN;
  const start = seek ? f : 0;
  const t = to == null ? null : Math.max(0, +to - start);
  return {
    start,
    args: ["-nostdin", "-v", "error", ...(seek ? ["-ss", String(f)] : []), "-i", file, ...(t != null ? ["-t", String(Math.round(t * 1e6) / 1e6)] : []),
      "-vn", "-af", CLOCK, "-ac", String(channels), "-ar", String(rate), "-f", format, "-acodec", CODECS[format] || "pcm_s16le", "-"],
  };
}

module.exports = { readAudioArgs, SEEK_MIN, CLOCK };
