"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const V = require("../ui-preferences");
test("JJ final gap wording composes the button from its own key", () => {
  const rows = [
    ["repair-editor-open", "剪辑器正开着，为了不冲掉你在里面的修改，助手先不直接修。请在剪辑器里点〔帮我修好〕，这样你的修改不会丢，也能撤销。", "The editor is open, so the assistant won't fix this directly and risk overwriting your edits there. Click “Fix it for me” in the editor instead; your edits stay and you can undo."],
    ["media-gap-mark", "断了约 295 秒", "Gap of about 295 s"],
    ["media-gap-tip", "录像中间有一段约 295 秒的空档。点〔帮我修好〕，会另存一份跳过空档的新文件，原文件不动。", "The recording has a gap of about 295 s in the middle. Click “Fix it for me” to save a new copy without the gap. The original is not changed."],
    ["repair-gap-reason", "这段录像中间断了约 295 秒。点〔帮我修好〕，会另存一份跳过这段空档的；原文件不动，可以撤销。", "This recording has a gap of about 295 s. “Fix it for me” saves a copy that skips the gap. The original is not changed, and you can undo."],
    ["repair-gap-aligned", "空档后面的弹幕和字幕已经跟着对齐。", "Danmaku and subtitles after the gap have been lined up too."],
  ];
  for (const [key, zh, en] of rows) for (const [lang, expected] of [["zh-CN", zh], ["en", en]])
    a.equal(V.t(lang, "own." + key, { N: 295, button: V.t(lang, "own.repair-button") }), expected);
  for (const lang of ["zh-CN", "en"]) for (const key of ["media-gap-tip", "repair-gap-reason", "repair-editor-open"])
    a.ok(V.t(lang, "own." + key, { N: 295, button: "BUTTON_FROM_KEY" }).includes("BUTTON_FROM_KEY"));
  const app = require("node:fs").readFileSync(require.resolve("../app.js"), "utf8");
  a.ok(!app.includes('uiText("own.repair-gap-aligned"'), "the extra success sentence stays off until browser/export acceptance");
});
