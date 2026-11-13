/* Deja (2026-11-03): the canvas aspect drop-down (#aspectSel) put the project's width and height into its "Custom"
   option's HTML as they were in project.json — the same problem QQ found on the project cards (#68). An agent, another
   tool or a backup can write project.json; a width of "<b>x</b>" drew that HTML in the monitor header. The option text
   now carries the size as written, escaped, and never as markup. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app/app.js"), "utf8");
const take = (start, end) => { const i = app.indexOf(start), j = app.indexOf(end, i); assert.ok(i >= 0 && j > i, start); return app.slice(i, j); };

function run(project) {
  // the real functions from app.js: escapeHtml, the presets and the two drop-downs; a select that parses its HTML
  const ctx = { project, els: { aspectSel: { innerHTML: "" }, fpsSel: { innerHTML: "" } } };
  vm.runInNewContext(take("function escapeHtml(", "\n}\n") + "\n}\n" + take("const ASPECT_PRESETS = [", "];") + "];\n" +
    take("const FPS_PRESETS", ";") + ";\n" + take("function syncAspectSel()", "els.aspectSel.addEventListener"), ctx);
  vm.runInContext("syncAspectSel(); syncFpsSel();", ctx);
  return ctx.els;
}

test("a project size written as markup is shown as text in the Custom option, not drawn", () => {
  const { aspectSel } = run({ width: "<b>x</b>", height: "<img src=x onerror=alert(1)>", fps: 30 });
  assert.doesNotMatch(aspectSel.innerHTML, /<b>|<img/, aspectSel.innerHTML);
  assert.match(aspectSel.innerHTML, /&lt;b&gt;x&lt;\/b&gt;×&lt;img src=x onerror=alert\(1\)&gt;/);
});
test("an ordinary custom size still reads Custom · W×H; a preset size selects the preset", () => {
  assert.match(run({ width: 1234, height: 567, fps: 30 }).aspectSel.innerHTML, /<option value="custom" selected>Custom · 1234×567<\/option>/);
  const preset = run({ width: 1920, height: 1080, fps: 30 }).aspectSel.innerHTML;
  assert.doesNotMatch(preset, /value="custom"/);
  assert.match(preset, /selected/);
});
test("the frame-rate drop-down only ever shows a number it parsed", () => {
  const { fpsSel } = run({ width: 1920, height: 1080, fps: "30<i>" });
  assert.doesNotMatch(fpsSel.innerHTML, /<i>/);
});
