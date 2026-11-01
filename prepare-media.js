/* Local FLV compatibility copies. Never rewrite the imported original. */
"use strict";
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { execFile } = require("child_process");
const { probeTimeline } = require("./flv-timeline");
const url = file => "/media/" + encodeURIComponent(path.basename(file));
const failure = (code, message, originalSrc) => Object.assign(new Error(message), { code, originalSrc });
function run(cmd, args) {
  return new Promise((resolve, reject) => execFile(cmd, args, { windowsHide: true, timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
}
async function prepareMedia(file, { allowTranscode = false } = {}) {
  const originalSrc = url(file);
  if (path.extname(file).toLowerCase() !== ".flv") return { src: originalSrc };
  let streams;
  try { streams = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", file])).streams; }
  catch { throw failure("FLV_PROBE_FAILED", "无法探测 FLV。请检查 FFprobe 和文件。 / Cannot probe FLV. Check FFprobe and the file.", originalSrc); }
  const video = streams?.filter(s => s.codec_type === "video") || [];
  const audio = streams?.filter(s => s.codec_type === "audio") || [];
  // Refuse silently dropping additional streams; multi-track policy is separate.
  if (video.length !== 1 || audio.length > 1) throw failure("FLV_STREAMS_UNSUPPORTED", "暂不支持此 FLV 轨道结构，原片已保留。 / Unsupported FLV track layout; original retained.", originalSrc);
  let timeline;
  const [rateNum, rateDen] = String(video[0].avg_frame_rate).split("/").map(Number);
  const fps = rateNum / rateDen;
  // Older FLV1 packets omit durations. Nominal cadence is only a gap guard,
  // never an authoritative range/end timestamp (the inspector marks estimates).
  const fallbackDurations = Number.isFinite(fps) && fps > 0 && fps <= 1000 ? {[video[0].index]:1/fps} : {};
  try { timeline = await probeTimeline(file, fallbackDurations); }
  catch { throw failure("FLV_TIMELINE_UNVERIFIED", "无法可靠读取 FLV 时间轴，原片已保留，暂不导入。 / Cannot verify the FLV timeline; original retained, import stopped.", originalSrc); }
  // 5 ms allows FLV millisecond quantization and rounded AAC packet durations.
  // It is not an AV quality tolerance or a claim that smaller gaps are rendered correctly.
  if (timeline.streams.some(s => s.maxGap > 0.005)) throw failure("FLV_TIMELINE_GAP", "此 FLV 含时间戳空洞。当前尚不能保证画面保持、音频补静音与导出一致，已保留原片并停止导入。 / This FLV has timestamp gaps. Consistent held video, silent audio and export are not yet supported; original retained, import stopped.", originalSrc);
  const compatible = video[0].codec_name === "h264" && ["yuv420p", "yuvj420p"].includes(video[0].pix_fmt) && (!audio.length || audio[0].codec_name === "aac");
  if (!compatible && allowTranscode !== true) throw failure("FLV_TRANSCODE_REQUIRED", "此 FLV 需要兼容转码（可能改变画质），原片保持不变。 / This FLV needs compatibility transcoding (quality may change); the original stays unchanged.", originalSrc);
  const out = path.join(path.dirname(file), "compat-" + randomUUID() + ".mp4");
  const part = out + ".part.mp4";
  try {
    await run("ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
      ...(compatible ? ["-c", "copy"] : ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"]),
      "-movflags", "+faststart", part]);
    if (!fs.statSync(part).size) throw new Error("Empty output");
    fs.renameSync(part, out);
  } catch {
    fs.rmSync(part, { force: true });
    throw failure("FLV_PREPARATION_FAILED", "FLV 兼容处理失败，原片已保留。请检查 FFmpeg 或可用空间后重试。 / FLV preparation failed; original retained. Check FFmpeg or free space and retry.", originalSrc);
  }
  return { src: url(out), originalSrc, preparation: compatible ? "remux" : "transcode" };
}
module.exports = { prepareMedia };
