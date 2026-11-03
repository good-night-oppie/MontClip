"use strict";
// Simple mode (Deja, replacing #6): the advanced shortcuts do nothing — Alt+T, Shift+E/D, Ctrl/Cmd+L, [ ], B/R/Y/U,
// Alt+Z, T/Shift+T, Shift+Delete — the B/R/Y/U tools can't be switched to, and going to simple mode goes back to the
// selection tool (V) without touching the project, the selection or the history. Advanced mode is unchanged.
const test = require("node:test"), assert = require("node:assert/strict");
const { SRC } = require("./timeline-sandbox");
const View = require("../ui-preferences");

const START = 'window.addEventListener("keydown", (e) => {\n  const k = e.key;';
const start = SRC.indexOf(START), end = SRC.indexOf('window.addEventListener("resize",', start);
assert.ok(start >= 0 && end > start, "the main keydown handler");

// Runs the real handler with every name it uses stubbed: a call records itself.
function world(mode = "simple", { typing = false } = {}) {
  const calls = []; let handler;
  const fixed = {
    mcView: { get: () => ({ mode, language: "en" }) }, MontClipView: View,
    window: { addEventListener: (_n, fn) => { handler = fn; } },
    document: { activeElement: {} }, isTypingTarget: () => typing, clearFocusedTransition: () => false,
    $: () => ({ classList: { contains: () => false } }), els: { importUrlOverlay: null, btnSnap: { click: () => calls.push(["snap"]) } },
    state: { pps: 20, time: 2, source: { time: 0 } }, runtime: {}, project: { clips: [] }, projectFps: () => 30, isSourceMode: () => false,
    EDIT_TOOLS: { select: { key: "V" }, ripple: { key: "B" }, roll: { key: "R" }, slip: { key: "Y" }, slide: { key: "U" } },
  };
  const env = new Proxy(fixed, {
    has: () => true,
    get(t, name) {
      if (name === Symbol.unscopables) return undefined;
      if (name in t) return t[name];
      if (name in globalThis) return globalThis[name];
      return (...args) => { calls.push([name, ...args]); };
    },
  });
  new Function("env", "with (env) {" + SRC.slice(start, end) + "}")(env);
  return { calls, key(key, mods = {}) { const e = { key, code: mods.code || "", preventDefault() { this.prevented = true; }, ...mods }; handler(e); return e; } };
}

const ADVANCED = [
  ["t", { altKey: true }, "addTransitionAtPlayhead"], ["T", { altKey: true, shiftKey: true }, "addTransitionAtPlayhead"],
  ["E", { shiftKey: true }, "toggleClipsDisabled"], ["D", { shiftKey: true }, "crossfadeSelected"],
  ["l", { ctrlKey: true }, "toggleLinkSelected"], ["L", { metaKey: true }, "toggleLinkSelected"],
  ["[", {}, "trimToPlayhead"], ["]", {}, "trimToPlayhead"],
  ["b", {}, "setEditTool"], ["r", {}, "setEditTool"], ["y", {}, "setEditTool"], ["u", {}, "setEditTool"],
  ["z", { code: "KeyZ", altKey: true }, "zoomToWorkArea"],
  ["t", {}, "splitAtWorkArea"], ["T", { shiftKey: true }, "trimToWorkArea"],
  ["Delete", { shiftKey: true }, "rippleDeleteSelected"], ["Backspace", { shiftKey: true }, "rippleDeleteSelected"],
];

test("simple mode: every advanced shortcut does nothing (and the browser default is held back)", () => {
  for (const [key, mods] of ADVANCED) {
    const w = world("simple"), e = w.key(key, mods);
    assert.deepEqual(w.calls, [], JSON.stringify([key, mods]));
    assert.equal(e.prevented, true, JSON.stringify([key, mods]));
  }
});

test("advanced mode: the same shortcuts still run their actions", () => {
  for (const [key, mods, action] of ADVANCED) {
    const w = world("advanced"); w.key(key, mods);
    assert.equal(w.calls[0] && w.calls[0][0], action, JSON.stringify([key, mods]));
  }
});

test("simple mode keeps the everyday keys: V, play, shuttle, split, delete, undo / redo, zoom, marks, navigation", () => {
  for (const [key, mods, action] of [
    ["v", {}, "setEditTool"], [" ", {}, "toggleTransportPlay"], ["l", {}, "shuttle"], ["j", {}, "shuttle"], ["k", {}, "transportStop"],
    ["s", {}, "splitAtPlayhead"], ["Delete", {}, "deleteSelected"], ["Backspace", {}, "deleteSelected"],
    ["z", { ctrlKey: true }, "undo"], ["Z", { ctrlKey: true, shiftKey: true }, "redo"], ["y", { ctrlKey: true }, "redo"],
    ["z", { code: "KeyZ" }, "zoomToSelection"], ["Z", { code: "KeyZ", shiftKey: true }, "zoomToFit"],
    ["i", {}, "markIn"], ["o", {}, "markOut"], ["ArrowUp", {}, "goToEditPoint"], ["ArrowLeft", {}, "setTime"],
    ["Home", {}, "gotoTransportHome"], ["s", { ctrlKey: true }, "saveVersionNow"],
  ]) {
    const w = world("simple"); w.key(key, mods);
    assert.equal(w.calls[0] && w.calls[0][0], action, JSON.stringify([key, mods]));
  }
});

test("typing in a field: the keys go to the field, nothing is held back", () => {
  for (const [key, mods] of ADVANCED) {
    const w = world("simple", { typing: true }), e = w.key(key, mods);
    assert.deepEqual(w.calls, []);
    assert.equal(e.prevented, undefined, JSON.stringify([key, mods]));
  }
});

test("advancedShortcut matches exactly the listed combinations", () => {
  const is = (key, mods = {}) => View.advancedShortcut({ key, code: "", ...mods });
  for (const [key, mods] of ADVANCED) assert.equal(is(key, mods), true, JSON.stringify([key, mods]));
  for (const [key, mods] of [["v"], ["s"], ["l"], ["z", { ctrlKey: true }], ["l", { ctrlKey: true, shiftKey: true }], ["Delete"],
    ["e"], ["d"], ["B", { shiftKey: true }], ["z", { code: "KeyZ" }], ["t", { ctrlKey: true }], ["i"], [";"], ["g"]])
    assert.equal(is(key, mods), false, JSON.stringify([key, mods]));
});

test("the tools: simple mode refuses B/R/Y/U, and going to simple mode goes back to V without touching the edit", () => {
  const toolStart = SRC.indexOf("const EDIT_TOOLS = {"), toolEnd = SRC.indexOf('document.querySelectorAll("[data-edit-tool]").forEach', toolStart);
  const upStart = SRC.indexOf("function updateMontClipView(patch)"), upEnd = SRC.indexOf("\n}\n", upStart) + 3;
  assert.ok(toolStart >= 0 && toolEnd > toolStart && upStart >= 0 && upEnd > upStart);
  const store = new Map(), pref = View.create({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  const nodes = ["select", "ripple", "roll", "slip", "slide"].map((name) => ({ dataset: { editTool: name }, classList: { toggle() {} }, setAttribute(k, v) { this[k] = v; } }));
  const state = { tool: "select", selIds: new Set(["one"]) }, project = { clips: [{ id: "one", start: 1 }] }, runtime = { undo: ["u1"], redo: [] };
  const fixed = { mcView: pref, MontClipView: View, state, project, runtime, colorState: { ws: "edit" }, setWorkspace() {}, renderMontClipView() {}, refreshLanguageText() {}, refreshLocalizedViews() {}, toast() {},
    document: { querySelectorAll: () => nodes }, els: { tracksContent: { dataset: {} } } };
  const env = new Proxy(fixed, { has: () => true, get: (t, n) => (n === Symbol.unscopables ? undefined : n in t ? t[n] : globalThis[n]), set: (t, n, v) => { t[n] = v; return true; } });
  Object.assign(fixed, new Function("env", "with (env) {" + SRC.slice(toolStart, toolEnd) + SRC.slice(upStart, upEnd) + "; return { setEditTool, updateMontClipView }; }")(env));
  const snap = () => JSON.stringify({ project, undo: runtime.undo, redo: runtime.redo, sel: [...state.selIds] });
  for (const tool of ["ripple", "roll", "slip", "slide"]) {
    fixed.updateMontClipView({ mode: "advanced" }); fixed.setEditTool(tool);
    assert.equal(state.tool, tool, "advanced mode switches to " + tool);
    const before = snap();
    fixed.updateMontClipView({ mode: "simple" });
    assert.equal(state.tool, "select", "back to V");
    assert.equal(fixed.els.tracksContent.dataset.tool, "select");
    assert.equal(nodes[0]["aria-pressed"], "true");
    fixed.setEditTool(tool);
    assert.equal(state.tool, "select", "a direct call is refused in simple mode");
    assert.equal(snap(), before, "project, selection and history unchanged");
  }
});
