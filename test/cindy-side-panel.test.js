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
  assert.deepEqual(f.props, [["音量", "50%"]], "plain names; speed 1 is the default, so it is not said");
  assert.deepEqual(f.keyframes, ["缩放"]);
  assert.equal(f.kindLabel, "视频");
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
  tick(); tick(); tick(); assert.equal(posted.length, 1, "nothing changed: nothing sent at once");
  tick(); assert.equal(posted.length, 2, "but once a second anyway, so the panel knows the editor is still open (it gives up after 3 s)");
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

/* JJ's words for 属性 and 文稿 (2026-11-04; the property names are a first version, for JJ to settle) */
test("属性: 类型 in plain words — 视频 / 音频 / 图片 / 字幕 / 文字 / 其他, and in English", () => {
  const c = (kind, props = {}) => ({ id: "x", kind, track: "V1", start: 0, in: 0, duration: 1, props });
  const zh = ["video", "audio", "image", "svg", "shape", "adjust", "null", "comp"].map((k) => M.kindLabel(c(k)));
  assert.deepEqual(zh, ["视频", "音频", "图片", "其他", "其他", "其他", "其他", "其他"]);
  assert.equal(M.kindLabel(c("text", { caption: true })), "字幕");
  assert.equal(M.kindLabel(c("text", { text: "标题" })), "文字");
  assert.deepEqual(["video", "audio", "image", "svg"].map((k) => M.kindLabel(c(k), "en")), ["Video", "Audio", "Image", "Other"]);
  assert.deepEqual([M.kindLabel(c("text", { caption: true }), "en"), M.kindLabel(c("text"), "en")], ["Caption", "Text"]);
});

test("属性: 素材起点 only for a clip with a file; a caption has none", () => {
  const p = { media: [{ id: "m", name: "rec.mp4", kind: "video", duration: 60 }],
    clips: [{ id: "v", kind: "video", mediaId: "m", track: "V1", start: 0, in: 5, duration: 10, props: {} },
      text("t", 0, 3, "我是这耀眼的瞬间", { props: { caption: true } })] };
  assert.equal(M.clipFacts(p, "v").in, 5);
  assert.equal(M.clipFacts(p, "t").in, null);
  const panel = fs.readFileSync(path.join(PLUGIN, "embed", "panel.js"), "utf8");
  assert.match(panel, /if \(f\.in !== null\) rows\.push\(\["素材起点", M\.formatTime\(f\.in\)\]\);/);
  assert.doesNotMatch(panel, /素材入点/);
});

test("属性: property names in plain words with their units; defaults and the title's own text are not shown", () => {
  const rows = M.propRows({ text: "我是这耀眼的瞬间", volume: 0.8, gain: -3.5, speed: 1.5, pan: 0.25, scale: 1.2, x: 120, y: -40,
    rotation: 15, opacity: 0.5, brightness: 110, contrast: 100, saturation: 80, font: "Inter", fontSize: 72, color: "#ffd166", filterPreset: "noir", textAnim: "word-pop" });
  assert.deepEqual(rows, [["音量", "80%"], ["音量增减", "−3.5 分贝"], ["速度", "1.5 倍"], ["左右声道", "偏右 25%"], ["缩放", "120%"],
    ["位置", "横 +120 · 竖 −40"], ["旋转", "+15°"], ["不透明度", "50%"], ["亮度", "110%"], ["饱和度", "80%"], ["字体", "Inter"], ["字号", "72"],
    ["文字颜色", "#ffd166"], ["滤镜", "noir"], ["文字动画", "word-pop"]]);
  assert.deepEqual(M.propRows({ volume: 1, gain: 0, speed: 1, pan: 0, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, brightness: 100,
    contrast: 100, saturation: 100, filterPreset: "none", textAnim: "none" }), [], "the editor's defaults say nothing");
  assert.deepEqual(M.propRows({ pan: -1, x: 0, y: 30 }), [["左右声道", "偏左 100%"], ["位置", "横 0 · 竖 +30"]]);
  assert.deepEqual(M.propRows({ volume: 0.8, gain: 2, speed: 2, pan: 0 }, "en"), [["Volume", "80%"], ["Gain", "+2 dB"], ["Speed", "2×"]]);
  assert.equal(M.propName("opacity"), "不透明度");
  assert.equal(M.propName("y"), "位置");
  assert.equal(M.propName("hue"), "hue", "a channel not in the list keeps its key");
});

test("文稿 and the editor being closed: JJ's sentences", () => {
  const page = fs.readFileSync(path.join(PLUGIN, "embed", "panel.html"), "utf8");
  assert.ok(page.includes('<p id="offline" class="offline" hidden>剪辑器没有打开，所以没跳过去。先打开右侧栏的「MontClip 剪辑器」，再点一次。</p>'));
  assert.ok(page.includes("还没有字幕。在剪辑器里听写或加字幕后，这里会按时间列出每一句，点一句就跳到那里。"));
});
