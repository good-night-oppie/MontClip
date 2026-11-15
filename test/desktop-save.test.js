"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8");
const code = source.slice(source.indexOf("let closeSaveTransaction ="), source.indexOf("async function flushSaveBeforeSwitch()"));

function harness(flush) {
  const listeners = new Map(), doc = { revision: 1, clips: [{ id: "a" }] };
  const ctx = { runtime: { projectId: "one", saveFailed: false, saveTimer: null },
    document: { body: { inert: false } }, projectJSON: () => doc,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) } };
  ctx.flushSave = () => flush(ctx, doc);
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, listeners, close: (id) => ctx.flushSaveForClose(id) };
}

test("desktop close freezes input and permits revision-only successful save", async () => {
  const h = harness(async (ctx, doc) => {
    assert.equal(ctx.document.body.inert, true);
    assert.equal(h.listeners.size, 8);
    doc.revision++;
    return true;
  });
  assert.equal(await h.close(), true);
  assert.equal(h.ctx.document.body.inert, true, "no editing gap before host destroys window");
});

test("timed-out save unfreezes, and its late receipt cannot unfreeze a newer attempt", async () => {
  const pending = [];
  const h = harness(() => new Promise((resolve) => pending.push(resolve)));
  const first = h.close(1); h.ctx.cancelCloseSave(1);
  assert.equal(h.ctx.document.body.inert, false);
  const second = h.close(2);
  pending[0](true); assert.equal(await first, false);
  assert.equal(h.ctx.document.body.inert, true);
  pending[1](true); assert.equal(await second, true);
  h.ctx.cancelCloseSave(2); assert.equal(h.ctx.document.body.inert, false);
  assert.equal(await h.close(1), false, "queued stale attempt cannot refreeze");
});

test("desktop close rejects late edit, conflict reload, failed and unknown saves", async () => {
  for (const mutate of [
    (ctx) => { ctx.runtime.saveTimer = 2; return true; },
    (_, doc) => { doc.clips = [{ id: "external" }]; return true; },
    (ctx) => { ctx.runtime.projectId = "another"; return true; },
    () => false,
    () => { throw new Error("write failed"); },
  ]) {
    const h = harness(mutate);
    try { assert.equal(await h.close(), false); } catch (error) { assert.equal(error.message, "write failed"); }
    assert.equal(h.ctx.document.body.inert, false);
    assert.equal(h.listeners.size, 0, "restore editing for retry");
  }
});
