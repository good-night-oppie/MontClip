"use strict";
/* MontClip#320 (a safety net; #348 is the fix): a headless export's browser that grows past the memory limit ends its own
   job — EXPORT_MEMORY_LIMIT, said to the streamer, not retried — and nothing else. Two layers: how the browser's memory is
   read (a fake /proc, so it runs everywhere), and what the queue does about it (a stand-in browser script, so not on
   Windows, where a script file is not a program; the same limit as in export-jobs.js on the tests of #247). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const J = require("../server/export-jobs");
const V = require("../ui-preferences");

/* a /proc: {pid: {anon kB (null = no status file), children: [pids]}} */
function fakeProc(tree) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p320proc-"));
  for (const [pid, t] of Object.entries(tree)) {
    const d = path.join(root, pid);
    fs.mkdirSync(path.join(d, "task", pid), { recursive: true });
    if (t.anon != null) fs.writeFileSync(path.join(d, "status"), `Name:\tchrome\nVmRSS:\t${t.anon * 2} kB\nRssAnon:\t${t.anon} kB\nRssFile:\t${t.anon} kB\n`);
    fs.writeFileSync(path.join(d, "task", pid, "children"), (t.children || []).join(" ") + (t.children && t.children.length ? " " : ""));
  }
  return root;
}

test("the limit: 2 GiB by default, MONTCLIP_EXPORT_MEMORY_MAX_MIB changes it, 0 turns it off, junk means the default", () => {
  assert.equal(J.MEMORY_LIMIT_MIB, 2048);
  assert.equal(J.memoryLimitBytes({}), 2048 * 1048576);
  assert.equal(J.memoryLimitBytes({ MONTCLIP_EXPORT_MEMORY_MAX_MIB: "1536" }), 1536 * 1048576);
  assert.equal(J.memoryLimitBytes({ MONTCLIP_EXPORT_MEMORY_MAX_MIB: "0" }), 0);
  for (const bad of ["", "abc", "-5", "NaN"]) assert.equal(J.memoryLimitBytes({ MONTCLIP_EXPORT_MEMORY_MAX_MIB: bad }), 2048 * 1048576, JSON.stringify(bad));
});

test("the browser's memory is its own and everything under it (anonymous memory, not file pages)", () => {
  const proc = fakeProc({ 100: { anon: 1000, children: [101, 102] }, 101: { anon: 2000, children: [103] }, 102: { anon: 300 }, 103: { anon: 40 }, 999: { anon: 9_000_000 } });
  assert.equal(J.treeAnonBytes(100, { platform: "linux", proc }), (1000 + 2000 + 300 + 40) * 1024, "999 is not under 100");
  assert.equal(J.treeAnonBytes(102, { platform: "linux", proc }), 300 * 1024);
});

test("what cannot be read never stops anything", () => {
  const proc = fakeProc({ 100: { anon: 1000, children: [101, 555] }, 101: { anon: null } });
  assert.equal(J.treeAnonBytes(100, { platform: "linux", proc }), 1000 * 1024, "a child that is gone or has no status counts for nothing");
  assert.equal(J.treeAnonBytes(777, { platform: "linux", proc }), null, "no such process");
  assert.equal(J.treeAnonBytes(100, { platform: "win32", proc }), null, "not Linux: nothing measured");
  assert.equal(J.treeAnonBytes(NaN, { platform: "linux", proc }), null);
  assert.equal(J.treeAnonBytes(0, { platform: "linux", proc }), null);
});

test("the sentence: words in both languages, for the code the job ends with", () => {
  const z = V.errorText("zh-CN", { code: "EXPORT_MEMORY_LIMIT", message: "raw" }), e = V.errorText("en", { code: "EXPORT_MEMORY_LIMIT", message: "raw" });
  assert.equal(z.known, true);
  assert.equal(e.known, true);
  assert.match(z.text, /内存/);
  assert.match(e.text, /memory/);
  assert.ok(!/raw/.test(z.text + e.text), "never the raw message");
  assert.ok(/没有生成文件/.test(z.what) && /no file was made/.test(e.what), "the first sentence says what happened and that no file was made");
});

/* the queue, with a browser that is a script: it notes each start in a file and then waits */
const WAS_CHROME = process.env.FABLECUT_CHROME;
test.after(() => { if (WAS_CHROME === undefined) delete process.env.FABLECUT_CHROME; else process.env.FABLECUT_CHROME = WAS_CHROME; });
const stand = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p320q-"));
  const log = path.join(dir, "starts.log"), exe = path.join(dir, "browser.sh");
  fs.writeFileSync(exe, `#!/bin/sh\necho x >> "${log}"\nexec sleep 30\n`, { mode: 0o755 });
  process.env.FABLECUT_CHROME = exe;
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  return { starts: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0) };
};
function queue(t, extra) {
  let now = 5_000_000;
  const logged = [], asked = [];
  const jobs = J.createExportJobs({ allowHeadless: true, editors: () => 0, url: () => "http://127.0.0.1:1", broadcast() {}, now: () => now, log: (l) => logged.push(l),
    treeMemory: (pid) => { asked.push(pid); return extra.used(); }, ...extra.opts });
  t.after(() => jobs.shutdown());
  return { jobs, logged, asked, tick: (ms) => { now += ms; } };
}
const GiB = 1073741824, MiB = 1048576;
const sleepUntilStarted = (s, n) => new Promise((res, rej) => { const t0 = Date.now(); const poll = () => (s.starts() >= n ? res() : Date.now() - t0 > 5000 ? rej(new Error("the stand-in browser did not start")) : setTimeout(poll, 20)); poll(); });

test("a browser over the limit ends its own job with EXPORT_MEMORY_LIMIT, is stopped, and nothing is retried", { skip: process.platform === "win32" }, async (t) => {
  const s = stand(t);
  const q = queue(t, { used: () => 3 * GiB, opts: { memoryLimit: 2 * GiB } });
  const first = q.jobs.request({ where: "headless" });
  await sleepUntilStarted(s, 1);
  q.tick(J.MEMORY_POLL_MS + 1);
  const next = q.jobs.request({ where: "headless" });   // request() sweeps first: the over-limit job must be gone, the queue free
  const old = q.jobs.get(first.id);
  assert.equal(old.status, "failed");
  assert.equal(old.code, "EXPORT_MEMORY_LIMIT");
  assert.match(old.error, /more memory than allowed.*3072 MiB.*limit 2048 MiB.*no file was made.*not retried/);
  assert.equal(q.logged.length, 1);
  assert.match(q.logged[0], /used 3072 MiB, over the 2048 MiB limit/);
  assert.ok(!/[\\/]/.test(q.logged[0]), "no paths in the log line");
  assert.equal(next.status, "pending", "the next export is accepted: the queue is free");
  await sleepUntilStarted(s, 2);
  assert.equal(s.starts(), 2, "one start for the first job, one for the next; the stopped one was not started again");
});

test("a browser under the limit keeps its job; the next request is refused as before", { skip: process.platform === "win32" }, async (t) => {
  const s = stand(t);
  const q = queue(t, { used: () => 512 * MiB, opts: { memoryLimit: 2 * GiB } });
  const first = q.jobs.request({ where: "headless" });
  await sleepUntilStarted(s, 1);
  q.tick(J.MEMORY_POLL_MS + 1);
  assert.throws(() => q.jobs.request({ where: "headless" }), (e) => e.code === 409 && e.errorCode === "JOB_BUSY");
  assert.equal(q.jobs.get(first.id).status, "pending");
  assert.equal(q.asked.length, 1, "it was measured");
});

test("the memory is read at most every MEMORY_POLL_MS", { skip: process.platform === "win32" }, async (t) => {
  const s = stand(t);
  const q = queue(t, { used: () => 100 * MiB, opts: { memoryLimit: 2 * GiB } });
  q.jobs.request({ where: "headless" });
  await sleepUntilStarted(s, 1);
  const busy = () => { try { q.jobs.request({ where: "headless" }); } catch {} };
  busy(); busy(); busy();
  assert.equal(q.asked.length, 1, "three sweeps in the same instant, one reading");
  q.tick(J.MEMORY_POLL_MS - 1); busy();
  assert.equal(q.asked.length, 1);
  q.tick(2); busy();
  assert.equal(q.asked.length, 2);
});

test("limit 0 turns it off, and an unknown size stops nothing", { skip: process.platform === "win32" }, async (t) => {
  for (const [label, opts, used] of [["off", { memoryLimit: 0 }, () => 99 * GiB], ["unknown", { memoryLimit: 2 * GiB }, () => null]]) {
    const s = stand(t);
    const q = queue(t, { used, opts });
    const first = q.jobs.request({ where: "headless" });
    await sleepUntilStarted(s, 1);
    q.tick(J.MEMORY_POLL_MS + 1);
    assert.throws(() => q.jobs.request({ where: "headless" }), (e) => e.code === 409, label);
    assert.equal(q.jobs.get(first.id).status, "pending", label);
    q.jobs.cancel && q.jobs.cancel(first.id);
  }
});
