"use strict";
/* Synthetic FLV fixtures for the FLV import tests (no real recordings). Not a test file: node --test loads it, finds
   no tests and moves on. A recording whose connection dropped keeps its clock running, so the tags after the drop are
   stamped later than the ones before: jumpTags() does exactly that to a clean FLV made by ffmpeg (lavfi). */
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const FF = require("../ffmpeg-path");

/** Every tag stamped at or after `at` (ms) is moved `by` ms later (both audio and video, as a dropped connection). */
function jumpTags(src, dst, { at, by }) {
  const b = Buffer.from(fs.readFileSync(src));
  let off = b.readUInt32BE(5) + 4;
  while (off + 11 <= b.length) {
    const len = b.readUIntBE(off + 1, 3);
    const ts = (b[off + 7] << 24 >>> 0) + b.readUIntBE(off + 4, 3);
    if ((b[off] === 8 || b[off] === 9) && ts >= at) {
      const moved = ts + by;
      b.writeUIntBE(moved & 0xffffff, off + 4, 3); b[off + 7] = (moved >>> 24) & 0xff;
    }
    off += 11 + len + 4;
  }
  fs.writeFileSync(dst, b);
}
/** A clean FLV: `video` args choose the codec (["-c:v","flv"] works with any build; H.264 needs an encoder here). */
function makeFlv(file, { seconds = 6, size = "320x180", rate = 30, video = ["-c:v", "flv"], filter } = {}) {
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", String(seconds), ...(filter ? ["-vf", filter] : []),
    ...video, "-c:a", "aac", "-b:a", "96k", file]);
}
module.exports = { jumpTags, makeFlv };
