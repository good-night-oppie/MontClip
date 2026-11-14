/* transcribe.js — words → the timeline, finding
   a phrase, and the spans and extract ops the Transcript tab and
   fablecut_transcribe cut with. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../transcribe.js");
const ProjectOps = require("../server/project-ops.js");

// Whisper's model, language, joinChunks, plan and quiet went with it (#70, Deja 2026-11-03): the model and the language
// are tested in asr-offline.test.js, the words the engine gives in asr-words.test.js.

test("validate keeps a clean document and refuses a broken one", () => {
  const d = T.validate({ src: "/media/a.wav", model: "base", language: "en", duration: 5, words: [["hi", 0.5, 0.9], [" ", 1, 2], ["there", 0.4, 9]] });
  assert.deepEqual(d.words, [["hi", 0.5, 0.9], ["there", 0.5, 5]]);
  assert.equal(d.v, 1);
  assert.throws(() => T.validate({ words: [["a", "x", 1]] }), /\[text, start, end\]/);
  assert.throws(() => T.validate({}), /needs words/);
  assert.throws(() => T.validate(null), /object/);
});

const words = [["So", 1, 1.2], ["um,", 1.4, 1.7], ["this", 2, 2.3], ["is", 2.3, 2.4], ["A.I.", 2.5, 2.9], ["powered", 2.9, 3.4], ["editing.", 3.5, 4]];

test("clipWords maps file time onto the timeline through in and speed", () => {
  const clip = { id: "c1", start: 10, in: 1.9, duration: 1, props: { speed: 2 } };   // file 1.9…3.9
  const w = T.clipWords(clip, words);
  assert.deepEqual(w.map((x) => x.w), ["this", "is", "A.I.", "powered", "editing."]);
  assert.deepEqual([w[0].s, w[0].e], [10.05, 10.2]);
  assert.deepEqual(w[4].r, [10, 11]);
  assert.equal(w[4].e, 11, "clamped to the clip's end");
  assert.deepEqual(T.clipWords({ ...clip, keyframes: { speed: [{ t: 0, v: 1 }] } }, words), [], "a speed ramp is left out");
});

test("layout puts several clips' words in time order", () => {
  const a = { id: "a", start: 5, in: 0, duration: 1.8 }, b = { id: "b", start: 0, in: 2, duration: 2 };
  const w = T.layout([{ clip: a, words }, { clip: b, words }]);
  assert.deepEqual(w.map((x) => x.clip + ":" + x.w), ["b:this", "b:is", "b:A.I.", "b:powered", "b:editing.", "a:So", "a:um,"]);
});

test("find matches whole words, ignoring case, punctuation and spacing", () => {
  const w = T.layout([{ clip: { id: "c", start: 0, in: 0, duration: 10 }, words }]);
  assert.deepEqual(T.find(w, "um"), [{ i: 1, j: 1 }]);
  assert.deepEqual(T.find(w, "ai powered"), [{ i: 4, j: 5 }]);
  assert.deepEqual(T.find(w, "AI-Powered Editing!"), [{ i: 4, j: 6 }]);
  assert.deepEqual(T.find(w, "edit"), [], "not the start of a longer word");
  assert.deepEqual(T.find(w, "his"), [], "not the end of one");
  assert.deepEqual(T.find(w, "..."), []);
  const rep = T.layout([{ clip: { id: "c", start: 0, in: 0, duration: 10 }, words: [["no", 0, 1], ["no", 1, 2], ["no", 2, 3]] }]);
  assert.deepEqual(T.find(rep, "no no"), [{ i: 0, j: 1 }], "matches never overlap");
  assert.equal(T.find(rep, "no", { limit: 2 }).length, 2);
});

test("cutSpans takes the words and the pause after them, never a neighbour, on frames", () => {
  const w = T.layout([{ clip: { id: "c", start: 0, in: 0, duration: 10 }, words }]);
  const [s] = T.cutSpans(w, T.find(w, "um"), { fps: 10 });
  assert.deepEqual(s, { from: 1.4, to: 1.9 });   // the pause after "So" stays; up to just before "this" (2.0)
  assert.ok(s.from >= 1.2 && s.to <= 2, "So and this stay whole");
  const [e] = T.cutSpans(w, T.find(w, "editing"), { fps: 10 });
  assert.deepEqual(e, { from: 3.5, to: 4.1 }, "the last word: from its start, a short tail after it");
  // runs that touch merge into one span
  assert.deepEqual(T.cutSpans(w, [{ i: 2, j: 2 }, { i: 3, j: 3 }], { fps: 10 }), [{ from: 2, to: 2.4 }]);
});

test("cutSpans stays inside the clip, and a word in another clip isn't a neighbour", () => {
  const w = T.layout([{ clip: { id: "a", start: 0, in: 1.9, duration: 0.6 }, words }, { clip: { id: "b", start: 0.6, in: 0, duration: 1.3 }, words }]);
  // "is" ends clip a (0…0.6); the next word belongs to b
  const run = T.find(w, "is");
  const [s] = T.cutSpans(w, run, { fps: 10 });
  assert.ok(s.to <= 0.6 + 1e-9, `inside clip a (${s.to})`);
});

test("cutOps extracts last first, and the ops apply to a project", () => {
  const ops = T.cutOps([{ from: 1, to: 2 }, { from: 4, to: 5 }], { tracks: ["A1"], force: true });
  assert.deepEqual(ops, [{ op: "extract", from: 4, to: 5, tracks: ["A1"], force: true }, { op: "extract", from: 1, to: 2, tracks: ["A1"], force: true }]);
  const doc = { revision: 1, fps: 10, width: 640, height: 360, media: [{ id: "m", kind: "audio", src: "/media/a.wav", duration: 10 }],
    clips: [{ id: "c", kind: "audio", mediaId: "m", track: "A1", start: 0, in: 0, duration: 10 }] };
  ProjectOps.applyPatch(doc, T.cutOps([{ from: 1, to: 2 }, { from: 4, to: 5 }]));
  assert.equal(doc.clips.reduce((n, c) => n + c.duration, 0), 8);
});

test("segments break at sentences and pauses, not at abbreviations", () => {
  const w = T.layout([{ clip: { id: "c", start: 0, in: 0, duration: 10 }, words }]);
  const seg = T.segments(w, { min: 0.5, gap: 0.25 });
  assert.deepEqual(seg.map((s) => s.text), ["So um,", "this is A.I. powered editing."]);
  assert.deepEqual([seg[1].from, seg[1].to], [2, 4]);
  assert.equal(T.total([{ from: 1, to: 1.5 }, { from: 2, to: 3 }]), 1.5);
});
