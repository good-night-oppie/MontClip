/* Team rule 3: what the streamer reads never names an internal tool (montclip_…, fablecut_…). Every string the plugin's
   pages and chat cards show is collected — the HTML text and its labels, the string literals of the page scripts, and
   the cards and page answers main.js builds — and none may name one. Tool descriptions and the category RULES are for
   the agent, not the streamer, and are not collected. The few that still do wait for JJ's words: they are listed in
   PENDING_JJ and the test fails on any other, and on a listed one that is gone (then take it off the list). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");
const PLUGIN = path.join(ROOT, "plugins", "montclip-cindy");
const TOOL_NAME = /\b(?:montclip|fablecut)_[a-z_]+/i;

/* String literals of a script, comments left out ('…', "…", `…` with ${} kept as text). */
function literals(src) {
  const out = [];
  for (let i = 0; i < src.length;) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { i = src.indexOf("\n", i); if (i < 0) break; continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2); if (i < 0) break; i += 2; continue; }
    if (c === "'" || c === '"' || c === "`") {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== c) { if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++]; }
      out.push(s); i = j + 1; continue;
    }
    // a regex literal after an operator: skip it whole, so its quotes are not taken for strings
    if (c === "/" && /[=(,:!&|?;{}]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
      let j = i + 1;
      while (j < src.length && src[j] !== "/" && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      i = j + 1; continue;
    }
    i++;
  }
  return out;
}
/* What an HTML page shows: its text (scripts, styles and comments left out) and its labels. */
function htmlStrings(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const text = body.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
  const labels = [...body.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  return [...text, ...labels];
}
/* main.js: only what reaches the streamer — the chat cards (export, status, the card button's answer) and the words a
   page shows when the engine refuses to start. */
function mainJsShown(src) {
  const part = (from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i + 1); assert.ok(i >= 0 && j > i, from); return src.slice(i, j); };
  return [
    part("const DATA_DIR_IN_USE_TEXT", "function engineError("),
    part("function exportCard(", "function sendCard("),
    part("function statusCard(", "\n}\n"),
    part("async montclip_export(", "\n  },\n"),
    part("msg.actionId === 'open-editor'", "return;\n  }"),
  ].flatMap(literals);
}

function shownStrings() {
  const out = [];
  const add = (file, list) => { for (const s of list) out.push({ file, s }); };
  for (const f of ["main-view.html", "task-view.html", "panel.html", "embed/panel.html"])
    if (fs.existsSync(path.join(PLUGIN, f))) add(f, htmlStrings(fs.readFileSync(path.join(PLUGIN, f), "utf8")));
  for (const f of ["frame.js", "main-view.js", "main-view-model.js", "embed/panel.js", "embed/panel-model.js"])
    if (fs.existsSync(path.join(PLUGIN, f))) add(f, literals(fs.readFileSync(path.join(PLUGIN, f), "utf8")));
  add("main.js", mainJsShown(fs.readFileSync(path.join(PLUGIN, "main.js"), "utf8")));
  return out;
}

/* Waiting for JJ's words (2026-11-04): each still names a tool. */
const PENDING_JJ = [
  { file: "main-view.js", has: "montclip_export" },             // where the exported files are
  { file: "main-view.html", has: "montclip_open_task_view" },   // the overview with no projects yet
  { file: "main.js", has: "fablecut_export" },                  // the export card while the export is still running
];

test("the collector finds the strings the streamer reads (a check that the check works)", () => {
  const all = shownStrings().map((x) => x.s);
  for (const s of ["把 MontClip 固定到左侧导航", "在这个任务里打开剪辑器", "导出完成", "剪辑器没有打开，所以没跳过去。先打开右侧栏的「MontClip 剪辑器」，再点一次。"])
    assert.ok(all.some((x) => x.includes(s)), s);
  assert.ok(!all.some((x) => x.includes("Times are seconds on the timeline")), "the agent's RULES are not collected");
  assert.ok(!all.some((x) => x.includes("starts only from its button")), "comments are not collected");
});

test("no string the streamer reads names an internal tool (montclip_…, fablecut_…), except those waiting for JJ", () => {
  const found = shownStrings().filter((x) => TOOL_NAME.test(x.s)).map((x) => ({ file: x.file, has: TOOL_NAME.exec(x.s)[0] }));
  const pending = (f) => PENDING_JJ.some((p) => p.file === f.file && p.has === f.has);
  assert.deepEqual(found.filter((f) => !pending(f)), [], "a tool name where the streamer reads it");
  for (const p of PENDING_JJ)
    assert.ok(found.some((f) => f.file === p.file && f.has === p.has), `${p.file} no longer names ${p.has}: take it off PENDING_JJ`);
});

test.todo("JJ's words for the three strings that still name a tool (main-view.js, main-view.html, the export card)");
