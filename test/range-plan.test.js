"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const C = require("../shared/captions"), R = require("../shared/range-plan");
const truth = require("./fixtures/m0/time-truth.json");
function fixture() {
  return { revision: 1, fps: 30, media: [{ id: "m", src: "/media/bilingual-source.mp4", duration: 16 }], clips: [
    { id: "v", kind: "video", track: "V1", mediaId: "m", start: 0, duration: 16, in: 0 },
    { id: "a", kind: "audio", track: "A1", mediaId: "m", start: 0, duration: 16, in: 0 },
    ...C.parse(fs.readFileSync(path.join(__dirname, "fixtures/m0/bilingual-manual.srt"), "utf8"))
      .map((cue, i) => C.clip(cue, { id: "s" + i, track: "V2" })),
  ] };
}
test("independent M0 truth: user order and all eight exact caption intersections", () => {
  const doc = fixture(), original = JSON.stringify(doc);
  const plan = R.create(doc, [{ from: 9, to: 12 }, { from: 1, to: 4 }]);
  assert.equal(JSON.stringify(doc), original);
  assert.equal(plan.duration, 6);
  assert.deepEqual(plan.project.clips.filter(c => c.kind === "video").map(c => [c.in, c.start, c.duration]), [[9, 0, 3], [1, 3, 3]]);
  const cues = C.parse(C.toSRT(C.fromClips(plan.project.clips)));
  const full = truth.fullCues.map(c => ({ start: c.outputMs[0] / 1000, end: c.outputMs[1] / 1000, text: c.text }));
  const boundary = [{ start: 0, end: .2, text: "这句话跨过起点。" }, { start: 5.8, end: 6, text: "This sentence crosses the cut." }];
  assert.deepEqual(cues, [...full, ...boundary].sort((a,b) => a.start-b.start));
  assert.equal(plan.captions.filter(c => c.truncated).length, 2);
  assert.equal(plan.captions.length, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(plan.project)), plan.project);
});
test("half-open boundaries, repeated source ranges and collapsed millisecond intersections", () => {
  const doc = fixture();
  const plan = R.create(doc, [{ from: 1, to: 2 }, { from: 1, to: 2 }]);
  assert.equal(plan.captions.length, 2);
  assert.equal(new Set(plan.project.clips.map(c => c.id)).size, plan.project.clips.length);
  assert.deepEqual(plan.captions.map(c => c.output), [{ start: 0, end: 1 }, { start: 1, end: 2 }]);
  doc.clips.push(C.clip({ start: 1.9999, end: 2.1, text: "tiny" }, { id: "tiny", track: "V2" }));
  const tiny = R.create(doc, [{ from: 1, to: 2 }]);
  assert.equal(tiny.captions.find(c => c.sourceCaptionId === "tiny").status, "omitted-rounded-empty");
  assert.equal(C.fromClips(tiny.project.clips).length, 1);
});
test("later native caption timing changes refuse stale provenance; markers follow user order", () => {
  const doc = fixture(); doc.markers = [{ t: 1, label: "first" }, { t: 9, label: "second" }, { t: 12, label: "outside" }];
  const p = R.create(doc, [{ from: 9, to: 12 }, { from: 1, to: 4 }]);
  assert.deepEqual(p.project.markers, [{ t: 0, label: "second" }, { t: 3, label: "first" }]);
  const c = p.project.clips.find(c => C.isCaption(c)); c.duration /= 2;
  assert.throws(() => C.sourceMap(p.project), /timing changed/);
  assert.throws(() => R.create(p.project, [{ from: 0, to: 1 }]), /timing changed/);
});

test('container-time selections retain a nonzero first-video timestamp and caption offset', () => {
  // Synthetic container clock: audio begins at 0, first video presentation at .020.
  // This checks downstream arithmetic, not FLV remux/browser timestamp discovery.
  const doc = {revision:1, media:[{id:'prepared',src:'/media/compat.mp4',originalSrc:'/media/source.flv',duration:2}], clips:[
    {id:'v',kind:'video',track:'V1',mediaId:'prepared',start:0,duration:2,in:0},
    {id:'a',kind:'audio',track:'A1',mediaId:'prepared',start:0,duration:2,in:0},
    C.clip({start:.020,end:.520,text:'非零首帧 / container time'},{id:'s',track:'V2'})
  ]};
  const before=JSON.stringify(doc);
  const whole=R.create(doc,[{from:0,to:1}]);
  assert.equal(C.parse(C.toSRT(C.fromClips(whole.project.clips)))[0].start,.020);
  const cut=R.create(doc,[{from:.020,to:1.020}]);
  const map=C.sourceMap(cut.project);
  assert.deepEqual(map.segments.map(s=>s.source),[{start:.020,end:1.020},{start:.020,end:1.020}]);
  assert.deepEqual(map.captions[0].original,{start:.020,end:.520});
  assert.deepEqual(map.captions[0].intersection,{start:.020,end:.520});
  assert.deepEqual(map.captions[0].output,{start:0,end:.5});
  assert.equal(C.parse(C.toSRT(C.fromClips(cut.project.clips)))[0].start,0);
  assert.equal(JSON.stringify(doc),before);
});
