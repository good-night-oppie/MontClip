"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Edit = require("../shared/edit-ops"), Project = require("../server/project-ops");
function fixture({ pictureIn = 0, audioIn = 30, pictureLength = 35, audioLength = 120 } = {}) {
  const doc = { fps: 25, media: [{ id: "A", kind: "video", duration: audioLength },
    { id: "B", kind: "video", duration: pictureLength }],
  tracks: ["V1", "A1", "A2"].map(id => ({ id, kind: id === "V1" ? "video" : "audio" })), clips: [] };
  for (const [i, track] of ["V1", "A1", "A2"].entries()) doc.clips.push({ id: track,
    kind: i ? "audio" : "video", mediaId: "A", track, start: 10, in: audioIn, duration: 30,
    linkGroup: "original", props: { speed: 1, ...(i ? { audioChannel: i - 1 } : { volume: 0 }) },
    keyframes: { volume: [{ t: 0, v: 1 }, { t: 1, v: .5 }] } });
  Project.applyPatch(doc, [{ op: "updateClip", id: "V1", set: { mediaId: "B", in: pictureIn } }]);
  return JSON.parse(JSON.stringify(doc));
}
for (const [name, options, delta, shift] of [
  ["independent source In", {}, -.1, .1],
  ["zero delta", {}, 0, 0],
  ["picture source head", {}, .1, 0],
  ["picture source tail", {}, -10, 5],
  ["audio source tail", { pictureIn: 2, pictureLength: 40, audioLength: 65 }, -10, 5],
  ["audio source head", { pictureIn: 4, pictureLength: 40, audioIn: 1, audioLength: 35 }, 10, -1],
]) for (const entry of ["edit", "patch"]) test(`slip ${entry}: ${name} keeps each original In offset`, () => {
  const doc = fixture(options), e = Edit.forDoc(doc); e.relinkClips();
  const before = JSON.parse(JSON.stringify(doc.clips));
  if (entry === "edit") assert.equal(e.slipClip(doc.clips[0], delta), shift === 0 ? 0 : -shift);
  else Project.applyPatch(doc, [{ op: "slip", id: "V1", delta }]);
  for (const [i, c] of doc.clips.entries()) {
    assert.equal(c.in, +(before[i].in + shift).toFixed(4));
    assert.equal(c.start, before[i].start); assert.equal(c.duration, before[i].duration);
    assert.deepEqual(c.keyframes, before[i].keyframes);
    assert.ok(c.in >= 0 && c.in + c.duration <= doc.media.find(m => m.id === c.mediaId).duration);
  }
  const reopened = JSON.parse(JSON.stringify(doc)), reload = Edit.forDoc(reopened); reload.relinkClips();
  assert.equal(reload.withLinked([reopened.clips[0]]).length, 3);
});
test("slip of an independent-In group respects a locked stem atomically", () => {
  const doc = fixture(); doc.clips[1].locked = true;
  const before = JSON.stringify(doc);
  assert.equal(typeof Edit.forDoc(doc).slipClip(doc.clips[0], -.1), "string");
  assert.equal(JSON.stringify(doc), before);
});
test("explicitly unlinked original audio is not slipped with the replacement", () => {
  const doc = fixture(); for (const c of doc.clips) { c.unlinked = true; delete c.linkGroup; }
  const audio = JSON.stringify(doc.clips.slice(1));
  Project.applyPatch(doc, [{ op: "slip", id: "V1", delta: -.1 }]);
  assert.equal(doc.clips[0].in, .1); assert.equal(JSON.stringify(doc.clips.slice(1)), audio);
});
test("slip patch rejects non-finite or missing delta without changing clips", () => {
  for (const delta of [NaN, Infinity, undefined, "0.1"]) {
    const doc = fixture(), before = JSON.stringify(doc);
    assert.throws(() => Project.applyPatch(doc, [{ op: "slip", id: "V1", delta }]), /delta must be a number/);
    assert.equal(JSON.stringify(doc), before);
  }
});
test("unknown source lengths keep the existing unbounded-tail slip behavior", () => {
  const doc = fixture(); for (const m of doc.media) delete m.duration;
  Project.applyPatch(doc, [{ op: "slip", id: "V1", delta: -.1 }]);
  assert.equal(doc.clips[0].in, .1);
  assert.equal(doc.clips[1].in, 30.1); assert.equal(doc.clips[2].in, 30.1);
});
