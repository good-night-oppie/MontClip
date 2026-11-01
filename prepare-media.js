/* Local FLV compatibility copies. Never rewrite the imported original. */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFile } = require("node:child_process");
const url = file => "/media/" + encodeURIComponent(path.basename(file));
const failure = (code, originalSrc, cause) => Object.assign(new Error(code, {cause}), { code, originalSrc });
const PUBLIC_CODES = new Set(["FLV_PROBE_FAILED", "FLV_STREAMS_UNSUPPORTED", "FLV_TRANSCODE_REQUIRED", "FLV_PREPARATION_FAILED", "FLV_COMPONENT_MISSING", "FLV_DISK_FULL", "FLV_TIMELINE_GAP", "FLV_READABLE_CONSENT_REQUIRED"]);
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
  try { ({streams,format} = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], signal))); }
  catch (error) { throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : "FLV_PROBE_FAILED", originalSrc, error); }
  const video = streams?.filter(s => s.codec_type === "video") || [];
  const audio = streams?.filter(s => s.codec_type === "audio") || [];
  // Refuse silently dropping additional streams; multi-track policy is separate.
  if (video.length !== 1 || audio.length > 1) throw failure("FLV_STREAMS_UNSUPPORTED", originalSrc);
  const compatible = video[0].codec_name === "h264" && ["yuv420p", "yuvj420p"].includes(video[0].pix_fmt) && (!audio.length || audio[0].codec_name === "aac");
  const range = readableRange ? await require('./flv-readable-range').scanReadableRange(file,streams,format?.duration,{signal}) : undefined;
  return {compatible, ...(range?{range}:{})};
}
async function prepareMedia(file, { allowTranscode = false, acceptReadable = false, signal } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  const {compatible, range} = await inspectFlv(file, {signal, readableRange:true});
  // Shared by REST and MCP as well as native snapshot preparation. Codec
  // consent cannot authorize collapsing presentation gaps. The 5ms threshold
  // matches native inspection: clock quantization, not an AV quality claim.
  if (range.maxGap > 0.005) throw failure("FLV_TIMELINE_GAP", originalSrc);
  if (range.needsConsent && acceptReadable !== true) throw Object.assign(failure("FLV_READABLE_CONSENT_REQUIRED", originalSrc), {range});
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", originalSrc);
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  try {
    await run("ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
      ...(compatible ? ["-c", "copy"] : ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"]),
      "-movflags", "+faststart", part], signal);
    if (!fs.statSync(part).size) throw new Error("Empty output");
    fs.renameSync(part, out);
  } catch (error) {
    try { fs.rmSync(part, { force: true }); } catch { /* preserve the original failure */ }
    throw failure(error.missingTool ? "FLV_COMPONENT_MISSING" : error.code === "ENOSPC" ? "FLV_DISK_FULL" : "FLV_PREPARATION_FAILED", originalSrc, error);
  }
  return { src: url(out), originalSrc, preparation: compatible ? "remux" : "transcode" };
}
module.exports = { prepareMedia, inspectFlv, publicPreparationError };
