"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCloseController } = require("../desktop/close-controller");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const saves = [], prompts = [], cancelled = [], timers = new Map();
  let closed = 0, nextTimer = 0;
  const control = createCloseController({
    save: (id) => new Promise((resolve, reject) => saves.push({ id, resolve, reject })),
    cancel: (id) => cancelled.push(id),
    prompt: (reason) => new Promise((resolve) => prompts.push({ reason, resolve })),
    close: () => closed++,
    setTimer: (fn, ms) => { assert.equal(ms, 15000); timers.set(++nextTimer, fn); return nextTimer; },
    clearTimer: (id) => timers.delete(id),
  });
  return { control, saves, prompts, cancelled, timers, closed: () => closed };
}
test("close saves once; repeated requests and late results cannot close twice", async () => {
  const f = fixture(); f.control.request(); f.control.request(); await tick();
  assert.equal(f.saves.length, 1); f.saves[0].resolve(true); await tick();
  assert.equal(f.closed(), 1); assert.equal(f.timers.size, 0);
  f.control.request(); assert.equal(f.closed(), 1);
});
test("timeout defaults to keep waiting/open, cancels old freeze and ignores late success", async () => {
  const f = fixture(); f.control.request(); await tick();
  [...f.timers.values()][0](); f.control.fault("crashed"); f.control.request(); await tick();
  assert.equal(f.prompts.length, 1); assert.deepEqual(f.cancelled, [1]);
  f.prompts[0].resolve(0); await tick();
  f.saves[0].resolve(true); await tick(); assert.equal(f.closed(), 0);
  f.control.request(); await tick(); assert.equal(f.saves.length, 2);
  f.saves[1].resolve(true); await tick(); assert.equal(f.closed(), 1);
});
test("renderer fault only closes on explicit force; late dialog ignored after dispose", async () => {
  const f = fixture(); f.control.request(); await tick(); f.control.fault("unresponsive"); await tick();
  f.prompts[0].resolve(1); await tick(); assert.equal(f.closed(), 1);
  f.saves[0].reject(new Error("late")); await tick(); assert.equal(f.prompts.length, 1);
  const g = fixture(); g.control.request(); await tick(); g.saves[0].resolve(false); await tick();
  g.control.dispose(); g.prompts[0].resolve(1); await tick(); assert.equal(g.closed(), 0);
});
