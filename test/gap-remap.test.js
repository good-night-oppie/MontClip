"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const load = () => require("../gap-remap");
const map = { gaps: [{ from: 5, to: 300 }], duration: 15 };
function fixture() { return {
  media: [{ id: "old", src: "/media/old.mkv", duration: 310 }],
  clips: [
    { id: "full", mediaId: "old", kind: "video", track: "V1", start: 0, in: 0, duration: 310 },
    { id: "cut-before", mediaId: "old", kind: "video", track: "V1", start: 400, in: 2, duration: 1 },
    { id: "cut-after", mediaId: "old", kind: "video", track: "V1", start: 410, in: 302, duration: 1 },
    { id: "caption-before", kind: "text", start: 2, duration: 1, props: { caption: true, text: "before" } },
    { id: "caption-after", kind: "text", start: 302, duration: 1, props: { caption: true, text: "after", wordTimes: [[0, .5], [.5, 1]] } },
  ],
  danmaku: [{ id: "d1", mediaId: "old", count: 2, items: [[2, 1, 1000, 1, "white", "before"], [302, 1, 2000, 1, "white", "after"]] }],
  songs: { old: { scanned: 310, complete: true, songs: [{ from: 302, to: 303, marks: [{ at: "start", t: 302 }] }] } },
  comps: [{ id: "comp", clips: [{ id: "nested", mediaId: "old", kind: "video", start: 7, in: 302, duration: 1 }] }],
  sequences: [{ id: "other", clips: [{ id: "other-cut", mediaId: "old", kind: "video", start: 9, in: 302, duration: 1 }] }],
}; }
test("one map moves source annotations, subtitle times, found highlights and cut in-points", () => {
  const original = fixture(), before = JSON.stringify(original), highlights = [{ from: 2, to: 3, score: 1 }, { from: 302, to: 303, score: 2 }];
  const r = load().plan(original, "old", "new", map, highlights);
  a.equal(JSON.stringify(original), before, "planning does not mutate the original or its undo snapshot");
  a.equal(r.project.clips.find(c => c.id === "cut-before").in, 2);
  a.equal(r.project.clips.find(c => c.id === "cut-after").in, 7);
  a.equal(r.project.clips.find(c => c.id === "cut-after").start, 410, "placed clip position stays fixed");
  a.equal(r.project.clips.find(c => c.id === "caption-before").start, 2);
  a.equal(r.project.clips.find(c => c.id === "caption-after").start, 7);
  a.deepEqual(r.project.clips.find(c => c.id === "caption-after").props.wordTimes, [[0, .5], [.5, 1]]);
  a.deepEqual(r.project.danmaku[0].items.map(x => x[0]), [2, 7]);
  a.deepEqual(r.project.danmaku[0].items.map(x => x[2]), [1000, 2000], "wall clock sent time is not a source offset");
  a.equal(r.project.danmaku[0].mediaId, "new"); a.equal(r.project.songs.new.songs[0].from, 7);
  a.equal(r.project.comps[0].clips[0].in, 7); a.equal(r.project.sequences[0].clips[0].in, 7);
  a.deepEqual(r.highlights.map(x => x.from), [2, 7]);
  a.deepEqual(JSON.parse(before), original, "the caller can retain an unmodified before-snapshot; UI undo is tested separately");
});
test("cross-gap intervals compress once and constant-speed footage maps timeline annotations", () => {
  const doc = fixture();
  doc.clips = [
    { id: "v", mediaId: "old", kind: "video", start: 20, in: 2, duration: 151, props: { speed: 2 } },
    { id: "caption", kind: "text", start: 169.5, duration: .5, props: { caption: true, wordTimes: [[0, .5]], captionSource: { output: { start: 169.5, end: 170 } } } },
  ];
  const r = load().plan(doc, "old", "new", map, [{ from: 169.5, to: 170 }]);
  a.equal(r.project.clips[0].start, 20); a.equal(r.project.clips[0].duration, 3.5);
  a.equal(r.project.clips[1].start, 22);
  a.deepEqual(r.project.clips[1].props.captionSource.output, { start: 22, end: 22.5 });
  a.deepEqual(r.highlights, [{ from: 22, to: 22.5 }]);
});
test("uncertain or entirely removed edits reject atomically rather than disappearing", () => {
  const doc = fixture(); doc.clips.push({ id: "in-gap", mediaId: "old", kind: "video", start: 500, in: 10, duration: 2 });
  const before = JSON.stringify(doc);
  a.throws(() => load().plan(doc, "old", "new", map), /entirely inside a gap/);
  a.equal(JSON.stringify(doc), before);
  a.throws(() => load().plan(fixture(), "old", "old", map), /identity/);
  a.throws(() => load().mapper({ gaps: [{ from: 5, to: 300 }, { from: 200, to: 400 }] }), /invalid gap map/);
});
test("word and song anchors inside a gap are not silently moved; clocks have finite bounds", () => {
  const doc = fixture(); doc.clips.push({ id: "words", kind: "text", start: 4, duration: 298, props: { caption: true, wordTimes: [[6, 7]] } });
  a.throws(() => load().plan(doc, "old", "new", map), /entirely inside a gap/);
  const song = fixture(); song.songs.old.songs[0].marks[0].t = 200;
  a.throws(() => load().plan(song, "old", "new", map), /inside a gap/);
  const collision = fixture(); collision.songs.new = { songs: [] };
  a.throws(() => load().plan(collision, "old", "new", map), /identity/);
  const time = load().mapper(map);
  a.deepEqual([0, 5, 300, 310].map(time), [0, 5, 5, 15]);
  a.throws(() => time(311), /source time/);
  a.throws(() => load().mapper({ ...map, sourceDuration: 500 }), /duration/);
  a.throws(() => load().mapper({ duration: 5, gaps: [{ from: 10, to: 20 }] }), /duration/);
});
test("transcript copies share the map and leave the old sidecar document intact", () => {
  const doc = { src: "/media/old.mkv", duration: 310, words: [["before", 2, 3], ["after", 302, 303]] };
  const r = load().transcript(doc, "/media/new.mp4", map);
  a.deepEqual(r.words, [["before", 2, 3], ["after", 7, 8]]); a.equal(r.duration, 15);
  a.equal(doc.words[1][1], 302);
});
test("ambiguous caption provenance and speed ramps fail before touching project data", () => {
  const ambiguous = fixture(); ambiguous.clips.push({ id: "other-media", mediaId: "else", kind: "video", start: 0, in: 0, duration: 310 });
  a.throws(() => load().plan(ambiguous, "old", "new", map), /ambiguous/);
  const ramp = fixture(); ramp.clips[0].keyframes = { speed: [{ t: 0, v: 1 }, { t: 3, v: 2 }] };
  a.throws(() => load().plan(ramp, "old", "new", map), /speed ramp/);
});
