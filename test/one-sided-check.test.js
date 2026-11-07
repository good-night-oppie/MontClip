/* The "sound in one ear only" check after an export judges the finished file itself (QQ, 2026-11-05): ffmpeg's
   astats per channel (Delivery.CHANNEL_LEVEL_ARGS, the arguments server.js verifyDeliveryOutput runs) and the file's
   own length from ffprobe — never the timeline's pans. A file under 2 s, or silent all through, is never reported.

   ffmpeg makes each file (lavfi tones, PCM in MKV, as the Archive preset writes); the test then runs the same
   measurement chain the server does and feeds Delivery.verify. Skips when the bundled ffmpeg is missing. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const FF = require("../ffmpeg-path");
const Delivery = require("../delivery.js");

const skip = !FF.available("ffmpeg") || !FF.available("ffprobe") ? "bundled ffmpeg not installed (node desktop/fetch-ffmpeg.cjs)" : false;

/** A stereo MKV (FFV1 + PCM 24-bit) of `seconds`: `left` / `right` are aevalsrc expressions. */
function make(t, name, seconds, left, right) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-one-sided-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  execFileSync(FF.path("ffmpeg"), ["-v", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=s=160x90:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", `aevalsrc='${left}|${right}':s=48000:c=stereo:d=${seconds}`,
    "-c:v", "ffv1", "-c:a", "pcm_s24le", "-shortest", file]);
  return file;
}

/** What verifyDeliveryOutput does: ffprobe the file, astats each channel, then Delivery.verify. */
function check(file) {
  const probe = JSON.parse(execFileSync(FF.path("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
  const r = spawnSync(FF.path("ffmpeg"), Delivery.CHANNEL_LEVEL_ARGS(file), { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr.slice(-600));
  const channelLevels = Delivery.parseChannelLevels(r.stderr);
  const spec = Delivery.normalize("archive").spec;
  const report = Delivery.verify(spec, probe, { hasAudio: true, loudWanted: false, channelLevels });
  return { channelLevels, one: report.checks.find((x) => x.code === "AUDIO_ONE_SIDED") || null };
}

const TONE = "0.5*sin(2*PI*440*t)";

test("a 3 s file with sound in the left ear only is reported, measured on the file", { skip }, (t) => {
  const { channelLevels, one } = check(make(t, "left.mkv", 3, TONE, "0"));
  assert.ok(channelLevels[0] > -20 && channelLevels[1] <= -90, JSON.stringify(channelLevels));
  assert.ok(one && !one.ok && one.side === "left", JSON.stringify(one));
});

test("the same sound in both ears is not reported", { skip }, (t) => {
  assert.equal(check(make(t, "both.mkv", 3, TONE, TONE)).one, null);
});

test("a finished file under 2 s is not judged, even with sound on one side only", { skip }, (t) => {
  const { channelLevels, one } = check(make(t, "short.mkv", 1.5, TONE, "0"));
  assert.ok(channelLevels[0] > -20 && channelLevels[1] <= -90, "it really is one-sided: " + JSON.stringify(channelLevels));
  assert.equal(one, null);
});

test("a file silent all through is not reported", { skip }, (t) => {
  const { channelLevels, one } = check(make(t, "silent.mkv", 3, "0", "0"));
  assert.ok(Math.max(...channelLevels) <= -90, JSON.stringify(channelLevels));
  assert.equal(one, null);
});
