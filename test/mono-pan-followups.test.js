/* After #179 (mono stems centred), Deja's four follow-ups (2026-11-05):
     1. old projects: mono stems in the left ear only are found on open; a toast that blocks nothing asks once —
        centre them (one undo step) or keep them — and the answer is remembered (monoPanReviewed); the MCP
        status warns until then;
     2. panAuto: a pan the program gives a stem says so, and goes once the pan is edited by hand;
     3. the check after an export warns about sound in one ear only, unless the timeline puts it there on purpose;
     4. Replace file… (stereo → mono) centres channel 0 only when its −1 is the program's (panAuto).
   The export itself is run end to end in mono-pan-export.test.js. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MontClipEdit = require("../edit-ops.js");
const ProjectOps = require("../project-ops.js");
const Delivery = require("../delivery.js");
const { SRC } = require("./timeline-sandbox");
const { makeDataDir, seedProject, startServer, startMcp } = require("./helpers");

function slice(start, end) {
  const a = SRC.indexOf(start), b = SRC.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `markers not found: ${start} … ${end}`);
  return SRC.slice(a, b);
}
const mono = { id: "m1", kind: "video", duration: 10, audioChannels: 1 };
const vid = (extra = {}) => ({ id: "v", kind: "video", mediaId: "m1", track: "V1", start: 0, in: 0, duration: 2, linkGroup: "lg1", props: { volume: 0 }, ...extra });
const stem = (id, props, extra = {}) => ({ id, kind: "audio", mediaId: "m1", track: "A1", start: 0, in: 0, duration: 2, linkGroup: "lg1", props: { audioChannel: 0, ...props }, ...extra });

/* ── 1. finding them ── */
test("left-ear mono stems: channel 0 of a mono file, pan exactly −1, no pan keys, alone in its link group", () => {
  const doc = (clips, media = [mono]) => ({ media, clips });
  assert.deepEqual(MontClipEdit.monoLeftStems(doc([vid(), stem("a", { pan: -1 })])).map((c) => c.id), ["a"]);
  assert.deepEqual(MontClipEdit.monoLeftStems(doc([stem("a", { pan: -1 }, { linkGroup: undefined })])).map((c) => c.id), ["a"], "no link group");
  assert.deepEqual(MontClipEdit.monoLeftStems(doc([vid(), stem("a", { pan: -1 })], [{ ...mono, audioChannels: undefined, channels: 1 }])).map((c) => c.id), ["a"], "decoded channels count too");
  const none = [
    [[vid(), stem("a", { pan: -0.99 })]],                                     // not exactly −1
    [[vid(), stem("a", { pan: -1 }, { keyframes: { pan: [{ t: 0, v: -1 }] } })]],   // keyed: on purpose
    [[vid(), stem("a", { pan: -1 }), stem("b", { audioChannel: 1, pan: 1 }, { track: "A2" })]],   // a pair
    [[vid(), stem("a", { pan: -1 })], [{ ...mono, audioChannels: 2 }]],         // a stereo file
    [[vid(), stem("a", { pan: -1 })], [{ ...mono, audioChannels: undefined }]], // channel count unknown
    [[vid(), stem("a", { pan: -1, audioChannel: 1 })]],                         // not channel 0
  ];
  for (const [clips, media] of none) assert.deepEqual(MontClipEdit.monoLeftStems(doc(clips, media)), [], JSON.stringify(clips.map((c) => [c.props, c.keyframes])));
});

test("settling the question: only when no timeline has such a stem and every stem's channel count is known", () => {
  const settle = (d) => [MontClipEdit.settleMonoPanReview(d), !!d.monoPanReviewed];
  assert.deepEqual(settle({ media: [mono], clips: [] }), [true, true], "an empty project");
  assert.deepEqual(settle({ media: [mono], clips: [vid(), stem("a", { pan: 0 })] }), [true, true]);
  assert.deepEqual(settle({ media: [mono], clips: [vid(), stem("a", { pan: -1 })] }), [false, false], "one to ask about");
  assert.deepEqual(settle({ media: [{ ...mono, audioChannels: undefined }], clips: [vid(), stem("a", { pan: 0 })] }), [false, false], "can't tell yet");
  assert.deepEqual(settle({ media: [mono], clips: [], sequences: [{ id: "main" }, { id: "s2", clips: [vid(), stem("a", { pan: -1 })] }] }), [false, false], "one in a sequence that isn't open");
  assert.deepEqual(settle({ media: [mono], clips: [], comps: [{ id: "k", clips: [vid(), stem("a", { pan: -1 })] }] }), [false, false], "one in a comp");
  assert.deepEqual(settle({ media: [mono], clips: [vid(), stem("a", { pan: -1 })], monoPanReviewed: true }), [false, true], "already answered");
});

/* The editor: checkMonoLeftStems / centreMonoStems sliced out of app.js. */
function promptWorld(doc) {
  const project = { media: [mono], clips: [], ...doc };
  const calls = { toast: [], undo: 0, save: 0 };
  const env = {
    project, MontClipEdit, state: { connected: true, compCtx: null, dirtyTimeline: false }, runtime: { projectId: "p1" }, EXPORT_JOB_PAGE: false,
    uiText: (k, v) => k + (v ? JSON.stringify(v) : ""), toastActions: (msg, actions) => calls.toast.push({ msg, actions }),
    pushUndo: () => { calls.undo++; }, scheduleSave: () => { calls.save++; }, renderInspector() {},
  };
  const code = slice("function checkMonoLeftStems(", "function scheduleSave(");
  const names = Object.keys(env);
  const fns = new Function(...names, `${code}\nreturn { checkMonoLeftStems, centreMonoStems };`)(...names.map((k) => env[k]));
  return { project, calls, env, ...fns };
}

test("opening an old project asks once, and blocks nothing: Both ears centres them as one undo step", () => {
  const w = promptWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 1);
  assert.equal(w.calls.toast[0].msg, 'own.mono-left{"n":1}');
  assert.deepEqual(w.calls.toast[0].actions.map((a) => a[0]), ["own.mono-left-centre", "own.mono-left-keep"]);
  assert.equal(w.project.clips[1].props.pan, -1, "nothing changes until the streamer answers");
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 1, "asked once per session, not on every reload");
  w.calls.toast[0].actions[0][1]();
  assert.equal(w.project.clips[1].props.pan, 0);
  assert.equal(w.calls.undo, 1, "one undo step");
  assert.equal(w.project.monoPanReviewed, true, "remembered");
  assert.ok(w.calls.save >= 1);
});

test("QQ: showing the question writes nothing — the project stays byte for byte until the streamer answers, and the answer lives in project.json", () => {
  const w = promptWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  const before = JSON.stringify(w.project);
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 1, "asked");
  assert.equal(JSON.stringify(w.project), before, "the question alone changes nothing in the project");
  assert.equal(w.calls.save, 0, "and saves nothing");
  assert.equal(w.calls.undo, 0);
  // where "asked once" lives: monoPanReviewed in the project (saved by serialize), never the window's storage
  const code = slice("function checkMonoLeftStems(", "function scheduleSave(");
  assert.doesNotMatch(code, /localStorage|sessionStorage|mcView\.set/);
  assert.match(SRC, /if \(project\.monoPanReviewed\) out\.monoPanReviewed = true;/, "serialized into project.json");
  // 〔改成两边都有〕: written then, as one undo step
  w.calls.toast[0].actions[0][1]();
  assert.equal(w.calls.undo, 1);
  assert.equal(w.project.monoPanReviewed, true);
  assert.ok(w.calls.save >= 1);
});

test("Keep as is: nothing changes, and the project never asks again", () => {
  const w = promptWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  w.checkMonoLeftStems();
  w.calls.toast[0].actions[1][1]();
  assert.equal(w.project.clips[1].props.pan, -1);
  assert.equal(w.calls.undo, 0);
  assert.equal(w.project.monoPanReviewed, true);
  w.env.runtime.monoLeftAsked.clear();   // a new session
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 1, "answered: not asked again");
});

test("no question when there is nothing to ask, in a comp, or in a page that only exports", () => {
  let w = promptWorld({ clips: [vid(), stem("a", { pan: 0 })] });
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 0);
  assert.equal(w.project.monoPanReviewed, true, "a project with none is settled quietly");
  w = promptWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  w.env.state.compCtx = {};
  w.checkMonoLeftStems();
  assert.equal(w.calls.toast.length, 0);
  // a stem edited between the question and the answer is left alone
  w = promptWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  w.checkMonoLeftStems();
  w.project.clips[1].props.pan = -0.5;
  w.calls.toast[0].actions[0][1]();
  assert.equal(w.project.clips[1].props.pan, -0.5);
  assert.equal(w.calls.undo, 0);
  assert.match(slice("function checkMonoLeftStems(", "function scheduleSave("), /EXPORT_JOB_PAGE/);
});

test("the MCP status warns about left-ear mono stems until the question is answered", async (t) => {
  const doc = seedProject({ panSchema: 1, media: [{ ...mono, name: "mic.mp4", src: "/media/mic.mp4" }], clips: [vid(), stem("c_left", { pan: -1 })] });
  const dir = makeDataDir(t, doc);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: "1" });
  const mcp = startMcp(t, dir, { FABLECUT_PORT: String(new URL(base).port), FABLECUT_NO_AUTOSTART: "1" });
  await mcp.request("initialize", { protocolVersion: "2025-11-25" });
  const s = await mcp.callTool("fablecut_status");
  assert.match(s.text, /WARNING — mono audio in the left ear only: c_left/);
  assert.match(s.text, /Only if the user asks/);
  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify({ ...doc, revision: 2, monoPanReviewed: true }));
  const s2 = await mcp.callTool("fablecut_status");
  assert.doesNotMatch(s2.text, /left ear only/);
});

test("setProject takes monoPanReviewed (true / false / null) and nothing else for it", () => {
  const p = { media: [mono], clips: [vid(), stem("a", { pan: -1 })] };
  ProjectOps.applyPatch(p, [{ op: "setProject", set: { monoPanReviewed: true } }]);
  assert.equal(p.monoPanReviewed, true);
  assert.throws(() => ProjectOps.applyPatch(p, [{ op: "setProject", set: { monoPanReviewed: "yes" } }]), /true or false/);
});

/* ── 2. panAuto ── */
test("panAuto: every stem the program pans says so", () => {
  for (const [m, stems] of [[{ ...mono }, 1], [{ ...mono, audioChannels: 2 }, 2]]) {
    const project = { clips: [], media: [m] };
    const E = MontClipEdit.create({ doc: () => project, tracks: () => ["V1", "A1", "A2"].map((id) => ({ id, kind: id[0] === "A" ? "audio" : "video" })),
      trackLocked: () => false, trackTargeted: () => true });
    E.insertAt(m, 0, 2, 0);
    const s = project.clips.filter((c) => c.kind === "audio");
    assert.equal(s.length, stems);
    assert.ok(s.every((c) => c.props.panAuto === true), JSON.stringify(s.map((c) => c.props)));
  }
  assert.match(slice("function attachLinkedAudioChannels(", "function addClipFromMedia("), /panAuto: true/);
  assert.match(slice("async function reconcileAudioChannels(", "/* Apply a named title style"), /pan: defaultPanForChannel\(ch, wantCh\), panAuto: true/);
  assert.match(slice("const migratePan = ", "project.panSchema = 1;"), /c\.props\.panAuto = true;/, "the pre-pan migration's pans are the program's too");
});

test("panAuto goes when the pan is edited by hand: the slider, a reset, a keyframe", () => {
  const code = slice("function refreshAudioHoldFor(", "function applyInspectorReset(") + slice("function toggleKfAtPlayhead(", "\n}\n") + "\n}\n";
  const env = {
    ANIMATABLE: ["pan", "volume"], DEFAULT_PROPS: { pan: 0, volume: 1 }, state: { time: 1, dirtyTimeline: false }, inspPropGen: 0, self: { MontClipMotion: { hasPathHandles: () => false } },
    scheduleAudioHoldRefresh() {}, playheadOverClip: () => true, kfAtPlayhead: () => null, kfTimeEps: () => 0.001,
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)), ensureFont() {}, kfChannel: (c, k) => c.props[k],
  };
  const names = Object.keys(env);
  const f = new Function(...names, `${code}\nreturn { setAnimProp, resetPropChannel, resetPropAtPlayhead, toggleKfAtPlayhead };`)(...names.map((k) => env[k]));
  const fresh = () => ({ start: 0, duration: 2, props: { pan: -1, panAuto: true, volume: 1 } });
  let c = fresh(); f.setAnimProp(c, "pan", -0.4); assert.equal(c.props.panAuto, undefined, "slider");
  c = fresh(); f.resetPropChannel(c, "pan"); assert.equal(c.props.panAuto, undefined, "reset");
  c = fresh(); f.resetPropAtPlayhead(c, "pan"); assert.equal(c.props.panAuto, undefined, "reset at the playhead");
  c = fresh(); f.toggleKfAtPlayhead(c, "pan"); assert.equal(c.props.panAuto, undefined, "keyframe");
  c = fresh(); f.setAnimProp(c, "volume", 0.5); assert.equal(c.props.panAuto, true, "another prop leaves it");
});

test("an agent's pan is on purpose too: updateClip with a pan drops panAuto (unless it sets panAuto itself)", () => {
  const p = () => ({ media: [mono], clips: [vid(), stem("a", { pan: 0, panAuto: true })], monoPanReviewed: true });
  let d = p(); ProjectOps.applyPatch(d, [{ op: "updateClip", id: "a", set: { props: { pan: -1 } } }]);
  assert.equal(d.clips[1].props.panAuto, undefined);
  d = p(); ProjectOps.applyPatch(d, [{ op: "updateClip", id: "a", set: { keyframes: { pan: [{ t: 0, v: 0 }, { t: 1, v: -1 }] } } }]);
  assert.equal(d.clips[1].props.panAuto, undefined);
  d = p(); ProjectOps.applyPatch(d, [{ op: "updateClip", id: "a", set: { props: { volume: 0.5 } } }]);
  assert.equal(d.clips[1].props.panAuto, true);
  d = p(); ProjectOps.applyPatch(d, [{ op: "updateClip", id: "a", set: { props: { pan: -1, panAuto: true } } }]);
  assert.equal(d.clips[1].props.panAuto, true);
});

test("a patch on a project with nothing to ask about settles it first, so the agent's −1 that follows counts as on purpose", () => {
  const d = { media: [mono], clips: [vid(), stem("a", { pan: 0, panAuto: true })] };
  ProjectOps.applyPatch(d, [{ op: "updateClip", id: "a", set: { props: { pan: -1 } } }]);
  assert.equal(d.monoPanReviewed, true);
  const old = { media: [mono], clips: [vid(), stem("a", { pan: -1 })] };
  ProjectOps.applyPatch(old, [{ op: "updateClip", id: "v", set: { name: "x" } }]);
  assert.equal(old.monoPanReviewed, undefined, "an old project with one still waits for the streamer");
});

/* ── 4. Replace file… stereo → mono ── */
function reconcileWorld(clips, media) {
  const project = { clips, media: [media] };
  let n = 0;
  const env = {
    project, DEFAULT_PROPS: { volume: 1 }, MontClipEdit, MAX_TRACKS_PER_KIND: 16, uid: () => "n" + (++n),
    getClip: (id) => project.clips.find((c) => c.id === id) || null, getMedia: (id) => project.media.find((m) => m.id === id),
    audioTrackIds: () => ["A1", "A2", "A3", "A4"], ensureAudioTrackCount: () => 0, isEditTarget: () => true,
    releaseClipEl() {}, scheduleSave() {}, rebuildClips() {}, renderInspector() {}, toast() {}, state: {},
    MontClipView: { tp: () => "" }, mcView: { get: () => ({}) }, // main (#139): the channel toasts speak through the language table
    detectChannelCount: async (m) => m.channels,
  };
  const code = ["const defaultPanForChannel = MontClipEdit.defaultPanForChannel;", slice("async function reconcileAudioChannels(", "/* Apply a named title style")].join("\n");
  const names = Object.keys(env);
  return { project, ...new Function(...names, `${code}\nreturn { reconcileAudioChannels };`)(...names.map((k) => env[k])) };
}
test("Replace file… with a mono file centres the left stem only when its −1 is the program's (panAuto)", async () => {
  const pair = (auto) => [vid(), stem("a", { pan: -1, ...(auto ? { panAuto: true } : {}) }), stem("b", { audioChannel: 1, pan: 1, ...(auto ? { panAuto: true } : {}) }, { track: "A2" })];
  let w = reconcileWorld(pair(true), { id: "m1", kind: "video", channels: 1 });
  await w.reconcileAudioChannels(w.project.clips[0]);
  assert.deepEqual(w.project.clips.filter((c) => c.kind === "audio").map((c) => [c.id, c.props.pan]), [["a", 0]]);
  w = reconcileWorld(pair(false), { id: "m1", kind: "video", channels: 1 });
  await w.reconcileAudioChannels(w.project.clips[0]);
  assert.deepEqual(w.project.clips.filter((c) => c.kind === "audio").map((c) => [c.id, c.props.pan]), [["a", -1]], "no marker: left as it is");
});

/* ── 3. the check after the export ── */
test("one-sided sound: measured per channel, warned when the sides are over 20 dB apart and the louder one is heard", () => {
  const stderr = "[Parsed_astats_0 @ 1] Channel: 1\n[Parsed_astats_0 @ 1] RMS level dB: -9.03\n[Parsed_astats_0 @ 1] Channel: 2\n[Parsed_astats_0 @ 1] RMS level dB: -inf\n";
  assert.deepEqual(Delivery.parseChannelLevels(stderr), [-9.03, -91]);
  assert.equal(Delivery.parseChannelLevels("nothing"), null);
  assert.deepEqual(Delivery.oneSided([-9.03, -91]), { side: "left", L: -9, R: -91 });
  assert.deepEqual(Delivery.oneSided([-80, -12]), { side: "right", L: -80, R: -12 });
  assert.equal(Delivery.oneSided([-12, -30]), null, "18 dB apart: a mix leaning left, not one ear");
  assert.equal(Delivery.oneSided([-70, -91]), null, "barely anything on either side");
  assert.equal(Delivery.oneSided([-12, -12, -12]), null, "not stereo");
  assert.deepEqual(Delivery.CHANNEL_LEVEL_ARGS("x.mkv").slice(-5, -3), ["-af", "astats=measure_perchannel=RMS_level:measure_overall=none"]);
});

test("the export report: a warning that keeps the file, unless the timeline put the sound there on purpose", () => {
  const spec = Delivery.normalize("archive").spec;
  const probe = { streams: [{ codec_type: "video", codec_name: "ffv1", width: 320, height: 180, avg_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "pcm_s24le", sample_rate: "48000", channels: 2 }], format: { duration: "2" } };
  const ctx = { hasAudio: true, loudWanted: true, loud: { lufs: -12, truePeak: -6 }, channelLevels: [-9.2, -91] };
  const r = Delivery.verify(spec, probe, ctx);
  const c = r.checks.find((x) => x.code === "AUDIO_ONE_SIDED");
  assert.ok(c && !c.ok, JSON.stringify(r.checks));
  assert.deepEqual([c.side, c.L, c.R], ["left", -9.2, -91]);
  assert.match(r.line, /⚠ only the left channel has sound \(left -9\.2 dB, right -91 dB\)/);
  assert.ok(!Delivery.verify(spec, probe, { ...ctx, panIntent: true }).checks.some((x) => x.code), "on purpose: no warning");
  assert.ok(!Delivery.verify(spec, probe, { ...ctx, channelLevels: [-12, -12.4] }).checks.some((x) => x.code), "both ears: no warning");
  // QQ: judged on the finished file only — under 2 s, or silent all through, is never reported
  const short = { ...probe, format: { duration: "1.9" } };
  assert.ok(!Delivery.verify(spec, short, ctx).checks.some((x) => x.code), "a file under 2 s: not judged");
  const shortStream = { ...probe, streams: [probe.streams[0], { ...probe.streams[1], duration: "1.5" }], format: { duration: "3" } };
  assert.ok(!Delivery.verify(spec, shortStream, ctx).checks.some((x) => x.code), "the audio stream's own length counts first");
  assert.ok(!Delivery.verify(spec, { ...probe, format: {} }, ctx).checks.some((x) => x.code), "length unknown: not judged");
  assert.ok(!Delivery.verify(spec, probe, { ...ctx, channelLevels: [-91, -91] }).checks.some((x) => x.code), "silent all through: not reported");
  assert.equal(Delivery.oneSided([-9, -91], 1.99), null);
  assert.deepEqual(Delivery.oneSided([-9, -91], 2), { side: "left", L: -9, R: -91 });
  const monoOut = { ...probe, streams: [probe.streams[0], { ...probe.streams[1], channels: 1 }] };
  assert.ok(!Delivery.verify(spec, monoOut, { ...ctx, channelLevels: [-9.2] }).checks.some((x) => x.code), "a mono file has no sides");
});

const UI = require("../ui-preferences.js");
const zh = (k, v) => UI.t("zh-CN", "own." + k, v), en = (k, v) => UI.t("en", "own." + k, v);

test("JJ定稿, word for word: the open-project question and its buttons", () => {
  assert.equal(zh("mono-left", { n: 2 }), "这个项目里有 2 段声音只在左边耳机里有。要改成两边都有吗？");
  assert.equal(en("mono-left", { n: 2 }), "2 sounds in this project only play in the left ear. Make them play in both?");
  assert.deepEqual([zh("mono-left-centre"), zh("mono-left-keep")], ["改成两边都有", "不用"]);
  assert.deepEqual([en("mono-left-centre"), en("mono-left-keep")], ["Play in both", "Not now"]);
  const SRC_UI = fs.readFileSync(path.join(__dirname, "..", "ui-preferences.js"), "utf8");
  assert.match(SRC_UI, /JJ定稿 \(2026-11-05, via Deja\)[^\n]*\n\s*"mono-left"/);
  assert.match(SRC_UI, /JJ定稿 \(2026-11-05, via Deja\)[^\n]*\n[^\n]*\n[^\n]*\n\s*"export-one-sided-left-fix"/);
});

test("JJ定稿, word for word: the export warnings, left and right, with and without a cause; no dB in them", () => {
  assert.equal(zh("export-one-sided-left-fix"), "导出的视频只有左边耳机有声音，右边几乎听不到。如果不是你故意这样放的，可以先改成两边都有再导出一次。");
  assert.equal(zh("export-one-sided-right-fix"), "导出的视频只有右边耳机有声音，左边几乎听不到。如果不是你故意这样放的，可以先改成两边都有再导出一次。");
  assert.equal(en("export-one-sided-left-fix"), "The exported video only has sound in the left ear; the right is almost silent. If you didn't mean it, make the sound play in both ears and export again.");
  assert.equal(en("export-one-sided-right-fix"), "The exported video only has sound in the right ear; the left is almost silent. If you didn't mean it, make the sound play in both ears and export again.");
  assert.deepEqual([zh("export-one-sided-fix"), en("export-one-sided-fix")], ["改成两边都有", "Play in both"]);
  assert.equal(zh("export-one-sided-left"), "导出的视频只有左边耳机有声音，右边几乎听不到。");
  assert.equal(zh("export-one-sided-right"), "导出的视频只有右边耳机有声音，左边几乎听不到。");
  assert.equal(en("export-one-sided-left"), "The exported video only has sound in the left ear; the right is almost silent.");
  assert.equal(en("export-one-sided-right"), "The exported video only has sound in the right ear; the left is almost silent.");
  // the 〔复制问题信息〕 half: JJ定稿 in both languages, the button's name from its key
  assert.equal(zh("export-one-sided-copy-tail", { button: zh("export-one-sided-copy-button") }), "如果不是你故意的，点〔复制问题信息〕发给我们。");
  assert.equal(en("export-one-sided-copy-tail", { button: en("export-one-sided-copy-button") }), "If you didn't mean it, click “Copy problem details” and send it to us.");
  const SRC_UI = fs.readFileSync(path.join(__dirname, "..", "ui-preferences.js"), "utf8");
  assert.match(SRC_UI, /JJ定稿 \(2026-11-05, via Deja; zh and en\)[^\n]*\n[^\n]*\n[^\n]*\n\s*"export-one-sided-copy-tail"/);
  for (const k of ["export-one-sided-left-fix", "export-one-sided-right-fix", "export-one-sided-left", "export-one-sided-right"])
    assert.doesNotMatch(zh(k) + en(k), /dB|\{/, k);
});

/* The warning after an export, sliced out of app.js with the real wording (zh-CN) and the real fix. */
function warnWorld(doc, { lang = "zh-CN", copyTail = false } = {}) {
  const project = { media: [mono], clips: [], ...doc };
  const calls = { toast: [], plain: [], undo: 0, save: 0 };
  const env = {
    project, MontClipEdit, state: { connected: true, compCtx: null, dirtyTimeline: false }, runtime: { projectId: "p1" }, EXPORT_JOB_PAGE: false,
    mcView: { get: () => ({ language: lang }) }, uiText: (k, v) => UI.t(lang, k, v),
    toastActions: (msg, actions) => calls.toast.push({ msg, actions }), toast: (msg) => calls.plain.push(msg),
    pushUndo: () => { calls.undo++; }, scheduleSave: () => { calls.save++; }, renderInspector() {},
  };
  const code = slice("function checkMonoLeftStems(", "function scheduleSave(") + slice("const ONE_SIDED_COPY_TAIL", "function exportAudioHeard(").replace("const ONE_SIDED_COPY_TAIL = false;", `const ONE_SIDED_COPY_TAIL = ${copyTail};`);
  const names = Object.keys(env);
  const fns = new Function(...names, `${code}\nreturn { oneSidedWarning, showOneSidedWarning, exportCheckText, exportReportLine, checkMonoLeftStems };`)(...names.map((k) => env[k]));
  return { project, calls, ...fns };
}
const check = (side) => ({ ok: false, code: "AUDIO_ONE_SIDED", side, L: side === "left" ? -9.2 : -91, R: side === "left" ? -91 : -9.2, text: "x" });

test("after an export, cause found (mono sounds put in that ear): JJ's sentence and 〔改成两边都有〕, the same fix as the open-project question", () => {
  const w = warnWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  w.showOneSidedWarning(check("left"));
  assert.equal(w.calls.plain.length, 0);
  assert.equal(w.calls.toast.length, 1);
  assert.equal(w.calls.toast[0].msg, "导出的视频只有左边耳机有声音，右边几乎听不到。如果不是你故意这样放的，可以先改成两边都有再导出一次。");
  assert.deepEqual(w.calls.toast[0].actions.map((x) => x[0]), ["改成两边都有"]);
  w.calls.toast[0].actions[0][1]();
  // what the open-project question's 〔改成两边都有〕 does: centred, one undo step, settled
  const q = warnWorld({ clips: [vid(), stem("a", { pan: -1 })] });
  q.checkMonoLeftStems(); q.calls.toast[0].actions[0][1]();
  for (const x of [w, q]) {
    assert.equal(x.project.clips[1].props.pan, 0);
    assert.equal(x.calls.undo, 1);
    assert.equal(x.project.monoPanReviewed, true);
  }
  // the same on the right
  const r = warnWorld({ clips: [vid(), stem("a", { pan: 1, panAuto: true })] });
  r.showOneSidedWarning(check("right"));
  assert.equal(r.calls.toast[0].msg, "导出的视频只有右边耳机有声音，左边几乎听不到。如果不是你故意这样放的，可以先改成两边都有再导出一次。");
  r.calls.toast[0].actions[0][1]();
  assert.equal(r.project.clips[1].props.pan, 0);
});

test("after an export, no cause found (e.g. a stereo recording with the voice on one channel): the first half only, no button", () => {
  const stereo = { ...mono, audioChannels: 2 };
  const w = warnWorld({ media: [stereo], clips: [vid(), stem("a", { pan: -1, panAuto: true }), stem("b", { audioChannel: 1, pan: 1, panAuto: true }, { track: "A2" })] });
  w.showOneSidedWarning(check("left"));
  assert.equal(w.calls.toast.length, 0, "no button");
  assert.deepEqual(w.calls.plain, ["导出的视频只有左边耳机有声音，右边几乎听不到。"]);
  w.showOneSidedWarning(check("right"));
  assert.equal(w.calls.plain[1], "导出的视频只有右边耳机有声音，左边几乎听不到。");
  assert.match(slice("const ONE_SIDED_COPY_TAIL", "function oneSidedWarning("), /const ONE_SIDED_COPY_TAIL = false;/, "the 〔复制问题信息〕 half waits for #161");
  // the queue says the same, without the numbers; they stay on the check for the developer line
  assert.equal(w.exportReportLine({ line: "x", checks: [{ ok: true, text: "ffv1" }, check("left")] }), "ffv1 · ⚠ 导出的视频只有左边耳机有声音，右边几乎听不到。");
  assert.equal(w.exportReportLine({ line: "as it was", checks: [{ ok: true, text: "ffv1" }] }), "as it was");
});

test("on purpose (a pan set by hand or keyed): no warning at all — and the button shows only where the editor can fix it", () => {
  // the report never carries the check then (verify with panIntent, above, and the third export in mono-pan-export.test.js)
  const show = slice("function showOneSidedWarning(", "/** A check from the export report");
  assert.match(show, /if \(w\.ids\) toastActions\(w\.text, \[\[uiText\("own\.export-one-sided-fix"\), \(\) => centreMonoStems\(w\.ids, w\.side\)\]\]\);/);
  assert.match(SRC, /data-q-fix="\$\{q\.id\}">\$\{escapeHtml\(uiText\("own\.export-one-sided-fix"\)\)\}/, "the queue row has the button too, from its key");
  assert.match(SRC, /if \(w && w\.ids\) centreMonoStems\(w\.ids, w\.side\);/);
  assert.match(SRC, /savedMsg: oneSided \? \(\) => showOneSidedWarning\(oneSided\) :/, "a single export's toast is the warning");
});

test("on purpose: pan keyframes, any pan without panAuto (old projects' left-ear stems too — QQ: better to miss one), a track or bus pan", () => {
  const run = (doc) => {
    const project = { media: [mono], clips: [], tracks: [], buses: [], ...doc };
    return new Function("project", "MontClipEdit", "clipRenders", slice("function exportPanIntent(", "/* The plain one-sided warning") + "\nreturn exportPanIntent();")(project, MontClipEdit, () => true);
  };
  assert.equal(run({ clips: [vid(), stem("a", { pan: -1, panAuto: true })] }), false, "the program's pan");
  assert.equal(run({ clips: [vid(), stem("a", { pan: -1 })] }), true, "an old stem nobody answered for: no panAuto, so not reported — only the open-project question deals with it");
  assert.equal(run({ clips: [vid(), stem("a", { pan: -1 })], monoPanReviewed: true }), true, "kept as it is: on purpose");
  assert.equal(run({ clips: [vid(), stem("a", { pan: -0.6 })] }), true, "a pan set by hand");
  assert.equal(run({ clips: [vid(), stem("a", { pan: 0 }, { keyframes: { pan: [{ t: 0, v: 0 }, { t: 1, v: -1 }] } })] }), true, "pan keys");
  assert.equal(run({ clips: [vid(), stem("a", { pan: 0 })], tracks: [{ id: "A1", kind: "audio", pan: -1 }] }), true, "a track pan");
  assert.equal(run({ clips: [vid(), stem("a", { pan: 0 })], buses: [{ id: "B1", pan: 0.8 }] }), true, "a bus pan");
  assert.equal(run({ clips: [vid(), stem("a", { pan: 0 })] }), false, "centred");
});

test("once 〔复制问题信息〕 sits next to the export result (ONE_SIDED_COPY_TAIL on), the plain warning reads in full — JJ定稿, zh and en", () => {
  const stereo = { ...mono, audioChannels: 2 };
  const clips = [vid(), stem("a", { pan: -1, panAuto: true }), stem("b", { audioChannel: 1, pan: 1, panAuto: true }, { track: "A2" })];
  const z = warnWorld({ media: [stereo], clips }, { copyTail: true });
  z.showOneSidedWarning(check("left"));
  assert.deepEqual(z.calls.plain, ["导出的视频只有左边耳机有声音，右边几乎听不到。如果不是你故意的，点〔复制问题信息〕发给我们。"]);
  const e = warnWorld({ media: [stereo], clips }, { lang: "en", copyTail: true });
  e.showOneSidedWarning(check("right"));
  assert.deepEqual(e.calls.plain, ["The exported video only has sound in the right ear; the left is almost silent. If you didn't mean it, click “Copy problem details” and send it to us."]);
  // still off for now, and a cause found never gets this half
  assert.match(SRC, /const ONE_SIDED_COPY_TAIL = false;/);
  const f = warnWorld({ clips: [vid(), stem("a", { pan: -1 })] }, { copyTail: true });
  f.showOneSidedWarning(check("left"));
  assert.equal(f.calls.toast[0].msg, "导出的视频只有左边耳机有声音，右边几乎听不到。如果不是你故意这样放的，可以先改成两边都有再导出一次。");
});
