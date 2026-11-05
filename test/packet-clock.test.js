"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const load = () => require("../packet-clock");
test("primary track excludes attached pictures and prefers default video over audio", () => {
  const { primaryStream } = load();
  a.equal(primaryStream([{ index: 0, codec_type: "video", disposition: { attached_pic: 1 } },
    { index: 1, codec_type: "audio" }, { index: 2, codec_type: "video" },
    { index: 3, codec_type: "video", disposition: { default: 1 } }]).index, 3);
  a.equal(primaryStream([{ index: 4, codec_type: "audio" }]).index, 4);
  a.equal(primaryStream([{ index: 1, codec_type: "subtitle" }]), undefined);
});
test("DTS detects discontinuity while reordered PTS remains presentation metadata", () => {
  const scan = load().accumulator();
  for (const p of [{ dts: 0, pts: .08 }, { dts: .04, pts: 0 }, { dts: .08, pts: .04 },
    { dts: 300, pts: 300.08 }, { dts: 300.04, pts: 300 }, { dts: 300.08, pts: 300.04 }]) scan.add({ ...p, duration: .04 });
  const r = scan.finish();
  a.equal(r.packets, 6); a.equal(r.segments.length, 2);
  a.ok(Math.abs(r.gaps[0].duration - 299.88) < 1e-9);
  a.equal(r.segments[0].sourceStart, 0); a.equal(r.segments[1].sourceStart, 300);
  a.equal(r.timestampJump, true);
});
test("missing DTS falls back to PTS; backward DTS is rejected instead of silently sorting resets", () => {
  const scan = load().accumulator();
  scan.add({ pts: 1, duration: .04 }); scan.add({ pts: 1.04, duration: .04 });
  a.equal(scan.finish().packets, 2);
  const reset = load().accumulator(); reset.add({ dts: 10, pts: 10, duration: .04 }); reset.add({ dts: 0, pts: 0, duration: .04 });
  a.throws(() => reset.finish(), /backward DTS/);
});
test("invalid timestamps and excessive discontinuities cannot produce a plausible partial scan", () => {
  const scan = load().accumulator({ maxSegments: 2 });
  scan.add({ dts: NaN, pts: Infinity });
  for (const dts of [0, 10, 20]) scan.add({ dts, pts: dts, duration: .04 });
  a.throws(() => scan.finish(), /too many/);
});
test("coverage excludes the discontinuity but preserves time within each segment", () => {
  const scan = load().accumulator();
  for (let i = 0; i < 10; i++) scan.add({ dts: i < 5 ? i : i + 295, pts: i < 5 ? i : i + 295, duration: 1 });
  const result = load().coverage(scan.finish());
  a.equal(result.coveredDuration, 10); a.equal(result.sourceDuration, 305);
  a.deepEqual(result.ranges, [{ start: 0, end: 5, sourceStart: 0, sourceEnd: 5 }, { start: 5, end: 10, sourceStart: 300, sourceEnd: 305 }]);
});
test("unknown packet durations and overlapping presentation spans require normalization", () => {
  a.throws(() => load().coverage({ segments: [{ sourceStart: 0, sourceEnd: 0 }] }), /duration/);
  a.throws(() => load().coverage({ segments: [{ sourceStart: 0, sourceEnd: 5 }, { sourceStart: 4, sourceEnd: 6 }] }), /overlap/);
});
