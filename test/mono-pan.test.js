/* One pan rule for every place a video's audio stems are made: a mono source's only stem sits in the centre;
   when a file is split into several stems, L −1, R +1, the rest centre. (europa, preview.3: a mono recording
   exported in the left ear only.) The export itself is checked end to end in mono-pan-export.test.js. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const MontClipEdit = require("../edit-ops.js");
const { SRC } = require("./timeline-sandbox");

function slice(start, end) {
  const a = SRC.indexOf(start), b = SRC.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `markers not found: ${start} … ${end}`);
  return SRC.slice(a, b);
}

test("the rule: mono → centre; a split file → L −1, R +1, the rest centre", () => {
  const pan = MontClipEdit.defaultPanForChannel;
  assert.equal(pan(0, 1), 0);
  assert.deepEqual([0, 1].map((ch) => pan(ch, 2)), [-1, 1]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((ch) => pan(ch, 6)), [-1, 1, 0, 0, 0, 0]);
  assert.equal(pan(0), -1, "count unknown: as stereo (the editor re-checks once the file is decoded)");
});

function editWorld(media) {
  const project = { clips: [], media: [media] };
  let n = 0;
  const E = MontClipEdit.create({
    doc: () => project, uid: () => "u" + (++n),
    tracks: () => ["V1", "A1", "A2", "A3"].map((id) => ({ id, kind: id[0] === "A" ? "audio" : "video" })),
    trackLocked: () => false, trackTargeted: () => true,
  });
  return { project, E };
}
const stemPans = (project) => project.clips.filter((c) => c.kind === "audio").map((c) => [c.props.audioChannel, c.props.pan]);

test("insert / overwrite (MCP and the editor's Source edits): one stem for a mono file, centred", () => {
  // the MCP passes the probed channel count
  let w = editWorld({ id: "m1", kind: "video", duration: 10 });
  w.E.insertAt(w.project.media[0], 0, 2, 0, 1);
  assert.deepEqual(stemPans(w.project), [[0, 0]]);
  // the editor passes nothing: a file it already knows is mono gets one stem
  for (const m of [{ channels: 1 }, { audioChannels: 1 }]) {
    w = editWorld({ id: "m1", kind: "video", duration: 10, ...m });
    w.E.overwriteAt(w.project.media[0], 0, 2, 0);
    assert.deepEqual(stemPans(w.project), [[0, 0]], JSON.stringify(m));
  }
  // stereo and unknown: a pair, hard left and right, as before
  for (const m of [{ channels: 2 }, {}]) {
    w = editWorld({ id: "m1", kind: "video", duration: 10, ...m });
    w.E.insertAt(w.project.media[0], 0, 2, 0);
    assert.deepEqual(stemPans(w.project), [[0, -1], [1, 1]], JSON.stringify(m));
  }
  w = editWorld({ id: "m1", kind: "video", duration: 10 });
  w.E.insertAt(w.project.media[0], 0, 2, 0, 2);
  assert.deepEqual(stemPans(w.project), [[0, -1], [1, 1]]);
});

/* attachLinkedAudioChannels + reconcileAudioChannels, sliced out of app.js and run against a small world. */
function appWorld({ clips = [], media }) {
  const project = { clips, media: [media] };
  let n = 0;
  const env = {
    project, DEFAULT_PROPS: { volume: 1 }, MontClipEdit, MAX_TRACKS_PER_KIND: 16, onlyTargetedSkip: false,
    uid: () => "n" + (++n),
    getClip: (id) => project.clips.find((c) => c.id === id) || null,
    getMedia: (id) => project.media.find((m) => m.id === id),
    audioTrackIds: () => ["A1", "A2", "A3", "A4"],
    ensureAudioTrackCount: () => 0, isEditTarget: () => true, releaseClipEl() {}, scheduleSave() {},
    rebuildClips() {}, renderInspector() {}, toast() {}, state: {},
    uiText: () => "", MontClipView: { tp: () => "" }, mcView: { get: () => ({}) }, // the toasts speak through the language table
    detectChannelCount: async (m) => m.channels,
  };
  const code = [
    "const defaultPanForChannel = MontClipEdit.defaultPanForChannel;",
    slice("function attachLinkedAudioChannels(", "function addClipFromMedia("),
    slice("async function reconcileAudioChannels(", "/* Apply a named title style"),
  ].join("\n");
  const names = Object.keys(env);
  const fns = new Function(...names, `${code}\nreturn { attachLinkedAudioChannels, reconcileAudioChannels };`)(...names.map((k) => env[k]));
  return { project, ...fns };
}
const video = () => ({ id: "v", kind: "video", mediaId: "m1", track: "V1", start: 0, in: 0, duration: 2, linkGroup: "lg1", props: { volume: 0 } });

test("the editor's drop: a known mono file gets one centred stem", () => {
  const w = appWorld({ clips: [video()], media: { id: "m1", kind: "video", channels: 1 } });
  w.attachLinkedAudioChannels(w.project.clips[0], w.project.media[0], 1);
  assert.deepEqual(stemPans(w.project), [[0, 0]]);
  const s = appWorld({ clips: [video()], media: { id: "m1", kind: "video", channels: 2 } });
  s.attachLinkedAudioChannels(s.project.clips[0], s.project.media[0], 2);
  assert.deepEqual(stemPans(s.project), [[0, -1], [1, 1]]);
});

test("the editor's drop before decoding: the stereo placeholder becomes one centred stem once the file turns out mono", async () => {
  const w = appWorld({ clips: [video()], media: { id: "m1", kind: "video", channels: 1 } });
  w.attachLinkedAudioChannels(w.project.clips[0], w.project.media[0], 2);   // channel count not known yet
  assert.deepEqual(stemPans(w.project), [[0, -1], [1, 1]]);
  await w.reconcileAudioChannels(w.project.clips[0]);
  assert.deepEqual(stemPans(w.project), [[0, 0]]);
});

test("opening a project never moves a pan already on a mono stem — the streamer may have set it", async () => {
  const stem = { id: "a", kind: "audio", mediaId: "m1", track: "A1", start: 0, in: 0, duration: 2, linkGroup: "lg1", props: { audioChannel: 0, pan: -1 } };
  const w = appWorld({ clips: [video(), stem], media: { id: "m1", kind: "video", channels: 1 } });
  await w.reconcileAudioChannels(w.project.clips[0]);
  assert.deepEqual(stemPans(w.project), [[0, -1]]);
});

test("stereo stays apart after decoding: nothing is re-centred", async () => {
  const w = appWorld({ clips: [video()], media: { id: "m1", kind: "video", channels: 2 } });
  w.attachLinkedAudioChannels(w.project.clips[0], w.project.media[0], 2);
  await w.reconcileAudioChannels(w.project.clips[0]);
  assert.deepEqual(stemPans(w.project), [[0, -1], [1, 1]]);
});

test("the Source monitor follows the same rule as the timeline", () => {
  const route = slice("function routeSourceChannels(", "function hookSourceAudio(");
  assert.match(route, /panner\.pan\.value = defaultPanForChannel\(ch, nCh\)/);
  assert.match(SRC, /const defaultPanForChannel = MontClipEdit\.defaultPanForChannel;/, "app.js and edit-ops.js share one rule");
});
