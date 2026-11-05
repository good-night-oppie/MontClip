"use strict";
const test = require("node:test"), a = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const V = require("../ui-preferences"), M = require("../media-lib");
const app = fs.readFileSync(require.resolve("../app"), "utf8");
test("stored resolution is localized in every editor view; the agent keeps its English description", () => {
  const body = app.match(/function mediaResolution\(m\) \{[\s\S]*?\n\}/);
  const description = app.match(/function mediaDescription\(m\) \{[\s\S]*?\n\}/);
  a.ok(body, "editor resolution formatter");
  a.ok(description, "hover descriptions use the same localized resolution");
  const m = { width: 1920, height: 1080, storedWidth: 1440, storedHeight: 1080 };
  for (const [lang, expected] of [["zh-CN", "1920×1080（文件里存的是 1440×1080）"], ["en", "1920×1080 (stored as 1440×1080)"]]) {
    const ctx = { uiText: (key, args) => V.t(lang, key, args), MediaLib: M };
    vm.createContext(ctx); vm.runInContext(body[0] + "\n" + description[0], ctx);
    a.equal(ctx.mediaResolution(m), expected);
    a.equal(ctx.mediaDescription(m), expected);
    a.equal(ctx.mediaResolution({ width: 1920, height: 1080 }), "1920×1080");
    a.equal(ctx.mediaResolution({ width: 1920, height: 1080, storedWidth: 1920, storedHeight: 1080 }), "1920×1080");
    a.equal(ctx.mediaResolution(null), "");
  }
  a.equal(M.fmtRes(m), "1920×1080 (stored as 1440×1080)");
  a.equal(M.fmtRes({ width: 1920, height: 1080, storedWidth: 1920, storedHeight: 1080 }), "1920×1080");
  a.doesNotMatch(app, /MediaLib\.fmtRes\(m\)/, "bin list, grid and inspector use localized labels");
  a.doesNotMatch(app, /MediaLib\.describe\(m\)/, "hover text also uses the localized description");
  a.equal((app.match(/mediaResolution\(m\)/g) || []).length, 5);
});
