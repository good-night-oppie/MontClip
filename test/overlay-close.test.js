/* VV on main 116c6d3 (2026-11-04): the Keyboard shortcuts layer (〔?〕) did not close on a click on the dark area around
   it, while Settings did; and with Settings open, 〔?〕 put the shortcuts over it, but Esc (focus anywhere but the filter
   box) closed Settings underneath first. A click outside the box now closes the shortcuts too, and Esc closes only the
   layer on top: the shortcuts first, then Settings. The real functions from app.js run on a stand-in page. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const take = (start, end) => { const i = app.indexOf(start), j = app.indexOf(end, i); assert.ok(i >= 0 && j > i, start); return app.slice(i, j); };

function page() {
  const el = (id, hidden) => {
    const cls = new Set(hidden ? ["hidden"] : []), on = {};
    return { id, focused: 0, value: "",
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c), toggle: (c, f) => (f ? cls.add(c) : cls.delete(c)) },
      addEventListener: (type, fn) => { (on[type] ||= []).push(fn); }, removeEventListener: () => {},
      fire: (type, e) => (on[type] || []).forEach((fn) => fn(e)), focus() { this.focused++; ctx.focus = id; } };
  };
  const ids = ["helpOverlay", "settingsOverlay", "settingsDialog", "btnHelp", "btnCloseHelp", "btnSettings", "helpFilter", "helpKeys", "helpEmpty"];
  const els = Object.fromEntries(ids.map((id) => [id, el(id, /Overlay$/.test(id))]));
  const ctx = { $: (id) => els[id], els, focus: null };
  vm.runInNewContext("function onSettingsTabTrap() {}\n" + take('$("btnHelp").addEventListener("click"', "function settingsFocusables()") +
    take("function closeSettings()", "\n}\n") + "\n}\n" + take("function closeTopOverlay()", "\n}\n") + "\n}\n", ctx);
  return ctx;
}
const open = (ctx, id) => !ctx.els[id].classList.contains("hidden");

test("a click on the dark area around the shortcuts closes them, as Settings does; a click inside the box does not", () => {
  const ctx = page(), o = ctx.els.helpOverlay;
  ctx.els.btnHelp.fire("click");
  assert.ok(open(ctx, "helpOverlay"));
  o.fire("click", { target: {} });            // inside the box
  assert.ok(open(ctx, "helpOverlay"), "a click inside the box keeps it open");
  o.fire("click", { target: o });             // the backdrop itself
  assert.ok(!open(ctx, "helpOverlay"), "a click on the backdrop closes it");
  assert.match(app, /\$\("settingsOverlay"\)\.addEventListener\("click", \(e\) => \{\s*if \(e\.target === \$\("settingsOverlay"\)\) closeSettings\(\);/,
    "Settings still closes the same way");
});

test("Settings, then 〔?〕: Esc closes the shortcuts only, the next Esc closes Settings", () => {
  const ctx = page();
  ctx.els.settingsOverlay.classList.remove("hidden");
  ctx.els.btnHelp.fire("click");
  assert.ok(open(ctx, "settingsOverlay") && open(ctx, "helpOverlay"));
  assert.equal(vm.runInContext("closeTopOverlay()", ctx), true);
  assert.ok(open(ctx, "settingsOverlay"), "Settings stays open under the shortcuts");
  assert.ok(!open(ctx, "helpOverlay"), "the shortcuts (on top) close");
  assert.equal(ctx.focus, "settingsDialog", "the focus goes back to Settings");
  assert.equal(vm.runInContext("closeTopOverlay()", ctx), true);
  assert.ok(!open(ctx, "settingsOverlay"), "the second Esc closes Settings");
  assert.equal(vm.runInContext("closeTopOverlay()", ctx), false, "nothing left: Esc goes on to its usual job");
});

test("Esc in the filter box: clears the filter first, then closes only the shortcuts; 〔关闭〕 closes only them too", () => {
  const ctx = page(), f = ctx.els.helpFilter, esc = { key: "Escape", preventDefault() {}, stopPropagation() {} };
  ctx.els.settingsOverlay.classList.remove("hidden");
  ctx.els.btnHelp.fire("click");
  f.value = "trim";
  ctx.els.helpKeys.querySelectorAll = () => [];
  f.fire("keydown", esc);
  assert.equal(f.value, "", "the first Esc clears the filter");
  assert.ok(open(ctx, "helpOverlay"));
  f.fire("keydown", esc);
  assert.ok(!open(ctx, "helpOverlay") && open(ctx, "settingsOverlay"), "the next Esc closes the shortcuts, not Settings");
  ctx.els.btnHelp.fire("click");
  ctx.els.btnCloseHelp.fire("click");
  assert.ok(!open(ctx, "helpOverlay") && open(ctx, "settingsOverlay"));
});

test("the editor's Esc goes through closeTopOverlay, so the order lives in one place", () => {
  const esc = take('else if (k === "Escape") {', "else if ((e.ctrlKey || e.metaKey) && (k === \"a\"");
  assert.match(esc, /closeTopOverlay\(\)/);
  assert.doesNotMatch(esc, /closeSettings\(\)|helpOverlay/, "no second copy of the order here");
});
