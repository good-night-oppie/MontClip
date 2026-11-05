/* The editor inside Cindy (?host=cindy, host-embed.js): no built-in assistant (Cindy's chat takes its place), and the
   colours follow Cindy's light / dark theme. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");
const Host = require("../host-embed");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("host, theme and theme messages are read strictly", () => {
  assert.equal(Host.hostFrom("?host=cindy&token=x"), "cindy");
  assert.equal(Host.hostFrom("?host=evil"), null);
  assert.equal(Host.hostFrom(""), null);
  assert.equal(Host.schemeFrom("light"), "light");
  assert.equal(Host.schemeFrom("dark light"), "dark", "a CSS color-scheme list: its first word");
  assert.equal(Host.schemeFrom("normal"), null);
  assert.equal(Host.themeMessage({ type: "montclip-host-theme", scheme: "light" }), "light");
  assert.equal(Host.themeMessage({ type: "other", scheme: "light" }), null);
  assert.equal(Host.themeMessage("light"), null);
});

function fakeWindow(search) {
  const listeners = [];
  const parent = {};
  const win = {
    parent, location: { search },
    document: { documentElement: { dataset: {} } },
    addEventListener: (type, fn) => { if (type === "message") listeners.push(fn); },
  };
  return { win, parent, post: (data, source) => listeners.forEach((fn) => fn({ data, source })) };
}

test("install: embedded only with ?host=cindy; the theme follows the page that frames the editor, and nothing else", () => {
  const plain = fakeWindow("");
  assert.deepEqual(Host.install(plain.win), { embedded: false, host: null });
  assert.deepEqual(plain.win.document.documentElement.dataset, {});

  const f = fakeWindow("?host=cindy&theme=light");
  assert.deepEqual(Host.install(f.win), { embedded: true, host: "cindy" });
  const ds = f.win.document.documentElement.dataset;
  assert.deepEqual([ds.host, ds.hostTheme], ["cindy", "light"]);
  f.post({ type: "montclip-host-theme", scheme: "dark" }, f.parent);
  assert.equal(ds.hostTheme, "dark");
  f.post({ type: "montclip-host-theme", scheme: "light" }, {});      // another window
  assert.equal(ds.hostTheme, "dark");
  f.post({ type: "montclip-host-theme", scheme: "purple" }, f.parent);
  assert.equal(ds.hostTheme, "dark");

  const noTheme = fakeWindow("?host=cindy");
  Host.install(noTheme.win);
  assert.equal(noTheme.win.document.documentElement.dataset.hostTheme, "dark", "the editor's own theme until told");
});

test("the page loads host-embed.js before app.js, and the playground copies it", () => {
  const html = read("index.html");
  const at = (f) => html.indexOf(`<script src="${f}"></script>`);
  assert.ok(at("host-embed.js") >= 0 && at("host-embed.js") < at("app.js"));
  assert.match(read("docs/demo/sync.js"), /"host-embed\.js"/);
});

test("embedded: the built-in assistant is hidden and cannot be opened; light theme re-maps every surface colour", () => {
  const css = read("style.css");
  for (const id of ["mcAssistant", "mcAssistantTab", "mcAssistantPanel"])
    assert.match(css, new RegExp(`html\\[data-host\\] #${id}[^{]*\\{ display: none !important; \\}`));
  const rootVars = (block) => new Set([...block.matchAll(/(--[a-z0-9-]+):\s*#/g)].map((m) => m[1]));
  const dark = rootVars(/:root \{([\s\S]*?)\n\}/.exec(css)[1]);
  const light = rootVars(/html\[data-host-theme="light"\] \{([\s\S]*?)\n\}/.exec(css)[1]);
  for (const v of dark) if (v !== "--accent" && v !== "--accent-2" && v !== "--danger") assert.ok(light.has(v), "light theme sets " + v);
  assert.match(css, /html\[data-host-theme="light"\] \{\s*color-scheme: light;/);
  const app = read("app.js");
  assert.match(app, /function setSideTab\(tab\) \{\n {2}if \(tab === "assistant" && typeof MontClipHost !== "undefined" && MontClipHost\.embedded\) tab = "inspector";/);
});

test("the plugin page sends Cindy's theme to the editor: in its URL, then by message to the editor's origin only", () => {
  const js = read("plugins/montclip-cindy/frame.js");
  assert.match(js, /'theme=' \+ scheme\(\)/);
  assert.match(js, /postMessage\(\{ type: 'montclip-host-theme', scheme: now \}, new URL\(url\)\.origin\)/);
});
