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
  let segment, previous, packets = 0, missingDurations = 0, failure;
  return {
    add({ pts, dts, duration = 0 }) {
      if (failure) return;
      const clock = Number.isFinite(dts) ? dts : pts;
      if (!Number.isFinite(clock)) return;
      const presentation = Number.isFinite(pts) ? pts : clock;
      const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
      if (!length) missingDurations++;
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
      return { packets, segments, gaps, missingDurations, timestampJump: gaps.length > 0 };
    },
  };
}
function coverage(scan) {
  if (scan.missingDurations) throw new Error("unknown packet duration: coverage is not established");
  const ranges = [];
  let end = 0, previousEnd = -Infinity;
  for (const span of scan.segments) {
    const { sourceStart, sourceEnd } = span;
    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || !(sourceEnd > sourceStart)) throw new Error("unknown segment duration");
    if (sourceStart < previousEnd - 1e-6) throw new Error("overlapping presentation spans require normalization");
    const next = end + (sourceEnd - sourceStart);
    ranges.push({ start: end, end: next, sourceStart, sourceEnd });
    end = next;
    previousEnd = sourceEnd;
  }
  if (!ranges.length) throw new Error("no covered duration");
  return { ...scan, coveredDuration: end, sourceDuration: previousEnd - ranges[0].sourceStart, ranges };
}
function toSource(map, time) {
  if (!Number.isFinite(time) || time < 0 || time > map.coveredDuration) return null;
  // Roundoff at a seam must select the following span, not the preceding hole.
  const range = map.ranges.find(r => time >= r.start - 1e-9 && time < r.end - 1e-9);
  if (range) return range.sourceStart + Math.max(0, time - range.start);
  return time === map.coveredDuration ? map.ranges[map.ranges.length - 1].sourceEnd : null;
}
// Source edit offsets are relative to format.start_time, not the first video PTS.
// Preserve that prefix; DTS finds discontinuities, PTS defines presentation cuts.
function repairMap(scan, origin) {
  const covered = coverage(scan), ranges = covered.ranges.map(r => ({ ...r }));
  if (!Number.isFinite(origin) || origin > ranges[0].sourceStart) throw new Error("unknown or inconsistent source origin");
  ranges[0].sourceStart = origin;
  const gaps = [];
  let duration = 0;
  ranges.forEach((r, i) => {
    if (i && r.sourceStart > ranges[i - 1].sourceEnd)
      gaps.push({ from: ranges[i - 1].sourceEnd - origin, to: r.sourceStart - origin });
    r.start = duration; duration += r.sourceEnd - r.sourceStart; r.end = duration;
  });
  return { v: 1, sourceOrigin: origin, sourceDuration: ranges[ranges.length - 1].sourceEnd - origin, duration, gaps, ranges };
}
function fromSource(map, time) {
  if (!Number.isFinite(time)) return null;
  const range = map.ranges.find(r => time >= r.sourceStart && time < r.sourceEnd);
  if (range) return range.start + time - range.sourceStart;
  const last = map.ranges[map.ranges.length - 1];
  return time === last.sourceEnd ? map.coveredDuration : null;
}
function sourceRanges(map, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > map.coveredDuration) throw new Error("clip outside covered duration");
  const result = [];
  for (const r of map.ranges) {
    const a = Math.max(start, r.start), b = Math.min(end, r.end);
    if (b > a) result.push({ start: a, end: b, sourceStart: r.sourceStart + a - r.start, sourceEnd: r.sourceStart + b - r.start });
  }
  return result;
}
const number = v => v != null && v !== "" && v !== "N/A" && Number.isFinite(Number(v)) ? Number(v) : undefined;
async function scanFile(file, { timeoutMs, signal } = {}) {
  if (signal?.aborted) throw Object.assign(new Error("clock scan cancelled"), { code: "ABORT_ERR" });
  const st = await fs.promises.stat(file);
  const streams = await new Promise((resolve, reject) => {
    execFile(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-of", "json", file],
      { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 4 << 20, signal }, (err, out) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(out).streams || []); } catch (e) { reject(e); }
      });
  });
  const stream = primaryStream(streams);
  if (!stream) throw new Error("no primary audio/video stream");
  if (signal?.aborted) throw Object.assign(new Error("clock scan cancelled"), { code: "ABORT_ERR" });
  const budget = timeoutMs ?? Math.min(180000, 20000 + Math.ceil(st.size / 1e9) * 15000);
  return new Promise((resolve, reject) => {
    const scan = accumulator();
    const child = spawn(FF.path("ffprobe"), ["-v", "error", "-select_streams", String(stream.index),
      "-show_entries", "packet=pts_time,dts_time,duration_time", "-of", "compact=p=0", file],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let rest = "", failure;
    const fail = message => { failure = new Error(message); child.kill(); };
    const abort = () => fail("clock scan cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
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
    child.on("error", err => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(err); });
    child.on("close", (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure || exitSignal || code !== 0) return reject(failure || new Error("packet scan incomplete"));
      try {
        if (rest) line(rest);
        const result = scan.finish();
        if (!result.packets) throw new Error("no usable packet timestamps");
        resolve({ ...result, streamIndex: stream.index, kind: stream.codec_type });
      } catch (e) { reject(e); }
    });
  });
}
module.exports = { primaryStream, accumulator, scanFile, coverage, toSource, fromSource, sourceRanges, repairMap };
