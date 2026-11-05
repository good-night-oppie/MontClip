"use strict";
const test = require("node:test"), a = require("node:assert/strict"), V = require("../ui-preferences");
test("JJ's final repair tooltip and encoder refusal, word for word", () => {
  a.equal(V.t("en", "own.media-slow-mark"), "This recording didn't finish properly, so scrubbing may be slow. Right-click → “Fix it for me” to save a complete copy.");
  a.equal(V.t("zh-CN", "own.repair-encoder-missing", { name: "x" }), "「x」要重新编码才能修，这台电脑上的 FFmpeg 做不了，所以没有修，也没有生成新文件。原文件没有改动。换成完整版 FFmpeg 以后再试。");
  a.equal(V.t("en", "own.repair-encoder-missing", { name: "x" }), "“x” needs re-encoding to be fixed, and the FFmpeg on this computer can't do that, so nothing was fixed or saved. The original file is unchanged. Switch to a full version of FFmpeg and try again.");
  a.equal(V.t("zh-CN", "own.repair-button-tip"), "另存一份完整的 MP4 来替换它。原文件不动，按 Ctrl+Z 可以换回来。");
});
