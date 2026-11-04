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
const PUBLIC_CODES = new Set(["FLV_ENCODER_MISSING", "FLV_PROBE_FAILED", "FLV_STREAMS_UNSUPPORTED", "FLV_TRANSCODE_REQUIRED", "FLV_PREPARATION_FAILED", "FLV_COMPONENT_MISSING", "FLV_DISK_FULL", "FLV_TIMELINE_GAP", "FLV_READABLE_CONSENT_REQUIRED", "FLV_FIX_UNVERIFIED"]);
function publicPreparationError(error) {
  const code = error.code === "ENOSPC" ? "FLV_DISK_FULL" : PUBLIC_CODES.has(error.code) ? error.code : "IMPORT_FAILED";
  return {code, error:code, ...(error.originalSrc ? {originalSrc:error.originalSrc} : {}), ...(error.code === "FLV_READABLE_CONSENT_REQUIRED" ? {range:error.range} : {}),
    ...(error.code === "FLV_TIMELINE_GAP" && error.gaps ? {gaps:error.gaps} : {}), ...(error.code === "FLV_FIX_UNVERIFIED" && error.check ? {check:error.check} : {})};
}
/* `onProgress(seconds)` follows ffmpeg's -progress output (out_time_us) when given. */
function run(cmd, args, signal, { timeout = 15 * 60 * 1000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let aborted;
    const child = execFile(cmd, args, { signal, windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        // Abort can arrive before Windows releases the output file handle.
        if (error?.code === "ABORT_ERR") { aborted = error; return; }
        if (error) reject(Object.assign(error, {missingTool:error.code === "ENOENT"}));
        else resolve(stdout);
      });
    if (onProgress) child.stdout?.on("data", (d) => { const m = /out_time_us=(\d+)\s*$/m.exec(String(d)); if (m) onProgress(Number(m[1]) / 1e6); });
    child.once("close", () => { if (aborted) reject(aborted); });
  });
}
/* A recording with breaks (FLV_TIMELINE_GAP) is converted on the original's clock: the picture holds its last frame
   across a break and the sound is re-encoded with silence there (aresample async), so everything after a break stays
   at its time — the danmaku too. Copying the AAC as it is would leave the MP4 claiming sound it does not have, and a
   player then runs the sound early. The result is checked against the original before it is used (Deja, 2026-11-04):
   the same length within 1 s, sound against picture within 40 ms. */
const FILL_AUDIO = ["-af", "aresample=async=1:min_hard_comp=0.01", "-c:a", "aac", "-b:a", "192k"];
const MAX_LENGTH_DIFF = 1, MAX_AV_OFFSET = 0.04;
/** How a conversion compares with the original's readable range (both from scanReadableRange). */
function conversionCheck(range, out, outStreams = []) {
  const durationDiff = Math.abs(out.duration - range.duration);
  const a = range.tracks?.audio, v = range.tracks?.video, oa = out.tracks?.audio, ov = out.tracks?.video;
  let avOffset = 0;
  if (a && v) {
    if (!oa || !ov) avOffset = Infinity;
    else {
      avOffset = Math.max(Math.abs((oa.start - ov.start) - (a.start - v.start)), Math.abs((oa.end - ov.end) - (a.end - v.end)));
      // sound the track claims but does not have (AAC: 1024 samples a packet) plays early in a player
      const rate = Number(outStreams.find(s => s.codec_type === "audio")?.sample_rate);
      if (rate > 0) avOffset = Math.max(avOffset, (oa.end - oa.start) - oa.packets * 1024 / rate);
    }
  }
  return { ok: durationDiff <= MAX_LENGTH_DIFF && avOffset <= MAX_AV_OFFSET, durationDiff, avOffset };
}
async function checkConversion(range, file, signal) {
  const {streams, format} = JSON.parse(await run(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], signal));
  return conversionCheck(range, await require("./flv-readable-range").scanReadableRange(file, streams, format?.duration, {signal}), streams);
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
async function prepareMedia(file, { allowTranscode = false, acceptReadable = false, fixGaps = false, signal, chooseEncoder, onProgress, onPhase } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  const {compatible, range} = await inspectFlv(file, {signal, readableRange:true});
  // Shared by REST and MCP as well as native snapshot preparation. A break in the recording (more than the 5 ms of
  // clock quantization) is converted on the original's clock only with the user's yes (fixGaps); codec consent alone
  // does not convert it.
  if (range.gaps.length && fixGaps !== true) throw Object.assign(failure("FLV_TIMELINE_GAP", originalSrc), {gaps: range.gaps, range});
  if (range.needsConsent && acceptReadable !== true) throw Object.assign(failure("FLV_READABLE_CONSENT_REQUIRED", originalSrc), {range});
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", originalSrc);
  const encoders = compatible ? [null] : [].concat(await (chooseEncoder || usableH264)()).filter(Boolean);
  if (!compatible && !encoders.length) throw failure("FLV_ENCODER_MISSING", originalSrc);
  // also asked for by hand ("Convert to MP4 and import") after a plain remux failed
  const convert = fixGaps === true;
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  const progress = onProgress ? ["-progress", "pipe:1", "-stats_period", "1"] : [];
  // a long recording that has to be re-encoded can take longer than 15 minutes
  const timeout = Math.max(15 * 60, 1.5 * range.duration) * 1000;
  try {
    for (let i = 0; ; i++) {
      try {
        await run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-n", ...progress, "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
          ...(compatible && !convert ? ["-c", "copy"] : [...(compatible ? ["-c:v", "copy"] : transcodeVideoArgs(encoders[i])),
            ...(convert ? FILL_AUDIO : ["-c:a", "aac", "-b:a", "192k"])]),
          "-movflags", "+faststart", part], signal, { timeout, onProgress: onProgress && (s => onProgress(Math.min(1, s / range.duration))) });
        break;
      } catch (error) {
        // this encoder could not take the file: the next one, from a clean start; anything else fails as before
        if (compatible || i + 1 >= encoders.length || error.missingTool || error.code === "ENOSPC" || signal?.aborted) throw error;
        try { fs.rmSync(part, { force: true }); } catch { /* the next attempt refuses an existing file with -n */ }
      }
    }
    if (!fs.statSync(part).size) throw new Error("Empty output");
    if (convert) {
      onPhase && onPhase("check");
      const check = await checkConversion(range, part, signal);
      if (!check.ok) throw Object.assign(failure("FLV_FIX_UNVERIFIED", originalSrc), {check});
    }
    fs.renameSync(part, out);
  } catch (error) {
    try { fs.rmSync(part, { force: true }); } catch { /* preserve the original failure */ }
    if (error.code === "FLV_FIX_UNVERIFIED") throw error;
    throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : error.code === "ENOSPC" ? "FLV_DISK_FULL" : "FLV_PREPARATION_FAILED", originalSrc, error);
  }
  return { src: url(out), originalSrc, preparation: convert ? "convert" : compatible ? "remux" : "transcode", ...(range.gaps.length ? {gaps: range.gaps} : {}) };
}
module.exports = { prepareMedia, inspectFlv, publicPreparationError, PUBLIC_CODES, usableH264, transcodeVideoArgs, conversionCheck };
