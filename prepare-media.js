/* Local FLV compatibility copies. Never rewrite the imported original. */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFile } = require("node:child_process");
const FF = require("./ffmpeg-path"); // the bundled ffmpeg/ffprobe, never PATH (#28)
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
/* What an FLV becomes (Deja, 2026-11-04), by source:
   - H.264 + AAC: a remux (-c copy, picture and sound both), with small drops or big breaks alike. The MP4 keeps the
     original's timestamps: across a break the picture holds its last frame and there is no sound. Nothing is
     re-encoded or re-stamped, so no quality is lost, it is quick, and picture and sound stay where they were.
   - re-encoded, with the encoders that work here (across a break the sound is silence, FILL_AUDIO), only when: the
     codecs cannot go into an MP4 as they are (FLV1, MP3…, after the transcode consent); picture and sound sit more
     than 40 ms apart by their packet times (range.fix "drift"); or a remux fails the check below. With no encoder
     that is FLV_ENCODER_MISSING, before anything is written.
   Converting breaks (range.fix, or asked for by hand) ends with a check against the original: the same length within
   1 s, sound against picture within 40 ms; else FLV_FIX_UNVERIFIED. */
const FILL_AUDIO = ["-af", "aresample=async=1:min_hard_comp=0.01", "-c:a", "aac", "-b:a", "192k"];
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
  if (!range.gaps.length) return;
  const at = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`;
  console.error(`[MontClip] FLV ${path.basename(file)}: ${range.gaps.length} break(s)` + (fixing ? ` (converted: ${range.fix.join(", ") || "asked"})` : " (imported as is)") +
    " — " + range.gaps.map((g) => `${g.stream} ${at(g.at)} +${Math.round(g.len * 1000)}ms`).join(", "));
}
const MAX_LENGTH_DIFF = 1, MAX_AV_OFFSET = 0.04;
/** How a conversion compares with the original's readable range (both from scanReadableRange): its length, and how
 *  far sound and picture moved against each other at its start and its end. */
function conversionCheck(range, out) {
  const durationDiff = Math.abs(out.duration - range.duration);
  const a = range.tracks?.audio, v = range.tracks?.video, oa = out.tracks?.audio, ov = out.tracks?.video;
  let avOffset = 0;
  if (a && v) avOffset = !oa || !ov ? Infinity
    : Math.max(Math.abs((oa.start - ov.start) - (a.start - v.start)), Math.abs((oa.end - ov.end) - (a.end - v.end)));
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
  const compatible = video[0].codec_name === "h264" && ["yuv420p", "yuvj420p"].includes(video[0].pix_fmt) && (!audio.length || audio[0].codec_name === "aac");
  const range = readableRange ? await require('./flv-readable-range').scanReadableRange(file,streams,format?.duration,{signal,onProgress}) : undefined;
  return {compatible, ...(range?{range}:{})};
}
/** → {src, originalSrc, preparation: "remux" | "transcode", gapsHeld?: true, gaps?: [{stream, at, len, big}]}.
 *  gapsHeld: this import converted breaks (range.fix, or fixGaps); gaps: every break (seconds, from the file's first
 *  packet), small or big, for the timeline's marks. */
async function prepareMedia(file, { allowTranscode = false, acceptReadable = false, fixGaps = false, signal, chooseEncoder, onProgress, onPhase } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  const {compatible, range} = await inspectFlv(file, {signal, readableRange:true});
  // Shared by REST and MCP as well as native snapshot preparation. Small drops (every break ≤ 0.5 s, picture and sound
  // within 40 ms) import as they are, without a question. Anything more is converted, with the user's yes: fixGaps
  // (〔帮我转〕), or allowTranscode — the app's yes to converting (Deja, 2026-11-04; range.fix says why).
  if (range.fix.length && fixGaps !== true && allowTranscode !== true) throw Object.assign(failure("FLV_TIMELINE_GAP", originalSrc), {gaps: range.gaps, fix: range.fix, range});
  if (range.needsConsent && acceptReadable !== true) throw Object.assign(failure("FLV_READABLE_CONSENT_REQUIRED", originalSrc), {range});
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", originalSrc);
  // picture and sound already apart by their packet times: a remux would keep that, so this is re-encoded
  const reencode = !compatible || range.fix.includes("drift");
  let encoders = null;
  const pick = async () => (encoders ??= [].concat(await (chooseEncoder || usableH264)()).filter(Boolean));
  if (reencode && !(await pick()).length) throw failure("FLV_ENCODER_MISSING", originalSrc);
  const fixing = range.fix.length > 0 || fixGaps === true, strict = fixing || reencode;
  logGaps(file, range, fixing);
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  const progress = onProgress ? ["-progress", "pipe:1", "-stats_period", "1"] : [];
  // a long recording that has to be re-encoded can take longer than 15 minutes
  const timeout = Math.max(15 * 60, 1.5 * range.duration) * 1000;
  const args = (encoder) => ["-v", "error", "-nostdin", "-n", ...progress, ...(strict ? DECODE_STRICT : []), "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
    ...(encoder ? [...transcodeVideoArgs(encoder), ...(fixing ? FILL_AUDIO : ["-c:a", "aac", "-b:a", "192k"])] : ["-c", "copy"]),
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
  return { src: url(out), originalSrc, preparation: reencoded ? "transcode" : "remux", ...(fixing ? {gapsHeld: true} : {}), ...(range.gaps.length ? {gaps: range.gaps} : {}) };
}
module.exports = { prepareMedia, inspectFlv, publicPreparationError, PUBLIC_CODES, usableH264, transcodeVideoArgs, conversionCheck };
