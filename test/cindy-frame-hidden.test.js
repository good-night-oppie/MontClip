/* The plugin pages (task-view.html, panel.html) hide 正在启动… / banners with the hidden attribute. frame.css gives
   #status display:flex and position:absolute over the whole page; an id rule beats the browser's [hidden] rule, so
   without an explicit [hidden] rule the "hidden" status stays on top of the editor frame and takes every click. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");
const css = fs.readFileSync(path.join(ROOT, "plugins/montclip-cindy/frame.css"), "utf8");

test("frame.css: [hidden] wins over every display rule, so the hidden status cannot cover the editor", () => {
  assert.match(css, /^\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/m,
    "a global `[hidden] { display: none !important; }`");
});

test("frame.css: the status layer the code hides is one the [hidden] rule must beat", () => {
  // guards the reason for the rule above: if #status stops being an absolute layer, revisit this test
  assert.match(css, /#status\s*\{[^}]*position:\s*absolute[^}]*display:\s*flex/);
  const frameJs = fs.readFileSync(path.join(ROOT, "plugins/montclip-cindy/frame.js"), "utf8");
  assert.match(frameJs, /status\.hidden = true/);
});
