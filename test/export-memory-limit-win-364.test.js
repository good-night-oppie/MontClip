"use strict";
/* MontClip#364: #320's export memory limit on Windows too (#353 measured it on Linux only). Over the limit → the job ends
   with EXPORT_MEMORY_LIMIT, the same message and log line as on Linux, its browser is stopped and nothing is retried; under
   it nothing changes; only the tree the engine started is measured. Two layers: the queue with a stand-in watcher (runs
   everywhere), and the real watcher on a real process tree (Windows only: it asks Windows itself). */
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const GiB = 1073741824, MiB = 1048576;
const jobsPath = require.resolve("../server/export-jobs");
const WIN = process.platform === "win32";

/* export-jobs.js with spawn replaced while it loads: the "browser" is an EventEmitter, or `real(pid)` wraps a real
   process standing in for it. Everything else (the watcher's PowerShell) goes to the real spawn. */
function freshJobs(t, makeBrowser) {
  const realSpawn = cp.spawn, browsers = [];
  const was = process.env.FABLECUT_CHROME;
  process.env.FABLECUT_CHROME = process.execPath;
  cp.spawn = (exe, args, o) => {
    if (exe !== process.execPath || !Array.isArray(args) || !args.includes("--headless=new")) return realSpawn(exe, args, o);
    const p = makeBrowser();
    browsers.push(p);
    return p;
  };
  delete require.cache[jobsPath];
  const J = require("../server/export-jobs");
  cp.spawn = realSpawn;
  t.after(() => { delete require.cache[jobsPath]; if (was === undefined) delete process.env.FABLECUT_CHROME; else process.env.FABLECUT_CHROME = was; });
  return { J, browsers };
}
function fakeBrowser() {
  const p = new EventEmitter();
  p.pid = 4242; p.exitCode = null; p.signalCode = null; p.kills = 0;
  p.kill = () => { p.kills++; };
  return p;
}
function queue(t, J, opts) {
  let now = 7_000_000;
  const logged = [];
  const jobs = J.createExportJobs({ allowHeadless: true, editors: () => 0, url: () => "http://127.0.0.1:1", broadcast() {}, now: () => now,
    log: (l) => logged.push(l), ...opts });
  t.after(() => jobs.shutdown());
  return { jobs, logged, tick: (ms) => { now += ms; } };
}
const sweepVia = (jobs) => { try { return jobs.request({ where: "headless" }); } catch (e) { return e; } };   // request() sweeps first

test("Windows: a browser over the limit ends its own job with EXPORT_MEMORY_LIMIT, the same words as on Linux; it is stopped and not retried", (t) => {
  const { J, browsers } = freshJobs(t, fakeBrowser);
  const watches = [];
  const q = queue(t, J, { platform: "win32", memoryLimit: 2 * GiB,
    watchMemory: (pid) => { const w = { pid, stops: 0, read: () => 3 * GiB, stop() { w.stops++; } }; watches.push(w); return w; } });
  const first = q.jobs.request({ where: "headless" });
  assert.equal(watches.length, 1, "a watcher was started for the browser");
  assert.equal(watches[0].pid, 4242, "on the browser the engine started, nothing else");
  q.tick(J.MEMORY_POLL_MS + 1);
  const next = sweepVia(q.jobs);
  const old = q.jobs.get(first.id);
  assert.equal(old.status, "failed");
  assert.equal(old.code, "EXPORT_MEMORY_LIMIT");
  assert.equal(old.error, "the export used more memory than allowed (3072 MiB, limit 2048 MiB), so it was stopped and no file was made; it is not retried. " +
    "Try exporting a shorter part first", "word for word the Linux message");
  assert.deepEqual(q.logged, ["export: the headless browser used 3072 MiB, over the 2048 MiB limit; the export was stopped"], "one log line, no paths");
  assert.equal(browsers[0].kills, 1, "its browser was stopped");
  assert.equal(watches[0].stops, 1, "and its watcher with it");
  assert.equal(next.status, "pending", "the next export is accepted: the queue is free");
  assert.equal(browsers.length, 2, "one start for the stopped job, one for the next: the stopped one was not started again");
  q.tick(J.MEMORY_POLL_MS + 1); sweepVia(q.jobs);
  assert.equal(q.jobs.get(first.id).status, "failed", "still ended");
});

test("Windows: a browser under the limit keeps its job, and an unknown size stops nothing", (t) => {
  for (const [label, size] of [["under", 512 * MiB], ["unknown", null]]) {
    const { J, browsers } = freshJobs(t, fakeBrowser);
    let reads = 0;
    const q = queue(t, J, { platform: "win32", memoryLimit: 2 * GiB, watchMemory: () => ({ read: () => { reads++; return size; }, stop() {} }) });
    const first = q.jobs.request({ where: "headless" });
    q.tick(J.MEMORY_POLL_MS + 1);
    const e = sweepVia(q.jobs);
    assert.equal(e.errorCode, "JOB_BUSY", label + ": the next request is refused as before");
    assert.equal(q.jobs.get(first.id).status, "pending", label);
    assert.equal(reads, 1, label + ": it was measured");
    assert.equal(browsers[0].kills, 0, label + ": its browser was left alone");
    assert.equal(q.logged.length, 0, label);
  }
});

test("no watcher when the limit is off, off Windows, or for an open tab", (t) => {
  for (const [label, opts, where, editors] of [["limit 0", { platform: "win32", memoryLimit: 0 }, "headless", 0], ["Linux", { platform: "linux", memoryLimit: 2 * GiB, treeMemory: () => null }, "headless", 0],
    ["macOS", { platform: "darwin", memoryLimit: 2 * GiB, treeMemory: () => null }, "headless", 0], ["a tab", { platform: "win32", memoryLimit: 2 * GiB }, "tab", 1]]) {
    const { J } = freshJobs(t, fakeBrowser);
    let started = 0;
    const q = queue(t, J, { ...opts, editors: () => editors, watchMemory: () => { started++; return { read: () => 99 * GiB, stop() {} }; } });
    const j = q.jobs.request({ where });
    q.tick(J.MEMORY_POLL_MS + 1); sweepVia(q.jobs);
    assert.equal(started, 0, label);
    assert.notEqual(q.jobs.get(j.id).code, "EXPORT_MEMORY_LIMIT", label);
  }
});

test("a job that ends any other way stops its watcher too; a browser that exits stops it", (t) => {
  const { J, browsers } = freshJobs(t, fakeBrowser);
  const watches = [];
  const q = queue(t, J, { platform: "win32", memoryLimit: 2 * GiB, watchMemory: () => { const w = { stops: 0, read: () => 1 * MiB, stop() { w.stops++; } }; watches.push(w); return w; } });
  const a = q.jobs.request({ where: "headless" });
  q.jobs.cancel(a.id);
  assert.equal(watches[0].stops, 1, "cancelled");
  q.jobs.request({ where: "headless" });
  browsers[1].exitCode = 1; browsers[1].emit("exit", 1);
  assert.equal(watches[1].stops, 1, "browser exited");
});

/* the real watcher, on a real tree: a node process holding ~200 MiB with a child holding ~100 MiB, and an unrelated node
   process holding ~300 MiB that must never be counted or touched */
const hold = (mib, child) => [ "-e", `const b=Buffer.alloc(${mib}*1048576,1);` +
  (child ? `require('child_process').spawn(process.execPath,['-e','const c=Buffer.alloc(${child}*1048576,2);const pp=process.ppid;setInterval(()=>{try{process.kill(pp,0)}catch(e){process.exit()}},300)'],{stdio:'ignore'});` : "") +
  "setTimeout(()=>{},120000)" ];
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
const until = (fn, ms, what) => new Promise((res, rej) => { const t0 = Date.now(); const poll = () => { const v = fn(); if (v) res(v); else if (Date.now() - t0 > ms) rej(new Error("timed out: " + what)); else setTimeout(poll, 100); }; poll(); });

test("the Windows watcher measures the browser and everything under it, and nothing else", { skip: !WIN && "it asks Windows (CIM)", timeout: 60_000 }, async (t) => {
  const W = require("../server/win-tree-memory");
  const root = cp.spawn(process.execPath, hold(200, 100), { stdio: "ignore" });
  const other = cp.spawn(process.execPath, hold(300), { stdio: "ignore" });
  t.after(() => { for (const p of [root, other]) try { p.kill(); } catch {} });
  const w = W.watchTreeMemory(root.pid, { every: 500 });
  t.after(() => w.stop());
  await until(() => w.read() != null && w.procs() === 2, 30_000, "a reading of two processes");
  const used = w.read();
  assert.ok(used > 300 * MiB && used < 450 * MiB, `${Math.round(used / MiB)} MiB: ~200 + ~100 MiB and two node runtimes, not the other 300 MiB`);
  const ps = w.pid;
  assert.ok(ps && alive(ps));
  w.stop();
  await until(() => !alive(ps), 10_000, "the watcher's PowerShell ends when stopped");
  assert.equal(w.read() == null || w.read() === used, true);
  assert.ok(alive(other.pid) && alive(root.pid), "the watcher touched nothing");
});

test("the Windows watcher ends by itself when the browser is gone, and reads nothing for a process that is not there", { skip: !WIN && "it asks Windows (CIM)", timeout: 60_000 }, async (t) => {
  const W = require("../server/win-tree-memory");
  const root = cp.spawn(process.execPath, hold(10), { stdio: "ignore" });
  t.after(() => { try { root.kill(); } catch {} });
  const w = W.watchTreeMemory(root.pid, { every: 500 });
  t.after(() => w.stop());
  await until(() => w.read() != null, 30_000, "a reading");
  const ps = w.pid;
  root.kill();
  await until(() => !alive(ps) && w.health() !== "starting" && w.health() !== "ok", 15_000, "the watcher ends after the browser (and node has its exit)");
  const gone = W.watchTreeMemory(root.pid, { every: 500 });
  t.after(() => gone.stop());
  const gp = gone.pid;
  await until(() => gone.health() !== "starting", 15_000, "a watcher for a missing process ends at once");
  assert.equal(gone.read(), null);
  assert.equal(w.health(), "gone", "a browser that is gone is said as gone, not as a watcher that died");
  assert.equal(gone.health(), "gone");
  assert.equal(W.watchTreeMemory(root.pid, { platform: "linux" }).read(), null, "off Windows nothing is started");
});

test("end to end on Windows: the queue with the real watcher stops an over-limit stand-in browser and only it", { skip: !WIN && "it asks Windows (CIM)", timeout: 90_000 }, async (t) => {
  const reals = [];
  const other = cp.spawn(process.execPath, hold(300), { stdio: "ignore" });
  t.after(() => { for (const p of [other, ...reals]) try { p.kill(); } catch {} });
  const { J, browsers } = freshJobs(t, () => { const p = cp.spawn(process.execPath, hold(200, 100), { stdio: "ignore" }); reals.push(p); return p; });
  const W = require("../server/win-tree-memory");
  const watches = [];
  const q = queue(t, J, { platform: "win32", memoryLimit: 128 * MiB, watchMemory: (pid) => { const w = W.watchTreeMemory(pid, { every: 500 }); watches.push(w); return w; } });
  const first = q.jobs.request({ where: "headless" });
  assert.equal(watches.length, 1, "the real watcher was started");
  await until(() => watches[0].read() != null, 30_000, "a reading");
  const ps = watches[0].pid;
  q.tick(J.MEMORY_POLL_MS + 1);
  const next = sweepVia(q.jobs);
  assert.equal(q.jobs.get(first.id).code, "EXPORT_MEMORY_LIMIT");
  assert.equal(next.status, "pending", "the queue is free for the next one");
  await until(() => !alive(browsers[0].pid), 10_000, "the over-limit browser is stopped");
  await until(() => !ps || !alive(ps), 10_000, "its watcher is stopped");
  assert.ok(alive(other.pid), "the unrelated process is untouched");
  assert.ok(alive(process.pid));
});

/* QQ on #365: when the memory cannot be measured on Windows the limit must not go quietly. The export goes on (an unknown
   size never stops one), but a watcher that could not start or ended is started again once, and after that — or when no
   reading comes in time — the job carries memUnknown and the log gets exactly one line. */
const UNKNOWN_LINE = /^export: the memory limit could not be measured \((the memory watcher could not be started|the memory watcher stopped|no memory reading came in time)\); the export goes on without it$/;
function unknownQueue(t, factory) {
  const { J, browsers } = freshJobs(t, fakeBrowser);
  let calls = 0;
  const q = queue(t, J, { platform: "win32", memoryLimit: 2 * GiB, watchMemory: (pid) => factory(calls++, pid) });
  const first = q.jobs.request({ where: "headless" });
  const poll = () => { q.tick(J.MEMORY_POLL_MS + 1); return sweepVia(q.jobs); };
  return { q, first, poll, browsers, calls: () => calls };
}
const handle = (health, read = () => null) => { const h = { stops: 0, health, read, stop() { h.stops++; } }; return h; };

test("Windows: a watcher that cannot start is tried once more, then the job says memUnknown and the log one line; the export goes on", (t) => {
  const u = unknownQueue(t, () => { throw new Error("blocked by policy"); });
  assert.equal(u.calls(), 1);
  u.poll();
  assert.equal(u.calls(), 2, "started again once");
  assert.equal(u.q.logged.length, 0, "nothing said yet: the second try may work");
  for (let i = 0; i < 4; i++) {
    const e = u.poll();
    assert.equal(e.errorCode, "JOB_BUSY", "the job is still running: the next request is refused as before");
  }
  const j = u.q.jobs.get(u.first.id);
  assert.equal(j.status, "pending", "the export goes on");
  assert.equal(j.memUnknown, "unavailable");
  assert.equal(u.calls(), 2, "not started a third time");
  assert.equal(u.q.logged.length, 1, "one line per job, not one per look");
  assert.match(u.q.logged[0], UNKNOWN_LINE);
  assert.ok(!/[\\/]/.test(u.q.logged[0]), "no paths in the log line");
  assert.equal(u.browsers[0].kills, 0, "its browser is left alone");
});

test("Windows: a watcher that ends while the browser runs is started again once; when the new one reads, nothing is said", (t) => {
  const made = [];
  const u = unknownQueue(t, (n) => { const h = n === 0 ? handle(() => "exited") : handle(() => "ok", () => 100 * MiB); made.push(h); return h; });
  u.poll(); u.poll(); u.poll();
  assert.equal(u.calls(), 2);
  assert.equal(made[0].stops, 1, "the dead one is let go");
  assert.equal(u.q.jobs.get(u.first.id).memUnknown, null);
  assert.equal(u.q.logged.length, 0);
});

test("Windows: a watcher that ends twice, or stays quiet, leaves memUnknown and one line; a reading that comes back still enforces the limit", (t) => {
  for (const [label, factory, want, calls] of [
    ["ended twice", () => handle(() => "exited"), "exited", 2],
    ["the browser looked gone twice", () => handle(() => "gone"), "gone", 2],
    ["no reading in time (CIM failing)", () => handle(() => "stale"), "stale", 1],
  ]) {
    const u = unknownQueue(t, factory);
    u.poll(); u.poll(); u.poll();
    const j = u.q.jobs.get(u.first.id);
    assert.equal(j.status, "pending", label + ": the export goes on");
    assert.equal(j.memUnknown, want, label);
    assert.equal(u.calls(), calls, label + ": a quiet watcher is not restarted, a dead one once");
    assert.equal(u.q.logged.length, 1, label);
    assert.match(u.q.logged[0], UNKNOWN_LINE, label);
  }
  let size = null;
  const u = unknownQueue(t, () => handle(() => (size == null ? "stale" : "ok"), () => size));
  u.poll();
  assert.equal(u.q.jobs.get(u.first.id).memUnknown, "stale");
  size = 3 * GiB;   // WMI answers again
  const next = u.poll();
  assert.equal(u.q.jobs.get(u.first.id).code, "EXPORT_MEMORY_LIMIT", "the limit holds again as soon as there is a reading");
  assert.equal(next.status, "pending");
  assert.equal(u.q.logged.length, 2, "the unknown line, then the over-limit line");
});

/* the watcher itself, with a stand-in PowerShell: what each line and each way of ending means */
function fakePs() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stdout.setEncoding = () => {};
  c.stdin = { written: "", on() {}, end(s) { c.stdin.written += s; } };
  c.exitCode = null; c.signalCode = null; c.kill = () => { c.killed = true; };
  c.say = (line) => c.stdout.emit("data", line + "\r\n");
  c.die = () => { c.exitCode = 0; c.emit("exit", 0); };
  return c;
}
test("the watcher: failed queries keep it going, quiet past STALE_MS is stale, ended is told apart from gone, no PowerShell is unavailable", () => {
  const W = require("../server/win-tree-memory");
  let clock = 1_000_000, ps = null, how = null;
  const spawn = (exe, args, o) => { how = { exe, args, o }; ps = fakePs(); return ps; };
  const w = W.watchTreeMemory(4242, { platform: "win32", spawn, now: () => clock });
  assert.deepEqual(how.args, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], "fixed switches only: no -ExecutionPolicy Bypass, no script on the command line");
  assert.match(how.exe, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
  assert.equal(how.o.env.MONTCLIP_WATCH_ROOT, "4242");
  assert.ok(ps.stdin.written.startsWith(W.SCRIPT) && ps.stdin.written.endsWith("\n\n"), "the script goes in on stdin");
  assert.match(W.SCRIPT, /catch \{ \[Console\]::Out\.WriteLine\('err'\)[^}]*continue \}/, "a failed query writes err and the loop goes on");
  assert.match(W.SCRIPT, /\$_\.CreationDate -eq \$born/, "the browser is known by its id and the time it was born");
  assert.equal(w.health(), "starting");
  ps.say("err"); ps.say("err");
  assert.equal(w.errors(), 2);
  assert.equal(w.read(), null);
  clock += W.STALE_MS + 1;
  assert.equal(w.health(), "stale", "no reading for STALE_MS");
  ps.say("mem 1048576000 12");
  assert.equal(w.health(), "ok");
  assert.equal(w.read(), 1048576000);
  assert.equal(w.procs(), 12);
  ps.die();
  assert.equal(w.health(), "exited", "ended without saying the browser is gone");

  const g = W.watchTreeMemory(4242, { platform: "win32", spawn, now: () => clock });
  ps.say("gone"); ps.die();
  assert.equal(g.health(), "gone");

  const s = W.watchTreeMemory(4242, { platform: "win32", spawn, now: () => clock });
  s.stop(); ps.die();
  assert.equal(s.health(), "starting", "a watcher stopped on purpose is not a dead one");

  assert.equal(W.watchTreeMemory(4242, { platform: "win32", spawn: () => { throw new Error("EACCES"); } }).health(), "unavailable");
  const e = W.watchTreeMemory(4242, { platform: "win32", spawn });
  ps.emit("error", new Error("ENOENT"));
  assert.equal(e.health(), "unavailable");
  assert.equal(W.watchTreeMemory(4242, { platform: "linux" }).health(), "unavailable");
});

test("the Windows watcher on a real machine: a WQL query that fails is an err line and the watcher keeps going", { skip: !WIN && "it asks Windows (CIM)", timeout: 60_000 }, async (t) => {
  // the real script, with the first query made to fail every time (an invalid class): it must say err and stay up, not exit
  const W = require("../server/win-tree-memory");
  const broken = W.SCRIPT.replace("Get-CimInstance Win32_Process -Filter \"ProcessId=$root\"", "Get-CimInstance Win32_NoSuchClass -Filter \"ProcessId=$root\"");
  assert.notEqual(broken, W.SCRIPT);
  const root = cp.spawn(process.execPath, hold(10), { stdio: "ignore" });
  t.after(() => { try { root.kill(); } catch {} });
  const ps = cp.spawn(W.powershellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
    env: { ...process.env, MONTCLIP_WATCH_ROOT: String(root.pid), MONTCLIP_WATCH_ENGINE: String(process.pid), MONTCLIP_WATCH_EVERY_MS: "300" } });
  t.after(() => { try { ps.kill(); } catch {} });
  let out = "";
  ps.stdout.on("data", (d) => { out += d; });
  ps.stdin.end(broken + "\n\n");
  await until(() => (out.match(/^err\r?$/gm) || []).length >= 3, 30_000, "three err lines");
  assert.ok(alive(ps.pid), "still running after failed queries");
  assert.ok(!/gone|mem /.test(out), "never mistook a failed query for a gone browser");
});
