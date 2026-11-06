/* Local FLV compatibility copies. Never rewrite the imported original. */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFile } = require("node:child_process");
const FF = require("./ffmpeg-path"); // the bundled ffmpeg/ffprobe, never PATH (#28)
const { MARK } = require("./flv-readable-range");
const url = file => "/media/" + encodeURIComponent(path.basename(file));
/* H.264 for an FLV that needs transcoding. The bundled LGPL FFmpeg has no libx264 (ADR
   2026-11-02-h264-encoder): the first encoder that works here, graphics card first, then Windows' h264_mf —
   the order exports and proxies use. A listed encoder must encode two frames to count, and the next one is
   tried when it cannot take this file (NVENC, for example, refuses pictures under 145×49). */
const TRANSCODE_H264 = {
  h264_nvenc: ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0", "-pix_fmt", "yuv420p"],
  h264_qsv: ["-c:v", "h264_qsv", "-global_quality", "19", "-pix_fmt", "nv12"],
  h264_amf: ["-c:v", "h264_amf", "-rc", "cqp", "-qp_i", "19", "-qp_p", "19", "-qp_b", "19", "-pix_fmt", "nv12"],
  h264_videotoolbox: ["-c:v", "h264_videotoolbox", "-q:v", "70", "-pix_fmt", "nv12"],
  h264_mf: ["-c:v", "h264_mf", "-rate_control", "quality", "-quality", "75", "-pix_fmt", "nv12"],
};
const H264_ORDER = ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox", "h264_mf"];
const transcodeVideoArgs = encoder => Object.hasOwn(TRANSCODE_H264, encoder) ? TRANSCODE_H264[encoder].slice() : null;
function listEncoders() {
  return new Promise(resolve => execFile(FF.path("ffmpeg"), ["-hide_banner", "-encoders"], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    (error, stdout) => resolve(new Set(error ? [] : String(stdout).split(/\r?\n/).map(l => (l.match(/^\s*V\S*\s+(\S+)/) || [])[1]).filter(Boolean)))));
}
function tryEncoder(encoder) {
  const pix = encoder === "h264_nvenc" ? "yuv420p" : "nv12";
  return new Promise(resolve => execFile(FF.path("ffmpeg"), ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x144:r=30:d=0.1",
    "-frames:v", "2", "-c:v", encoder, "-pix_fmt", pix, "-f", "null", "-"], { windowsHide: true, timeout: 30000 }, error => resolve(!error)));
}
/** The H.264 encoders that work here, in order (empty when none). list/tryEncoder are injectable for tests. */
async function usableH264({ list = listEncoders, tryEncoder: attempt = tryEncoder } = {}) {
  const listed = await list(), usable = [];
  for (const e of H264_ORDER) if (listed.has(e) && await attempt(e)) usable.push(e);
  return usable;
}
const failure = (code, originalSrc, cause) => Object.assign(new Error(code, {cause}), { code, originalSrc });
const PUBLIC_CODES = new Set(["FLV_ENCODER_MISSING", "FLV_PROBE_FAILED", "FLV_STREAMS_UNSUPPORTED", "FLV_TRANSCODE_REQUIRED", "FLV_PREPARATION_FAILED", "FLV_COMPONENT_MISSING", "FLV_DISK_FULL", "FLV_TIMELINE_GAP", "FLV_READABLE_CONSENT_REQUIRED", "FLV_FIX_UNVERIFIED", "FLV_SOURCE_DAMAGED"]);
function publicPreparationError(error) {
  const code = error.code === "ENOSPC" ? "FLV_DISK_FULL" : PUBLIC_CODES.has(error.code) ? error.code : "IMPORT_FAILED";
  return {code, error:code, ...(error.originalSrc ? {originalSrc:error.originalSrc} : {}), ...(error.code === "FLV_READABLE_CONSENT_REQUIRED" ? {range:error.range} : {}),
    ...(error.code === "FLV_TIMELINE_GAP" && error.gaps ? {gaps:error.gaps, fix:error.fix} : {}), ...(error.code === "FLV_FIX_UNVERIFIED" && error.check ? {check:error.check} : {})};
}
/* `onProgress(seconds)` follows ffmpeg's -progress output (out_time_us) when given. A failure carries ffmpeg's last
   error lines (`stderr`), for telling a damaged recording apart; they never reach the page. */
function run(cmd, args, signal, { timeout = 15 * 60 * 1000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let aborted;
    const child = execFile(cmd, args, { signal, windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // Abort can arrive before Windows releases the output file handle.
        if (error?.code === "ABORT_ERR") { aborted = error; return; }
        if (error) reject(Object.assign(error, {missingTool:error.code === "ENOENT", stderr: String(stderr || "").slice(-4000)}));
        else resolve(stdout);
      });
    if (onProgress) child.stdout?.on("data", (d) => { const m = /out_time_us=(\d+)\s*$/m.exec(String(d)); if (m) onProgress(Number(m[1]) / 1e6); });
    child.once("close", () => { if (aborted) reject(aborted); });
  });
}
/* What an FLV becomes (Deja, 2026-11-04; QQ's review of #130 and Deja 2026-11-05 00:16), by source:
   - H.264 + AAC or MP3: the picture is copied (-c:v copy: no quality lost, quick, on the original's timestamps; across a
     break it holds its last frame). The sound is copied only when it is whole AAC: no break in either stream, it does
     not start after the picture, no drift. Otherwise (MP3 always: VV's real recordings) it is re-encoded to AAC with its
     holes filled with silence (FILL_AUDIO), with
     small drops and big breaks alike. decodeAudioData puts the decoded samples back to back and ignores their
     timestamps, so a hole left in the MP4 makes everything after it come early wherever a whole file is decoded in the
     page — the waveform, the analyses, and the export when /api/audio-window fails (QQ: ~245 ms at the end of
     typical-live, 2 s after G-gap2.000s; measured in the app: desktop/flv-export-av-sync-smoke.cjs MONTCLIP_AV_WHOLE=1).
     The export's window (audio-window.js) fills holes on its own; filled here, the file itself is continuous.
   - the picture is re-encoded, with the encoders that work here, only when the codecs cannot go into an MP4 as they
     are (FLV1, or a sound codec other than AAC / MP3, after the transcode consent) or a copy fails the check below; its sound is always filled (Rea on
     ea1c84d9: an MP3 recording's 58 ms hole). With no encoder that is FLV_ENCODER_MISSING, before anything is written.
   Converting breaks (range.fix, or asked for by hand) ends with a check against the original: the same length within
   0.1 s (QQ: ±1 frame), sound against picture within 40 ms; else FLV_FIX_UNVERIFIED. */
// first_pts=0: a sound that starts after the picture gets silence in front, so its first sample is the file's time 0
const FILL_AUDIO = ["-af", "aresample=async=1:min_hard_comp=0.01:first_pts=0", "-c:a", "aac", "-b:a", "192k"];
/* Rea's rule ⑥: the packet scan cannot see a packet whose timestamps are fine but whose bytes are damaged. A
   conversion (breaks fixed, or a re-encode) therefore decodes the whole recording with the decoders' error detection
   turned up and stops on the first error (-xerror); a remuxed picture is decoded alongside into a null output. A
   damaged stretch fails the conversion (FLV_SOURCE_DAMAGED) instead of becoming garbled picture in a file that looks
   fine. A plain import of small drops is not decoded: damage there is caught when the export decodes it (app.js). */
const DECODE_STRICT = ["-err_detect", "explode", "-xerror"];
const DAMAGED = /error while decoding|invalid data found|corrupt|concealing|decode_slice_header error|no frame!|missing picture|illegal|non-existing (pps|sps)|error (in|decoding) (channel|frame|element)|Reserved bit set|Prediction is not allowed|Number of bands|Input buffer exhausted/i;
const damaged = (error) => !error.missingTool && error.code !== "ENOSPC" && DAMAGED.test(String(error.stderr || ""));
/** Every break goes to the log; small drops go nowhere else but a faint mark on the timeline. On stderr: the MCP
 *  server speaks JSON-RPC on stdout. */
function logGaps(file, range, fixing) {
  if (range.drifting) console.error(`[MontClip] FLV ${path.basename(file)}: picture and sound move ${Math.round(range.drift * 1000)} ms apart during the recording (imported on its own clock)`);
  if (!range.gaps.length) return;
  const at = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
  console.error(`[MontClip] FLV ${path.basename(file)}: ${range.gaps.length} break(s)` + (fixing ? ` (converted: ${range.fix.join(", ") || "asked"})` : " (imported as is)") +
    " — " + range.gaps.map((g) => `${g.stream} ${at(g.at)} +${Math.round(g.len * 1000)}ms`).join(", "));
}
/** A conversion's time limit: 1.5 × the recording's length, at least 15 minutes, in whole ms — execFile refuses a
 *  fraction (ERR_OUT_OF_RANGE: every recording over 10 minutes failed to import, VV on europa, 2026-11-06). */
const timeoutMs = (seconds) => Math.ceil(Math.max(15 * 60, 1.5 * (Number(seconds) || 0)) * 1000);
const MAX_LENGTH_DIFF = 0.1, MAX_AV_OFFSET = 0.04;
/** How a conversion compares with the original's readable range (both from scanReadableRange): its length, and how
 *  far sound and picture moved against each other at its start and its end. Silence put in front of a sound that
 *  started late (FILL_AUDIO's first_pts) moves no sound: at the start, only a sound that starts later counts. */
function conversionCheck(range, out) {
  const durationDiff = Math.abs(out.duration - range.duration);
  const a = range.tracks?.audio, v = range.tracks?.video, oa = out.tracks?.audio, ov = out.tracks?.video;
  let avOffset = 0;
  if (a && v) avOffset = !oa || !ov ? Infinity
    : Math.max(Math.max(0, (oa.start - ov.start) - (a.start - v.start)), Math.abs((oa.end - ov.end) - (a.end - v.end)));
  return { ok: durationDiff <= MAX_LENGTH_DIFF && avOffset <= MAX_AV_OFFSET, durationDiff, avOffset };
}
async function checkConversion(range, file, signal) {
  const {streams, format} = JSON.parse(await run(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], signal));
  return conversionCheck(range, await require("./flv-readable-range").scanReadableRange(file, streams, format?.duration, {signal}));
}
async function inspectFlv(file, {signal, readableRange = false, onProgress} = {}) {
  const originalSrc = url(file);
  let streams, format;
  try { ({streams,format} = JSON.parse(await run(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], signal))); }
  catch (error) { throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : "FLV_PROBE_FAILED", originalSrc, error); }
  const video = streams?.filter(s => s.codec_type === "video") || [];
  const audio = streams?.filter(s => s.codec_type === "audio") || [];
  // Refuse silently dropping additional streams; multi-track policy is separate.
  if (video.length !== 1 || audio.length > 1) throw failure("FLV_STREAMS_UNSUPPORTED", originalSrc);
  // MP3 sound counts as compatible: it is always filled into AAC (FILL_AUDIO) while the picture is copied (VV on 064306bd:
  // the five real recordings are H.264 + MP3; Deja, 2026-11-06). Other sound codecs still need the conversion's yes.
  const soundCodec = audio.length ? audio[0].codec_name : null;
  const compatible = video[0].codec_name === "h264" && ["yuv420p", "yuvj420p"].includes(video[0].pix_fmt) && (!audio.length || ["aac", "mp3"].includes(soundCodec));
  const range = readableRange ? await require('./flv-readable-range').scanReadableRange(file,streams,format?.duration,{signal,onProgress}) : undefined;
  return {compatible, hasAudio: audio.length > 0, soundCodec, ...(range?{range}:{})};
}
/** → {src, originalSrc, preparation: "remux" | "transcode", audio: "copy" | "filled" | "none", gapsHeld?: true,
 *  gaps?: [{stream, at, len, big}], drift?: seconds}. preparation: whether the picture was copied or re-encoded; audio:
 *  whether the sound was copied or re-encoded with its holes filled; gapsHeld: this import converted breaks (range.fix,
 *  or fixGaps); gaps: every break (seconds, from the file's first packet), small or big, for the timeline's marks;
 *  drift: how far picture and sound move apart during the recording, when over 40 ms (left as it is, logged). */
async function prepareMedia(file, { allowTranscode = false, acceptReadable = false, fixGaps = false, signal, chooseEncoder, onProgress, onPhase } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  const {compatible, hasAudio, soundCodec, range} = await inspectFlv(file, {signal, readableRange:true});
  // Shared by REST and MCP as well as native snapshot preparation. Small drops (every break ≤ 0.5 s, picture and sound
  // within 40 ms) import as they are, without a question. Anything more is converted, with the user's yes: fixGaps
  // (〔帮我转〕), or allowTranscode — the app's yes to converting (Deja, 2026-11-04; range.fix says why).
  if (range.fix.length && fixGaps !== true && allowTranscode !== true) throw Object.assign(failure("FLV_TIMELINE_GAP", originalSrc), {gaps: range.gaps, fix: range.fix, range});
  if (range.needsConsent && acceptReadable !== true) throw Object.assign(failure("FLV_READABLE_CONSENT_REQUIRED", originalSrc), {range});
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", originalSrc);
  // the picture is re-encoded only when it cannot go into an MP4 as it is
  const reencode = !compatible;
  // the sound is filled unless it is whole AAC (see above): MP3, a break in either stream, a sound starting after the
  // picture, drift
  const a = range.tracks?.audio, v = range.tracks?.video;
  const fill = hasAudio && (reencode || soundCodec !== "aac" || range.gaps.length > 0 || range.drifting || !!(a && v && a.start - v.start > MARK));
  let encoders = null;
  const pick = async () => (encoders ??= [].concat(await (chooseEncoder || usableH264)()).filter(Boolean));
  if (reencode && !(await pick()).length) throw failure("FLV_ENCODER_MISSING", originalSrc);
  const fixing = range.fix.length > 0 || fixGaps === true, strict = fixing || reencode;
  logGaps(file, range, fixing);
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  const progress = onProgress ? ["-progress", "pipe:1", "-stats_period", "1"] : [];
  // a long recording that has to be re-encoded can take longer than 15 minutes
  const timeout = timeoutMs(range.duration);
  const args = (encoder) => ["-v", "error", "-nostdin", "-n", ...progress, ...(strict ? DECODE_STRICT : []), "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
    ...(encoder ? transcodeVideoArgs(encoder) : ["-c:v", "copy"]), ...(!hasAudio ? [] : fill || encoder ? FILL_AUDIO : ["-c:a", "copy"]),
    "-movflags", "+faststart", part,
    // a remuxed picture is decoded too, into nothing, so damage in it stops the conversion
    ...(strict && !encoder ? ["-map", "0:v:0", "-f", "null", "-"] : [])];
  /** Writes `part`: [null] remuxes; a list of encoders re-encodes with the first that can take the file. */
  async function write(list) {
    for (let i = 0; ; i++) {
      try { await run(FF.path("ffmpeg"), args(list[i]), signal, { timeout, onProgress: onProgress && (s => onProgress(Math.min(1, s / range.duration))) }); return; }
      catch (error) {
        // this encoder could not take the file: the next one, from a clean start; anything else fails as before
        if (!list[i] || i + 1 >= list.length || error.missingTool || error.code === "ENOSPC" || signal?.aborted || damaged(error)) throw error;
        try { fs.rmSync(part, { force: true }); } catch { /* the next attempt refuses an existing file with -n */ }
      }
    }
  }
  let reencoded = reencode;
  try {
    await write(reencode ? encoders : [null]);
    if (!fs.statSync(part).size) throw new Error("Empty output");
    if (fixing) {
      onPhase && onPhase("check");
      let check = await checkConversion(range, part, signal);
      if (!check.ok && !reencoded) {
        // the remux did not hold: re-encoded once, with the encoders that work here
        if (!(await pick()).length) throw failure("FLV_ENCODER_MISSING", originalSrc);
        try { fs.rmSync(part, { force: true }); } catch { /* the re-encode refuses an existing file with -n */ }
        onPhase && onPhase("prepare");
        await write(encoders); reencoded = true;
        onPhase && onPhase("check");
        check = await checkConversion(range, part, signal);
      }
      if (!check.ok) throw Object.assign(failure("FLV_FIX_UNVERIFIED", originalSrc), {check});
    }
    fs.renameSync(part, out);
  } catch (error) {
    try { fs.rmSync(part, { force: true }); } catch { /* preserve the original failure */ }
    if (error.code === "FLV_FIX_UNVERIFIED" || error.code === "FLV_ENCODER_MISSING") throw error;
    if (strict && damaged(error)) throw failure("FLV_SOURCE_DAMAGED", originalSrc, error);
    throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : error.code === "ENOSPC" ? "FLV_DISK_FULL" : "FLV_PREPARATION_FAILED", originalSrc, error);
  }
  return { src: url(out), originalSrc, preparation: reencoded ? "transcode" : "remux", audio: !hasAudio ? "none" : fill || reencoded ? "filled" : "copy",
    ...(fixing ? {gapsHeld: true} : {}), ...(range.gaps.length ? {gaps: range.gaps} : {}), ...(range.drifting ? {drift: Math.round(range.drift * 1000) / 1000} : {}) };
}
module.exports = { timeoutMs, prepareMedia, inspectFlv, publicPreparationError, PUBLIC_CODES, usableH264, transcodeVideoArgs, conversionCheck };
