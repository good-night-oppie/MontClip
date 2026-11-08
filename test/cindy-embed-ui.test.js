/* The editor inside Cindy (?host=cindy, host-embed.js): no built-in assistant (Cindy's chat takes its place), and the
   colours follow Cindy's light / dark theme — ?theme=light|dark at load, then theme messages from the page that frames
   the editor (its window and its origin), nothing else. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./helpers");
const Host = require("../host-embed");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const PARENT = "https://plugin.cindy.example";

test("host, theme and theme messages are read strictly", () => {
  assert.equal(Host.hostFrom("?host=cindy&token=x"), "cindy");
  assert.equal(Host.hostFrom("?host=evil"), null);
  assert.equal(Host.hostFrom(""), null);
  assert.equal(Host.schemeFrom("light"), "light");
  assert.equal(Host.schemeFrom("dark"), "dark");
  for (const bad of ["normal", "dark light", "light dark", "Light", "DARK", " light", "light ", "", null, undefined, 1, {}])
    assert.equal(Host.schemeFrom(bad), null, "only light / dark exactly: " + JSON.stringify(bad));
  assert.equal(Host.themeMessage({ type: "montclip-host-theme", scheme: "light" }), "light");
  assert.equal(Host.themeMessage({ type: "montclip-host-theme", scheme: "purple" }), null);
  assert.equal(Host.themeMessage({ type: "other", scheme: "light" }), null);
  assert.equal(Host.themeMessage("light"), null);
});

function fakeWindow(search, { ancestor = PARENT, referrer = "", framed = true } = {}) {
  const listeners = [];
  const win = {
    location: { search, ancestorOrigins: ancestor ? [ancestor] : [] },
    document: { documentElement: { dataset: {} }, referrer },
    addEventListener: (type, fn) => { if (type === "message") listeners.push(fn); },
  };
  win.parent = framed ? {} : win;
  return { win, parent: win.parent, post: (data, source, origin) => listeners.forEach((fn) => fn({ data, source, origin })) };
}
const theme = { type: "montclip-host-theme" };

test("install: embedded only with ?host=cindy; ?theme= takes only light or dark", () => {
  const plain = fakeWindow("");
  assert.deepEqual(Host.install(plain.win), { embedded: false, host: null });
  assert.deepEqual(plain.win.document.documentElement.dataset, {});

  const f = fakeWindow("?host=cindy&theme=light");
  const installed = Host.install(f.win);
  assert.deepEqual({ embedded: installed.embedded, host: installed.host }, { embedded: true, host: "cindy" });
  assert.equal(typeof installed.taskConnected, "function", "embedded: the event stream hands its id in (MontClip-Cindy#18)");
  assert.deepEqual({ ...f.win.document.documentElement.dataset }, { host: "cindy", hostTheme: "light" });

  for (const bad of ["purple", "Light", "light%20dark", "dark,light", "", "%3Cscript%3E"]) {
    const w = fakeWindow("?host=cindy&theme=" + bad);
    Host.install(w.win);
    assert.equal(w.win.document.documentElement.dataset.hostTheme, "dark", "an unknown ?theme= is ignored: " + bad);
  }
  const noTheme = fakeWindow("?host=cindy");
  Host.install(noTheme.win);
  assert.equal(noTheme.win.document.documentElement.dataset.hostTheme, "dark", "the editor's own theme until told");
});

test("theme messages count only from the framing page's window AND origin", () => {
  const f = fakeWindow("?host=cindy&theme=light");
  Host.install(f.win);
  const ds = f.win.document.documentElement.dataset;
  f.post({ ...theme, scheme: "dark" }, f.parent, PARENT);
  assert.equal(ds.hostTheme, "dark", "the framing page, its own origin");
  f.post({ ...theme, scheme: "light" }, {}, PARENT);
  assert.equal(ds.hostTheme, "dark", "another window (a popup, another frame) with the parent's origin is ignored");
  f.post({ ...theme, scheme: "light" }, f.parent, "https://evil.example");
  assert.equal(ds.hostTheme, "dark", "the parent window but another origin (it navigated away) is ignored");
  f.post({ ...theme, scheme: "light" }, f.win, PARENT);
  assert.equal(ds.hostTheme, "dark", "the editor's own window is not its parent");
  f.post({ ...theme, scheme: "purple" }, f.parent, PARENT);
  assert.equal(ds.hostTheme, "dark", "an unknown scheme from the parent is ignored");
  f.post({ ...theme, scheme: "light dark" }, f.parent, PARENT);
  assert.equal(ds.hostTheme, "dark", "a scheme list is not a scheme");
  f.post({ type: "other", scheme: "light" }, f.parent, PARENT);
  assert.equal(ds.hostTheme, "dark", "another message type is ignored");
  f.post({ ...theme, scheme: "light" }, f.parent, PARENT);
  assert.equal(ds.hostTheme, "light");
});

test("the framing page's origin: ancestorOrigins, else the referrer; none, opaque or unframed accepts no message", () => {
  assert.equal(Host.parentOrigin(fakeWindow("").win), PARENT);
  assert.equal(Host.parentOrigin(fakeWindow("", { ancestor: null, referrer: PARENT + "/task/1?x=y" }).win), PARENT);
  assert.equal(Host.parentOrigin(fakeWindow("", { ancestor: null }).win), null);
  assert.equal(Host.parentOrigin(fakeWindow("", { ancestor: "null" }).win), null);
  assert.equal(Host.parentOrigin(fakeWindow("", { framed: false }).win), null);

  for (const opts of [{ ancestor: null }, { ancestor: "null" }, { framed: false }]) {
    const f = fakeWindow("?host=cindy&theme=light", opts);
    Host.install(f.win);
    f.post({ ...theme, scheme: "dark" }, f.parent, opts.ancestor === "null" ? "null" : PARENT);
    f.post({ ...theme, scheme: "dark" }, f.parent, "null");
    assert.equal(f.win.document.documentElement.dataset.hostTheme, "light", "no known parent origin: " + JSON.stringify(opts));
  }
});

test("the page loads host-embed.js before app.js, and the playground copies it", () => {
  const html = read("index.html");
  const at = (f) => html.indexOf(`<script src="${f}"></script>`);
  assert.ok(at("host-embed.js") >= 0 && at("host-embed.js") < at("app.js"));
  assert.match(read("docs/demo/sync.js"), /"host-embed\.js"/);
  assert.equal(read("docs/demo/host-embed.js"), read("host-embed.js"), "the playground's copy is current");
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
