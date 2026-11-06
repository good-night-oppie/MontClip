/* highlights.js (Highlights… in the sequence menu) and highlight-candidates.js (高光候选, 自动出切片) are both plain
   scripts in index.html. They once both set self.MontClipHighlights, so the one loaded second replaced the other and
   Highlights… failed with "Highlights.sourcesOf is not a function". Load them the way the page does and check that
   each caller gets the module it uses. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// the scripts index.html loads, in its order, run in one browser-like global (no module, no require)
function loadPage(html, dir = root) {
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const wanted = srcs.filter((s) => s === "highlights.js" || s === "highlight-candidates.js");
  const ctx = vm.createContext({});
  ctx.self = ctx; ctx.window = ctx;
  for (const s of wanted) vm.runInContext(fs.readFileSync(path.join(dir, s), "utf8"), ctx, { filename: s });
  return { ctx, wanted };
}

test("index.html loads both highlight scripts", () => {
  assert.deepEqual(loadPage(read("index.html")).wanted.sort(), ["highlight-candidates.js", "highlights.js"]);
});

test("the editor's Highlights (sequence menu) is highlights.js, not the candidates", () => {
  const { ctx } = loadPage(read("index.html"));
  const app = read("app.js");
  const m = app.match(/^const Highlights = self\.(\w+);/m);
  assert.ok(m, "app.js reads Highlights from a global");
  const H = ctx[m[1]];
  const want = require("../highlights.js");
  for (const fn of ["sourcesOf", "pick", "describe", "ops", "options", "picture", "sound", "shots", "score"])
    assert.equal(typeof H[fn], "function", `Highlights.${fn}`);
  for (const k of ["SAMPLE_W", "PIC_FPS"]) assert.equal(H[k], want[k], k);
  // every Highlights.x app.js uses exists
  const used = new Set([...app.matchAll(/\bHighlights\.(\w+)/g)].map((x) => x[1]));
  for (const k of used) assert.ok(k in H, `app.js uses Highlights.${k}`);
});

test("高光候选 and 自动出切片 get highlight-candidates.js under their own name", () => {
  const { ctx } = loadPage(read("index.html"));
  const want = require("../highlight-candidates.js");
  const app = read("app.js");
  const names = new Set([...app.matchAll(/\b(MontClip\w*Highlight\w*)\.(\w+)/g)].map((x) => x[1]));
  assert.ok(names.size >= 1);
  for (const name of names) {
    const C = ctx[name];
    assert.ok(C, name + " is set");
    assert.notEqual(C, ctx[app.match(/^const Highlights = self\.(\w+);/m)[1]], name + " is not the Highlights module");
    for (const k of [...app.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, "g"))].map((x) => x[1]))
      assert.equal(typeof C[k], typeof want[k], `${name}.${k}`);
  }
  for (const fn of ["candidates", "clock", "seconds", "emptyReason", "mapLoudness"])
    assert.equal(typeof ctx.MontClipHighlightCandidates[fn], "function", fn);
});

test("no two browser scripts set the same MontClip global", () => {
  const seen = new Map();
  for (const f of fs.readdirSync(root).filter((f) => f.endsWith(".js"))) {
    for (const m of read(f).matchAll(/\b(?:root|self|window|globalThis)\.(MontClip\w+)\s*=(?!=)/g)) {
      const prev = seen.get(m[1]);
      assert.ok(!prev || prev === f, `${m[1]} is set by both ${prev} and ${f}`);
      seen.set(m[1], f);
    }
  }
});

test("the demo copy loads them the same way", () => {
  const dir = path.join(root, "docs", "demo");
  if (!fs.existsSync(path.join(dir, "index.html"))) return;
  const { ctx } = loadPage(fs.readFileSync(path.join(dir, "index.html"), "utf8"), dir);
  assert.equal(typeof ctx.MontClipHighlights.sourcesOf, "function");
  assert.equal(typeof ctx.MontClipHighlightCandidates.candidates, "function");
});
