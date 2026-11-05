/* Rea (#126 review, head e1cb137): the server's length fixes the media entry, but clips already on the timeline kept the
   browser's 3620 s — an MKV whose timestamps start at 3600 s plays 20 s. Old projects, and a file dragged onto the
   timeline before /api/media-info answered. The clips now fit the corrected length the way a replaced file's clips do
   (setMediaSource / replaceClipMedia: in + duration×speed ≤ media.duration), as one undo step.
   refreshMediaInfo runs here as written in app.js, with a fake server answer. */
"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const body = source.slice(source.indexOf("let mediaInfoBusy = false"), source.indexOf("/* N25 (docs/decisions/2026-11-03-canvas-follows-source.md)"));

function world({ media, clips, comps = [], others = [] }) {
  const project = { media, clips, comps, markers: [], revision: 1 };
  const calls = { undo: [], saved: 0, toasts: [] };
  const ctx = {
    project, state: { connected: true }, runtime: {},
    MediaLib: require("../media-lib"),
    isLocalSrc: (s) => /^\/media\//.test(s || ""),
    fetch: async (_url, opts) => {
      const srcs = JSON.parse(opts.body).srcs, info = {};
      for (const s of srcs) info[s] = ctx.answer[s] || null;
      return { ok: true, json: async () => ({ info }) };
    },
    answer: {},
    pushUndo: (snap) => calls.undo.push(snap === undefined ? "default" : snap),
    otherSequenceClips: () => Object.fromEntries(others.map((sq) => [sq.id, sq.clips])),
    SeqLib: { others: () => others }, seqRoot: () => project,
    toast: (m) => calls.toasts.push(m), uiText: (k) => k,
    renderBin() {}, renderInspector() {}, scheduleSave() { calls.saved++; }, followSourceCanvas() {},
  };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return { ctx, project, calls };
}
const mkv = (over = {}) => ({ id: "m1", kind: "video", name: "rec.mkv", src: "/media/rec.mkv", size: 1000, duration: 3620, ...over });
const clip = (over = {}) => ({ id: "c1", mediaId: "m1", kind: "video", track: "V1", start: 0, in: 0, duration: 3620, props: {}, ...over });

test("an old project opens: media 3620 s and a 3620 s clip become 20 s, with its linked sound", async () => {
  const w = world({ media: [mkv()], clips: [clip({ linkGroup: "g" }), clip({ id: "a1", kind: "audio", track: "A1", linkGroup: "g" })] });
  w.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w.ctx.refreshMediaInfo();
  a.equal(w.project.media[0].duration, 20);
  for (const c of w.project.clips) a.ok(Math.abs(c.duration - 20) < 1e-3, c.id + " is " + c.duration + " s");
});

test("dragged in first at the browser's 3620 s, then the server's 20 s arrives: the clip becomes 20 s", async () => {
  // a fresh import: no size yet, the browser's length, the clip already placed from it
  const w = world({ media: [mkv({ size: undefined })], clips: [clip({ start: 12 })] });
  delete w.project.media[0].size;
  w.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w.ctx.refreshMediaInfo();
  a.equal(w.project.media[0].duration, 20);
  a.ok(Math.abs(w.project.clips[0].duration - 20) < 1e-3, "clip " + w.project.clips[0].duration + " s");
  a.equal(w.project.clips[0].start, 12, "the clip stays where it is");
});

test("one undo step holds the media's old length and the clips' old lengths together", async () => {
  const w = world({ media: [mkv()], clips: [clip()], others: [{ id: "s2", clips: [clip({ id: "s2c" })] }] });
  w.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w.ctx.refreshMediaInfo();
  a.equal(w.calls.undo.length, 1, "exactly one undo step");
  const snap = JSON.parse(w.calls.undo[0]);
  a.equal(snap.media.find((m) => m.id === "m1").duration, 3620, "undo brings the media's length back");
  a.equal(snap.clips.find((c) => c.id === "c1").duration, 3620, "and the clip's");
  a.equal(snap.seqClips.s2[0].duration, 3620, "and a clip in another sequence");
  a.ok(Math.abs(w.project.media[0].duration - 20) < 1e-3);
});

test("clips that already fit are untouched, and nothing becomes an undo step when no length changes", async () => {
  const w = world({ media: [mkv()], clips: [clip({ duration: 8, in: 2 }), clip({ id: "c2", in: 10, duration: 15, props: { speed: 2 } })] });
  w.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w.ctx.refreshMediaInfo();
  a.deepEqual(w.project.clips.map((c) => [c.in, c.duration]), [[2, 8], [10, 5]], "the first fits; the second (2×) is trimmed to the 10 s left");
  // the same file asked again later: the length doesn't change, so no step
  const w2 = world({ media: [mkv({ duration: 20 })], clips: [clip({ duration: 20 })] });
  w2.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w2.ctx.refreshMediaInfo();
  a.equal(w2.calls.undo.length, 0);
  a.equal(w2.project.clips[0].duration, 20);
});

test("a clip whose In is past the real end moves its In back, inside comps and other sequences too", async () => {
  const inComp = clip({ id: "k1", in: 100, duration: 30 });
  const w = world({ media: [mkv()], clips: [clip({ in: 3000, duration: 600 })], comps: [{ id: "cp", clips: [inComp] }] });
  w.ctx.answer["/media/rec.mkv"] = { size: 1000, duration: 20 };
  await w.ctx.refreshMediaInfo();
  for (const c of [w.project.clips[0], inComp]) {
    // the replace rule (setMediaSource): In inside the file, and a clip never shorter than 0.05 s
    a.ok(c.in < 20 && c.duration <= Math.max(0.05, 20 - c.in) + 1e-6, c.id + ": in " + c.in + ", duration " + c.duration);
  }
});
