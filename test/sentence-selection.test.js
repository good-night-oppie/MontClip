"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../captions");
const Ops = require("../project-ops");
function project() {
  return { revision: 1, fps: 30, width: 1280, height: 720,
    media: [{ id: "m", kind: "video", src: "/media/合成 source.mp4", duration: 10 }],
    clips: [
      { id: "v", kind: "video", mediaId: "m", track: "V1", start: 0, in: 0, duration: 10, props: { volume: 0 } },
      { id: "a", kind: "audio", mediaId: "m", track: "A1", start: 0, in: 0, duration: 10 },
      ...C.parse("1\n00:00:01,000 --> 00:00:03,000\n第一句\n\n2\n00:00:04,000 --> 00:00:05,000\n跳过这一句\n\n3\n00:00:06,000 --> 00:00:08,000\nKeep this sentence\n")
        .map((cue, i) => C.clip(cue, { id: "s" + i, track: "V2" })),
    ] };
}
test("nonadjacent sentences join only selected ranges, audio/video stay aligned and SRT rebases", () => {
  const doc = project(), before = JSON.stringify(doc);
  const plan = C.selectionPlan(doc, ["s2", "s0", "s0"]);
  assert.equal(JSON.stringify(doc), before, "proposal is non-mutating");
  assert.deepEqual(plan.keep, [{ from: 1, to: 3 }, { from: 6, to: 8 }]);
  assert.equal(plan.duration, 4);
  Ops.applyPatch(doc, plan.ops);
  assert.deepEqual(C.fromClips(doc.clips), [{ start: 0, end: 2, text: "第一句" }, { start: 2, end: 4, text: "Keep this sentence" }]);
  assert.deepEqual(C.parse(C.toSRT(C.fromClips(doc.clips))), C.fromClips(doc.clips));
  const map = C.sourceMap(doc);
  assert.equal(map.segments.length, 4);
  for (const kind of ["V1", "A1"]) assert.deepEqual(map.segments.filter((s) => s.track === kind).map((s) => [s.source, s.output]), [
    [{ start: 1, end: 3 }, { start: 0, end: 2 }], [{ start: 6, end: 8 }, { start: 2, end: 4 }],
  ]);
  assert.deepEqual(C.sourceMap(JSON.parse(JSON.stringify(doc))), map, "save/reopen serialization preserves mapping");
  assert.deepEqual(doc.media, JSON.parse(before).media, "source registration is untouched");
});
test("selection refuses missing, disabled, locked and unrepresentable ranges before mutation", () => {
  for (const mutate of [
    (d) => { d.clips.find((c) => c.id === "a").locked = true; },
    (d) => { d.lockedTracks = ["V1"]; },
    (d) => { d.disabledTracks = ["V2"]; },
    (d) => { d.clips.find((c) => c.id === "s0").start = 0.01; },
    (d) => { d.clips[0].keyframes = { speed: [{ t: 0, v: 1 }] }; },
  ]) {
    const d = project(); mutate(d); const before = JSON.stringify(d);
    assert.throws(() => C.selectionPlan(d, ["s0", "s2"]));
    assert.equal(JSON.stringify(d), before);
  }
  assert.throws(() => C.selectionPlan(project(), ["missing"]));
  assert.throws(() => C.selectionPlan(project(), []));
});
test("mapping supports constant speed and refuses unsupported ramps or past-source windows", () => {
  const d = project(); d.clips = [d.clips[0]]; d.clips[0].duration = 3;
  d.clips[0].props.speed = 2; d.clips[0].in = 1;
  assert.deepEqual(C.sourceMap(d).segments[0].source, { start: 1, end: 7 });
  d.clips[0].duration = 7;
  assert.throws(() => C.sourceMap(d), /exceeds source/);
  d.clips[0].keyframes = { speed: [{ t: 0, v: 1 }] };
  assert.throws(() => C.sourceMap(d), /speed ramps/);
});
