"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs");
const Remap = require("../gap-remap"), Media = require("../media-lib");
test("gap repair: annotations and cuts after the gap move by N, before-gap times stay, editor undo restores all", () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const functions = source.slice(source.indexOf("function undoSnapshot()"), source.indexOf("function defaultTrackFor("));
  const project = { clips: [{ id: "v", mediaId: "old", kind: "video", start: 0, in: 0, duration: 310 },
    { id: "caption-before", kind: "text", start: 2, duration: 1, props: { caption: true } },
    { id: "caption", kind: "text", start: 302, duration: 1, props: { caption: true } },
    { id: "cut-before", kind: "video", mediaId: "old", start: 400, in: 2, duration: 1 },
    { id: "cut-after", kind: "video", mediaId: "old", start: 402, in: 302, duration: 1 }], media: [{ id: "old", kind: "video", src: "/media/original.mkv", duration: 310 }],
    markers: [], comps: [], sequences: [{ id: "other", clips: [{ id: "cut", kind: "video", mediaId: "old", start: 1, in: 302, duration: 1 }] }],
    collections: [{ media: ["old"] }], danmaku: [{ mediaId: "old", items: [[2, 1, 50], [302, 1, 100]] }],
    songs: { old: { scanned: 310, songs: [{ from: 302, to: 303, marks: [] }] } } };
  const runtime = { undo: [], redo: [], highlightFacts: { signature: "before", cards: [{ from: 2, to: 3 }, { from: 302, to: 303 }] } };
  const env = { project, runtime, seqRoot: () => project, toast() {}, pruneSelection() {}, scheduleSave() {}, renderInspector() {}, renderBin() {}, scheduleOfflineCheck() {}, reloadMediaSource() {} };
  const f = new Function(...Object.keys(env), functions + "return {repairSnapshot,pushUndo,undo,redo};")(...Object.values(env));
  const before = JSON.stringify(project), facts = JSON.stringify(runtime.highlightFacts);
  const map = { gaps: [{ from: 5, to: 300 }], duration: 15 }, planned = Remap.plan(project, "old", "new", map, runtime.highlightFacts.cards);
  f.pushUndo(f.repairSnapshot());
  Object.assign(project, planned.project); Media.swapMedia(project, "old", { id: "new", kind: "video", src: "/media/fixed.mp4", duration: 15 });
  runtime.highlightFacts = { signature: "after", cards: planned.highlights };
  a.deepEqual(project.danmaku[0].items.map(x => x[0]), [2, 7]);
  a.deepEqual(runtime.highlightFacts.cards.map(x => x.from), [2, 7]);
  a.deepEqual(["caption-before", "caption"].map(id => project.clips.find(c => c.id === id).start), [2, 7]);
  a.deepEqual(["cut-before", "cut-after"].map(id => project.clips.find(c => c.id === id).in), [2, 7]);
  const after = JSON.stringify(project), afterFacts = JSON.stringify(runtime.highlightFacts);
  f.undo(); a.equal(JSON.stringify(project), before); a.equal(JSON.stringify(runtime.highlightFacts), facts);
  f.redo(); a.equal(JSON.stringify(project), after); a.equal(JSON.stringify(runtime.highlightFacts), afterFacts);
});
