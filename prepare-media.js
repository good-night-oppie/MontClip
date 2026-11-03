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
const PUBLIC_CODES = new Set(["FLV_ENCODER_MISSING", "FLV_PROBE_FAILED", "FLV_STREAMS_UNSUPPORTED", "FLV_TRANSCODE_REQUIRED", "FLV_PREPARATION_FAILED", "FLV_COMPONENT_MISSING", "FLV_DISK_FULL", "FLV_TIMELINE_GAP", "FLV_READABLE_CONSENT_REQUIRED"]);
function publicPreparationError(error) {
  const code = error.code === "ENOSPC" ? "FLV_DISK_FULL" : PUBLIC_CODES.has(error.code) ? error.code : "IMPORT_FAILED";
  return {code, error:code, ...(error.originalSrc ? {originalSrc:error.originalSrc} : {}), ...(error.code === "FLV_READABLE_CONSENT_REQUIRED" ? {range:error.range} : {})};
}
function run(cmd, args, signal) {
  return new Promise((resolve, reject) => {
    let aborted;
    const child = execFile(cmd, args, { signal, windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        // Abort can arrive before Windows releases the output file handle.
        if (error?.code === "ABORT_ERR") { aborted = error; return; }
        if (error) reject(Object.assign(error, {missingTool:error.code === "ENOENT"}));
        else resolve(stdout);
      });
    child.once("close", () => { if (aborted) reject(aborted); });
  });
}
async function inspectFlv(file, {signal, readableRange = false} = {}) {
  const originalSrc = url(file);
  let streams, format;
  try { ({streams,format} = JSON.parse(await run(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], signal))); }
  catch (error) { throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : "FLV_PROBE_FAILED", originalSrc, error); }
  const video = streams?.filter(s => s.codec_type === "video") || [];
  const audio = streams?.filter(s => s.codec_type === "audio") || [];
  // Refuse silently dropping additional streams; multi-track policy is separate.
  if (video.length !== 1 || audio.length > 1) throw failure("FLV_STREAMS_UNSUPPORTED", originalSrc);
  const compatible = video[0].codec_name === "h264" && ["yuv420p", "yuvj420p"].includes(video[0].pix_fmt) && (!audio.length || audio[0].codec_name === "aac");
  const range = readableRange ? await require('./flv-readable-range').scanReadableRange(file,streams,format?.duration,{signal}) : undefined;
  return {compatible, ...(range?{range}:{})};
}
async function prepareMedia(file, { allowTranscode = false, acceptReadable = false, signal, chooseEncoder } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  const {compatible, range} = await inspectFlv(file, {signal, readableRange:true});
  // Shared by REST and MCP as well as native snapshot preparation. Codec
  // consent cannot authorize collapsing presentation gaps. The 5ms threshold
  // matches native inspection: clock quantization, not an AV quality claim.
  if (range.maxGap > 0.005) throw failure("FLV_TIMELINE_GAP", originalSrc);
  if (range.needsConsent && acceptReadable !== true) throw Object.assign(failure("FLV_READABLE_CONSENT_REQUIRED", originalSrc), {range});
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", originalSrc);
  const encoders = compatible ? [null] : [].concat(await (chooseEncoder || usableH264)()).filter(Boolean);
  if (!compatible && !encoders.length) throw failure("FLV_ENCODER_MISSING", originalSrc);
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  try {
    for (let i = 0; ; i++) {
      try {
        await run(FF.path("ffmpeg"), ["-v", "error", "-nostdin", "-n", "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
          ...(compatible ? ["-c", "copy"] : [...transcodeVideoArgs(encoders[i]), "-c:a", "aac", "-b:a", "192k"]),
          "-movflags", "+faststart", part], signal);
        break;
      } catch (error) {
        // this encoder could not take the file: the next one, from a clean start; anything else fails as before
        if (compatible || i + 1 >= encoders.length || error.missingTool || error.code === "ENOSPC" || signal?.aborted) throw error;
        try { fs.rmSync(part, { force: true }); } catch { /* the next attempt refuses an existing file with -n */ }
      }
    }
    if (!fs.statSync(part).size) throw new Error("Empty output");
    fs.renameSync(part, out);
  } catch (error) {
    try { fs.rmSync(part, { force: true }); } catch { /* preserve the original failure */ }
    throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : error.code === "ENOSPC" ? "FLV_DISK_FULL" : "FLV_PREPARATION_FAILED", originalSrc, error);
  }
  return { src: url(out), originalSrc, preparation: compatible ? "remux" : "transcode" };
}
module.exports = { prepareMedia, inspectFlv, publicPreparationError, PUBLIC_CODES, usableH264, transcodeVideoArgs };
