/* Experimental packet clock. Not yet used for registered media durations.
 * DTS establishes decode continuity; PTS bounds each continuous presentation span.
 * Keep source-clock spans until every consumer can use the same time mapping. */
"use strict";
const fs = require("node:fs"), { execFile, spawn } = require("node:child_process");
const FF = require("./ffmpeg-path");
function primaryStream(streams) {
  const video = streams.filter(s => s.codec_type === "video" && !s.disposition?.attached_pic);
  const candidates = video.length ? video : streams.filter(s => s.codec_type === "audio");
  return candidates.find(s => s.disposition?.default) || candidates[0];
}
function accumulator({ gapThreshold = 2, maxSegments = 10000 } = {}) {
  const segments = [], gaps = [];
  let segment, previous, packets = 0, failure;
  return {
    add({ pts, dts, duration = 0 }) {
      if (failure) return;
      const clock = Number.isFinite(dts) ? dts : pts;
      if (!Number.isFinite(clock)) return;
      const presentation = Number.isFinite(pts) ? pts : clock;
      const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
      // A reset creates overlapping source coordinates: no unambiguous inverse exists.
      if (previous != null && clock < previous - 1e-6) { failure = "backward DTS: source normalization required"; return; }
      if (!segment || clock - segment.dtsEnd > gapThreshold) {
        if (segments.length >= maxSegments) { failure = "too many timestamp discontinuities"; return; }
        if (segment) gaps.push({ start: segment.dtsEnd, end: clock, duration: clock - segment.dtsEnd });
        segment = { dtsStart: clock, dtsEnd: clock + length, sourceStart: presentation, sourceEnd: presentation + length };
        segments.push(segment);
      } else {
        segment.dtsEnd = Math.max(segment.dtsEnd, clock + length);
        segment.sourceStart = Math.min(segment.sourceStart, presentation);
        segment.sourceEnd = Math.max(segment.sourceEnd, presentation + length);
      }
      previous = clock; packets++;
    },
    finish() {
      if (failure) throw new Error(failure);
      return { packets, segments, gaps, timestampJump: gaps.length > 0 };
    },
  };
}
const number = v => v != null && v !== "" && v !== "N/A" && Number.isFinite(Number(v)) ? Number(v) : undefined;
async function scanFile(file, { timeoutMs } = {}) {
  const st = await fs.promises.stat(file);
  const streams = await new Promise((resolve, reject) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-of", "json", file],
      { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 << 20 }, (err, out) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(out).streams || []); } catch (e) { reject(e); }
      });
  });
  const stream = primaryStream(streams);
  if (!stream) throw new Error("no primary audio/video stream");
  const budget = timeoutMs ?? Math.min(180000, 20000 + Math.ceil(st.size / 1e9) * 15000);
  return new Promise((resolve, reject) => {
    const scan = accumulator();
    const child = spawn(FF.path("ffprobe"), ["-v", "error", "-select_streams", String(stream.index),
      "-show_entries", "packet=pts_time,dts_time,duration_time", "-of", "compact=p=0", file],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let rest = "", failure;
    const fail = message => { failure = new Error(message); child.kill(); };
    const timer = setTimeout(() => fail("packet scan timed out; partial scan discarded"), budget);
    function line(text) {
      const fields = Object.fromEntries(text.split("|").map(kv => kv.split("=")));
      scan.add({ pts: number(fields.pts_time), dts: number(fields.dts_time), duration: number(fields.duration_time) });
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      // Retain at most one incomplete line, not a packet-sized JSON array.
      const lines = (rest + chunk).split(/\r?\n/); rest = lines.pop();
      if (rest.length > 4096 || lines.some(l => l.length > 4096)) return fail("invalid packet record");
      for (const text of lines) line(text);
    });
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || signal || code !== 0) return reject(failure || new Error("packet scan incomplete"));
      try {
        if (rest) line(rest);
        const result = scan.finish();
        if (!result.packets) throw new Error("no usable packet timestamps");
        resolve({ ...result, streamIndex: stream.index, kind: stream.codec_type });
      } catch (e) { reject(e); }
    });
  });
}
module.exports = { primaryStream, accumulator, scanFile };
