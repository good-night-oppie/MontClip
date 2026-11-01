"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const code = source.slice(source.indexOf("async function flushSaveForClose()"), source.indexOf("async function flushSaveBeforeSwitch()"));

function harness(flush) {
  const listeners = new Map(), doc = { revision: 1, clips: [{ id: "a" }] };
  const ctx = { runtime: { projectId: "one", saveFailed: false, saveTimer: null },
    document: { body: { inert: false } }, projectJSON: () => doc,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) } };
  ctx.flushSave = () => flush(ctx, doc);
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, listeners, close: () => ctx.flushSaveForClose() };
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
