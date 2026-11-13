"use strict";
// Deja (2026-11-02, from #57's checks): (a) the desktop app hides 「+ 网址」 — its service refuses URL imports anyway
// (403 NETWORK_DISABLED), while the web demo keeps the button; (b) the sentence button shows one language, the
// interface's, instead of 「按句选段 / Select sentences」.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const View = require("../ui-preferences");

test("the sentence button has its own key, one language at a time", () => {
  assert.equal(View.t("zh-CN", "own.tr-sentences"), "按句选段");
  assert.equal(View.t("en", "own.tr-sentences"), "Select sentences");
  const app = read("app.js");
  assert.doesNotMatch(app, /按句选段 \/ Select sentences/, "no two-language label");
  // written in the interface language, and marked so a language switch rewrites it
  assert.match(app, /<button type="button" class="btn tiny" data-tr-sentences data-i18n="own\.tr-sentences">\$\{escapeHtml\(uiText\("own\.tr-sentences"\)\)\}<\/button>/);
});

test("the desktop app hides + URL; the page decides by the desktop preload, the service still refuses", () => {
  const app = read("app.js"), server = read("server/server.js"), css = read("style.css");
  assert.match(app, /if \(window\.montclipViewSettings\) \{ const urlButton = \$\("btnImportUrl"\); if \(urlButton\) urlButton\.hidden = true; \}/);
  assert.match(css, /#btnImportUrl\[hidden\] \{ ?display: ?none;? ?\}/, ".btn would otherwise win over [hidden]");
  assert.match(server, /if \(DESKTOP\) \{\s*sendJSON\(res, 403, \{ code: "NETWORK_DISABLED"/, "the desktop service refuses URL imports as before");
  assert.match(read("index.html"), /id="btnImportUrl"/, "the web demo keeps the button");
});
