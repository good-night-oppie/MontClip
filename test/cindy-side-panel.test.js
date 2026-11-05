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
  assert.deepEqual(f.props, [["音量", "50%"], ["速度", "原速"]], "JJ's names; what the clip does not have is not shown");
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

/* JJ's final words for the 15 properties (2026-11-04), word for word */
const DEFAULTS = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, volume: 1, pan: 0, gain: 0, speed: 1, filterPreset: "none",
  text: "Title", fontSize: 72, color: "#ffffff", font: "Segoe UI", textAnim: "none" };   // what the editor gives every clip

test("属性: the 15 properties in JJ's words, Chinese and English", () => {
  const titled = { ...DEFAULTS, text: "我是这耀眼的瞬间", font: "Inter", fontSize: 88, color: "#ffd166", scale: 1.2, x: 120, y: -40, rotation: 15, opacity: 0.8, textAnim: "word-pop" };
  assert.deepEqual(M.propRows(titled, "zh-CN", "text", "一个标题"), [
    ["文字内容", "我是这耀眼的瞬间"], ["字体", "Inter"], ["字号", "88"], ["颜色", "#ffd166", "#ffd166"],
    ["缩放", "120%"], ["位置", "横 120，竖 −40"], ["旋转", "15°"], ["不透明度", "80%"], ["文字动画", "word-pop"]]);
  assert.deepEqual(M.propRows(titled, "en", "text", "A title"), [
    ["Text", "我是这耀眼的瞬间"], ["Font", "Inter"], ["Size", "88"], ["Color", "#ffd166", "#ffd166"],
    ["Scale", "120%"], ["Position", "X 120, Y −40"], ["Rotation", "15°"], ["Opacity", "80%"], ["Text animation", "word-pop"]]);
  const loud = { ...DEFAULTS, volume: 0.8, gain: 3, speed: 1.5, pan: -0.3, filterPreset: "noir" };
  assert.deepEqual(M.propRows(loud, "zh-CN", "video"), [
    ["音量", "80%"], ["音量增减", "+3 分贝"], ["速度", "1.5 倍"], ["左右声道", "偏左 30%"],
    ["缩放", "100%"], ["位置", "横 0，竖 0"], ["旋转", "0°"], ["不透明度", "100%"], ["滤镜", "noir"]]);
  assert.deepEqual(M.propRows(loud, "en", "video"), [
    ["Volume", "80%"], ["Gain", "+3 dB"], ["Speed", "1.5×"], ["Pan", "Left 30%"],
    ["Scale", "100%"], ["Position", "X 0, Y 0"], ["Rotation", "0°"], ["Opacity", "100%"], ["Filter", "noir"]]);
});

test("属性: the values JJ named — 不变 / 0 dB, 原速, 居中, 偏右, −2 分贝, 1 as 100%", () => {
  const row = (props, lang, key) => M.propRows({ ...DEFAULTS, ...props }, lang, "audio").find((r) => r[0] === key)[1];
  assert.equal(row({}, "zh-CN", "音量增减"), "不变");
  assert.equal(row({}, "en", "Gain"), "0 dB");
  assert.equal(row({ gain: -2 }, "zh-CN", "音量增减"), "−2 分贝");
  assert.equal(row({ gain: -2 }, "en", "Gain"), "−2 dB");
  assert.equal(row({}, "zh-CN", "速度"), "原速");
  assert.equal(row({}, "zh-CN", "音量"), "100%");
  assert.equal(row({}, "zh-CN", "左右声道"), "居中");
  assert.equal(row({}, "en", "Pan"), "Center");
  assert.equal(row({ pan: 0.3 }, "zh-CN", "左右声道"), "偏右 30%");
  assert.equal(row({ pan: 0.3 }, "en", "Pan"), "Right 30%");
  assert.equal(M.propRows({ ...DEFAULTS, opacity: 0.8 }, "zh-CN", "image").find((r) => r[0] === "不透明度")[1], "80%");
});

test("属性: each kind shows what means something for it; the text is not repeated when it is the name", () => {
  const names = (kind, name) => M.propRows(DEFAULTS, "zh-CN", kind, name).map((r) => r[0]);
  assert.deepEqual(names("audio"), ["音量", "音量增减", "速度", "左右声道"], "a sound clip: sound only, no Title / Segoe UI");
  assert.deepEqual(names("video"), ["音量", "音量增减", "速度", "左右声道", "缩放", "位置", "旋转", "不透明度", "滤镜"]);
  assert.deepEqual(names("image"), ["缩放", "位置", "旋转", "不透明度", "滤镜"]);
  assert.deepEqual(names("text", "Title"), ["字体", "字号", "颜色", "缩放", "位置", "旋转", "不透明度", "文字动画"], "the name already says the text");
  assert.ok(names("text", "片头").includes("文字内容"), "a title named otherwise shows its text");
  const p = { media: [], clips: [text("t", 0, 3, "我是这耀眼的瞬间", { props: { ...DEFAULTS, text: "我是这耀眼的瞬间", caption: true } })] };
  assert.ok(!M.clipFacts(p, "t").props.some((r) => r[0] === "文字内容"), "a caption named by its own words: not repeated");
});

test("属性: the 关键帧 row uses the same names; no key such as opacity or scale reaches the page", () => {
  const p = { media: [], clips: [{ id: "v", kind: "image", track: "V1", start: 0, in: 0, duration: 4, props: { ...DEFAULTS },
    keyframes: { opacity: [{ t: 0, v: 0 }], scale: [{ t: 0, v: 1 }], x: [{ t: 0, v: 0 }], y: [{ t: 0, v: 0 }], rotation: [] } }] };
  assert.deepEqual(M.clipFacts(p, "v").keyframes, ["不透明度", "缩放", "位置"]);
  assert.deepEqual(M.clipFacts(p, "v", "en").keyframes, ["Opacity", "Scale", "Position"]);
  const f = M.clipFacts(p, "v");
  const shown = JSON.stringify([f.props, f.keyframes, f.kindLabel]);
  for (const key of ["opacity", "scale", "volume", "rotation", "fontSize", "filterPreset", "textAnim"]) assert.ok(!shown.includes(`"${key}"`), key);
  // 颜色 shows a swatch, then the value
  const panel = fs.readFileSync(path.join(PLUGIN, "embed", "panel.js"), "utf8");
  assert.match(panel, /chip\.className = "swatch"; chip\.style\.background = swatch;/);
});

test("文稿 and the editor being closed: JJ's sentences", () => {
  const page = fs.readFileSync(path.join(PLUGIN, "embed", "panel.html"), "utf8");
  assert.ok(page.includes('<p id="offline" class="offline" hidden>剪辑器没有打开，所以没跳过去。先打开右侧栏的「MontClip 剪辑器」，再点一次。</p>'));
  assert.ok(page.includes("还没有字幕。在剪辑器里听写或加字幕后，这里会按时间列出每一句，点一句就跳到那里。"));
});

test("the panel keeps its last highlight when the editor goes quiet (a background tab's timers are slowed — VV, #114)", () => {
  const panel = fs.readFileSync(path.join(PLUGIN, "embed", "panel.js"), "utf8");
  assert.equal((panel.match(/editor = null/g) || []).length, 1, "only the declaration: silence never clears the editor's state");
  assert.doesNotMatch(panel, /editorSeen > \d+\) \{ editor = null/);
  // a click still picks the way: the channel when the editor was heard from lately, else /api/ui/command
  assert.match(panel, /if \(ch && Date\.now\(\) - editorSeen < 3000\) \{ ch\.postMessage\(\{ type: "seek", t \}\); return; \}/);
  assert.match(panel, /fetch\("\/api\/ui\/command"/);
});
