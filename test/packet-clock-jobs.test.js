"use strict";
const test = require("node:test"), a = require("node:assert/strict");
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
const create = options => require("../packet-clock-jobs").createClockJobs(options);
test("start returns before scanning, duplicate calls share work and concurrency is bounded", async () => {
  const gates = [], calls = [];
  const jobs = create({ concurrency: 1, stat: async () => ({ size: 10, mtimeMs: 1 }), scan: async file => {
    calls.push(file); const gate = defer(); gates.push(gate); await gate.promise; return { coveredDuration: 9 };
  } });
  const first = await jobs.start("a");
  a.equal(first.state, "running"); a.equal((await jobs.start("a")).key, first.key);
  a.equal((await jobs.start("b")).state, "queued"); a.equal(calls.length, 1);
  a.equal((await jobs.get("a")).state, "running");
  gates[0].resolve(); await tick(); a.equal(calls.length, 2);
  gates[1].resolve(); await tick(); a.equal((await jobs.get("b")).result.coveredDuration, 9);
});
test("a changed file invalidates completed and in-flight results", async () => {
  let version = 1; const gate = defer();
  const jobs = create({ stat: async () => ({ size: 10, mtimeMs: version }), scan: async () => { await gate.promise; return { coveredDuration: 9 }; } });
  await jobs.start("a"); version++; gate.resolve(); await tick();
  const stale = await jobs.get("a"); a.equal(stale.state, "stale"); a.equal(stale.result, undefined);
  await jobs.start("a"); await tick(); a.equal((await jobs.get("a")).state, "done");
  version++; a.equal((await jobs.get("a")).state, "stale");
});
test("same-size replacements with preserved mtime invalidate on ctime or file identity", async () => {
  let ctimeMs = 1, ino = 10;
  const jobs = create({ stat: async () => ({ size: 10, mtimeMs: 1, ctimeMs, ino, dev: 1 }), scan: async () => ({ coveredDuration: 9 }) });
  await jobs.start("a"); await tick(); a.equal((await jobs.get("a")).state, "done");
  ctimeMs++; a.equal((await jobs.get("a")).state, "stale");
  await jobs.start("a"); await tick(); ino++; a.equal((await jobs.get("a")).state, "stale");
});
test("concurrent same-file starts share one scan after stat resolves", async () => {
  let count = 0; const gate = defer();
  const jobs = create({ stat: async () => { await gate.promise; return { size: 10, mtimeMs: 1 }; }, scan: async () => { count++; return { coveredDuration: 9 }; } });
  const starts = [jobs.start("a"), jobs.start("a"), jobs.start("a")]; gate.resolve();
  await Promise.all(starts); await tick(); a.equal(count, 1);
});
test("cancel releases queued work; scan errors never publish a partial answer", async () => {
  const gate = defer(); let calls = 0;
  const jobs = create({ concurrency: 1, stat: async () => ({ size: 10, mtimeMs: 1 }), scan: async () => { calls++; await gate.promise; throw new Error("partial scan"); } });
  await jobs.start("a"); await jobs.start("b"); a.equal(jobs.cancel("b").state, "cancelled");
  gate.resolve(); await tick(); a.equal(calls, 1);
  const failed = await jobs.get("a"); a.equal(failed.state, "failed"); a.equal(failed.result, undefined);
  a.equal(failed.code, "CLOCK_SCAN_FAILED");
});
test("queue capacity is bounded and shutdown aborts owned active work", async () => {
  let signal;
  const jobs = create({ maxJobs: 1, stat: async () => ({ size: 10, mtimeMs: 1 }), scan: async (_file, options) => {
    signal = options.signal; await new Promise(r => signal.addEventListener("abort", r, { once: true }));
  } });
  await jobs.start("a"); await a.rejects(jobs.start("b"), { code: "CLOCK_QUEUE_FULL" });
  jobs.shutdown(); a.equal(signal.aborted, true); await tick();
  a.equal((await jobs.get("a")).state, "cancelled");
  await a.rejects(jobs.start("b"), { code: "CLOCK_SHUTDOWN" });
});
