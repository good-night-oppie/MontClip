/* The plugin's right-sidebar panel (文稿 / 属性): the lines and facts it reads from the project, the manifest entry,
   and the editor side of the channel it talks over (app.js startHostChannel). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const M = require(path.join(PLUGIN, "embed", "panel-model.js"));

const text = (id, start, duration, t, extra = {}) => ({ id, kind: "text", mediaId: null, track: extra.track || "V2", start, in: 0, duration, props: { text: t, ...(extra.props || {}) }, ...(extra.clip || {}) });

test("文稿: captions when there are any, else every title; by start; disabled clips and tracks left out", () => {
  const p = { clips: [
    text("b", 5, 2, "第二句"), text("a", 1, 3, "第一句\n换行"), text("off", 0, 1, "停用", { clip: { disabled: true } }),
    text("muted", 2, 1, "停用轨道", { track: "V3" }), text("blank", 3, 1, "  "),
    { id: "v", kind: "video", mediaId: "m", track: "V1", start: 0, in: 0, duration: 10 },
  ], disabledTracks: ["V3"] };
  assert.deepEqual(M.lines(p).map((l) => [l.id, l.start, l.end, l.text]), [["a", 1, 4, "第一句 换行"], ["b", 5, 7, "第二句"]]);
  p.clips.push(text("c", 8, 1, "字幕", { props: { caption: true } }));
  assert.deepEqual(M.lines(p).map((l) => l.id), ["c"], "captions only, once there are captions");
  assert.deepEqual(M.lines({}), []);
});

test("文稿 follows the playhead: the line being shown, none in a gap", () => {
  const list = [{ start: 1, end: 4 }, { start: 5, end: 7 }];
  assert.deepEqual([0, 1, 3.99, 4.5, 5, 6.9, 9].map((t) => M.currentIndex(list, t)), [-1, 0, 0, -1, 1, 1, -1]);
  assert.deepEqual([0, 65.25, 3723].map(M.formatTime), ["0:00.0", "1:05.3", "1:02:03.0"]);
});

test("属性: the selected clip's timing, file and set props; null when nothing is selected", () => {
  const p = { media: [{ id: "m", name: "rec.mp4", kind: "video", duration: 720, width: 1920, height: 1080, fps: 60, codec: "h264" }],
    lockedTracks: ["V1"],
    clips: [{ id: "v", kind: "video", mediaId: "m", track: "V1", start: 2, in: 10, duration: 5, props: { volume: 0.5, speed: 1, x: undefined }, keyframes: { scale: [{ t: 0, v: 1 }], x: [] } }] };
  const f = M.clipFacts(p, "v");
  assert.deepEqual([f.name, f.start, f.end, f.in, f.locked, f.disabled], ["rec.mp4", 2, 7, 10, true, false]);
  assert.deepEqual(f.props, { volume: 0.5, speed: 1 });
  assert.deepEqual(f.keyframes, ["scale"]);
  assert.deepEqual([f.media.width, f.media.fps, f.media.codec], [1920, 60, "h264"]);
  assert.equal(M.clipFacts(p, "nope"), null);
});

test("manifest: the panel sits in the right sidebar and frames the engine's panel page, which the build copies", () => {
  const m = JSON.parse(fs.readFileSync(path.join(PLUGIN, "ghost.json"), "utf8"));
  assert.equal(m.panel.position, "right");
  const shell = fs.readFileSync(path.join(PLUGIN, m.panel.html), "utf8");
  assert.match(shell, /data-view="panel" data-engine-path="\/cindy\/panel\.html"/);
  const page = fs.readFileSync(path.join(PLUGIN, "embed", "panel.html"), "utf8");
  for (const src of ["/host-embed.js", "panel-model.js", "panel.js"]) assert.ok(page.includes(`<script src="${src}"></script>`), src);
  assert.match(fs.readFileSync(path.join(PLUGIN, "build.cjs"), "utf8"), /path\.join\(OUT, "cindy", f\)/);
  // the lines are buttons: a keyboard or an accessibility "invoke" reaches them, not only a pointer
  assert.match(fs.readFileSync(path.join(PLUGIN, "embed", "panel.js"), "utf8"), /createElement\("button"\)/);
});

test("editor: inside Cindy it tells the panel where the playhead is and takes its seeks", () => {
  const SRC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const i = SRC.indexOf("function startHostChannel()"), j = SRC.indexOf("\n}\n", i) + 3;
  const posted = [];
  let channel = null, tick = null;
  class FakeChannel { constructor(name) { this.name = name; channel = this; } postMessage(m) { posted.push(m); } }
  const state = { time: 1.234, playing: false, selId: "c1" };
  const env = { BroadcastChannel: FakeChannel, runtime: { projectId: "p_1" }, state, project: { revision: 4 },
    setTime: (t) => { state.time = t; }, projDur: () => 60, setInterval: (fn) => { tick = fn; } };
  const names = Object.keys(env);
  new Function(...names, SRC.slice(i, j) + "\nstartHostChannel();")(...names.map((k) => env[k]));
  assert.equal(channel.name, "montclip-editor");
  assert.deepEqual(posted.at(-1), { type: "editor-state", time: 1.23, playing: false, selId: "c1", revision: 4, projectId: "p_1" });
  tick(); assert.equal(posted.length, 1, "nothing changed: nothing sent");
  state.time = 2; tick(); assert.equal(posted.at(-1).time, 2);
  channel.onmessage({ data: { type: "seek", t: 90 } });
  assert.equal(state.time, 60, "kept inside the timeline");
  assert.equal(posted.at(-1).time, 60);
  channel.onmessage({ data: { type: "seek", t: -5 } });
  channel.onmessage({ data: { type: "seek", t: "x" } });
  assert.equal(state.time, 60);
  const n = posted.length;
  channel.onmessage({ data: { type: "hello" } });
  assert.equal(posted.length, n + 1, "a panel that opens later gets the state at once");
});
