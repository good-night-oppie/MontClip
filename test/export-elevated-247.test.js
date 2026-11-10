'use strict';
/* MontClip#247 (JJ's Dev Spec, issuecomment-6720532815): opened with "Run as administrator", the headless browser an
   export needs starts itself again without the elevation and the process the engine started exits at once (code 0,
   nothing said). The job used to end as a crashed page and she retried with no way to know why. Now, and only when
   the engine is elevated AND that browser exited cleanly at once before its page took the job, the job ends with its
   own code and JJ's sentence. Every other exit keeps #231's sentence. Nothing is done to make the browser work
   elevated. The five cases of the spec, with an injected "is elevated" and stand-in browsers (node itself). */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createExportJobs, elevatedCode, FAST_EXIT_MS } = require('../export-jobs');
const V = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* A stand-in browser: a tiny program started the way the engine starts Chrome (same flags, the page's address last).
   FABLECUT_CHROME must be one program, so each stand-in is a .cmd / shell file that runs node with a script. */
function standIn(t, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc247-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const js = path.join(dir, 'browser.js');
  fs.writeFileSync(js, script);
  const exe = path.join(dir, process.platform === 'win32' ? 'browser.cmd' : 'browser.sh');
  fs.writeFileSync(exe, process.platform === 'win32' ? `@"${process.execPath}" "${js}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`, { mode: 0o755 });
  const saved = process.env.FABLECUT_CHROME;
  process.env.FABLECUT_CHROME = exe;
  t.after(() => { if (saved == null) delete process.env.FABLECUT_CHROME; else process.env.FABLECUT_CHROME = saved; });
  return exe;
}
const QUICK_CLEAN = 'process.exit(0);';                                   // what an elevated Chrome's first process does
const LATE_CRASH = 'console.error("renderer crashed"); setTimeout(() => process.exit(5), 400);';
const queue = (o = {}) => { const log = []; return { log, jobs: createExportJobs({ url: (id) => 'http://127.0.0.1:1/?exportJob=' + id, broadcast() {}, editors: () => 0, log: (l) => log.push(l), ...o }) }; };
async function ended(jobs, id) { let v; for (let i = 0; i < 150; i++) { await new Promise((r) => setTimeout(r, 100)); v = jobs.get(id); if (v.status !== 'pending' && v.status !== 'running') break; } return v; }

// needs a .cmd started without a shell on Windows: Node refuses that since 20.12 unless shell is set; the engine starts
// a real .exe, so the stand-ins run where a script file can be spawned directly
const spawnable = (() => { try { require('node:child_process').spawnSync(process.platform === 'win32' ? 'cmd.exe' : 'true', process.platform === 'win32' ? ['/c', 'exit 0'] : []); return true; } catch { return false; } })();

test('① elevated, and the browser exits cleanly at once: the job ends at once with its own code and JJ\'s sentence; the queue takes the next job', { skip: process.platform === 'win32' ? 'the stand-in browser is a script file, which Windows only starts through a shell; covered by the unit below and by the Win11 run in the PR' : !spawnable }, async (t) => {
  standIn(t, QUICK_CLEAN);
  const { jobs, log } = queue({ isElevated: () => true, host: 'cindy' });
  const t0 = Date.now(), j = jobs.request({ kind: 'export', where: 'headless' });
  const v = await ended(jobs, j.id);
  a.equal(v.status, 'failed'); a.equal(v.code, 'EXPORT_ELEVATED_CINDY');
  a.ok(Date.now() - t0 < 5000, 'at once, not after a long wait');
  a.equal(v.src, null, 'no file');
  a.match(V.errorText('zh-CN', { code: v.code }).text, /^Cindy 是用「以管理员身份运行」打开的/);
  const next = jobs.request({ kind: 'scopes', where: 'headless', time: 0 });
  a.ok(next.id && next.id !== j.id, 'the queue took the next job');
  a.equal(log.length >= 1, true); a.match(log[0], /^export: running elevated \(administrator\); the headless browser exited within \d+ ms$/);
});
test('② not elevated, the same quick clean exit: #231\'s sentence, never the administrator one', { skip: process.platform === 'win32' ? 'see ①' : !spawnable }, async (t) => {
  standIn(t, QUICK_CLEAN);
  const { jobs, log } = queue({ isElevated: () => false, host: 'cindy' });
  const v = await ended(jobs, jobs.request({ kind: 'export', where: 'headless' }).id);
  a.equal(v.code, 'EXPORT_PAGE_CRASHED'); a.equal(log.length, 0);
});
test('④ elevated, but the browser crashes for another reason (it says something, exits later, not 0): #231\'s sentence', { skip: process.platform === 'win32' ? 'see ①' : !spawnable }, async (t) => {
  standIn(t, LATE_CRASH);
  const { jobs, log } = queue({ isElevated: () => true, host: 'cindy' });
  const v = await ended(jobs, jobs.request({ kind: 'export', where: 'headless' }).id);
  a.equal(v.code, 'EXPORT_PAGE_CRASHED'); a.equal(log.length, 0);
});

/* The same five cases against the exit handler itself, on every platform (no stand-in file to start): the browser is
   node, which exits at once — with code 9 for Chrome's flags (a crash), or with code 0 when FABLECUT_CHROME's flags are
   swallowed by NODE_OPTIONS-free `node -e`. Here the process is replaced by a fake with the fields the handler reads. */
function fakeRun({ elevated, code, afterMs, claimed = false, host = 'cindy' }) {
  const src = read('export-jobs.js');
  const handler = src.slice(src.indexOf('proc.on("exit", (code) => {'), src.indexOf('  return {\n    assertWhere,'));
  a.ok(handler.length > 200, 'the exit handler was found');
  // run the handler's body as it is written, with stand-ins for what it closes over
  const body = handler.slice(handler.indexOf('{') + 1, handler.lastIndexOf('});'));
  const j = { browser: {}, status: claimed ? 'running' : 'pending' }, said = [], log = [];
  const end = (job, status, f) => { said.push({ status, ...f }); job.status = status; };
  const isEnded = (job) => job.status === 'failed' || job.status === 'done' || job.status === 'cancelled';
  const RealDate = Date, started = 1000;
  const FakeDate = { now: () => started + afterMs };
  new Function('code', 'j', 'end', 'isEnded', 'opts', 'isElevated', 'elevatedCode', 'FAST_EXIT_MS', 'started', 'Date', 'console', body)(
    code, j, end, isEnded, { isElevated: () => elevated, host, log: (l) => log.push(l) }, () => { throw new Error('the injected one is used'); }, elevatedCode, FAST_EXIT_MS, started, FakeDate, console);
  void RealDate;
  return { said, log };
}
test('the exit handler, all five cases of the spec', () => {
  // ① elevated + clean exit at once, before the page took the job
  let r = fakeRun({ elevated: true, code: 0, afterMs: 200 });
  a.equal(r.said.length, 1); a.equal(r.said[0].errorCode, 'EXPORT_ELEVATED_CINDY'); a.equal(r.said[0].status, 'failed');
  a.deepEqual(r.log, ['export: running elevated (administrator); the headless browser exited within 200 ms']);
  // ② not elevated, the same exit
  r = fakeRun({ elevated: false, code: 0, afterMs: 200 });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED'); a.deepEqual(r.log, []);
  // ③ elevated, the browser worked: its page took the job (running) and the browser left later — whatever ends the
  //    job then, it is never the administrator sentence
  r = fakeRun({ elevated: true, code: 0, afterMs: 60000, claimed: true });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED');
  r = fakeRun({ elevated: true, code: 0, afterMs: 200, claimed: true });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED', 'a page that took the job proves the browser came up');
  // ④ elevated, another crash: a code other than 0, or later than "at once"
  r = fakeRun({ elevated: true, code: 5, afterMs: 200 });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED');
  r = fakeRun({ elevated: true, code: 0, afterMs: FAST_EXIT_MS });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED', 'not at once');
  r = fakeRun({ elevated: true, code: null, afterMs: 200 });
  a.equal(r.said[0].errorCode, 'EXPORT_PAGE_CRASHED', 'killed by a signal');
  // ⑤ the log line: the two facts and nothing else — no user name, no path
  r = fakeRun({ elevated: true, code: 0, afterMs: 147 });
  a.doesNotMatch(r.log[0], /[\\/]|Users|[A-Za-z]:[\\/]|@/);
  // who is named: the program she opened
  a.equal(fakeRun({ elevated: true, code: 0, afterMs: 1, host: 'montclip' }).said[0].errorCode, 'EXPORT_ELEVATED_MONTCLIP');
  a.equal(fakeRun({ elevated: true, code: 0, afterMs: 1, host: '' }).said[0].errorCode, 'EXPORT_ELEVATED_PROGRAM');
});

/* The real thing, where it can happen: Windows, this very process elevated (a shell started as administrator), a real
   Chrome / Edge. Nothing is injected. Skipped everywhere else. */
const realBrowser = (() => { const saved = process.env.FABLECUT_CHROME; delete process.env.FABLECUT_CHROME; try { return require('../export-jobs').findBrowser(); } finally { if (saved != null) process.env.FABLECUT_CHROME = saved; } })();
const realSkip = process.platform !== 'win32' ? 'Windows only' : !require('../export-jobs').isElevated() ? 'this process is not elevated' : !realBrowser ? 'no Chrome / Edge' : false;
test('Windows, really elevated, a real browser: the export job ends at once with the administrator code, and the queue takes the next job', { skip: realSkip, timeout: 60000 }, async (t) => {
  const saved = process.env.FABLECUT_CHROME; delete process.env.FABLECUT_CHROME;
  t.after(() => { if (saved != null) process.env.FABLECUT_CHROME = saved; });
  /* The browser that restarted itself without the elevation is still running after the job has ended: the engine does
     not put it away yet (that is MontClip#241, the export side of #243). So this test gives the job a profile folder
     of its own (keepProfile) and puts that browser away itself, by the folder (browser-procs.js). */
  const { makeProfile, dropProfile, browsersOf } = require('./browser-procs');
  const profile = makeProfile(os.tmpdir(), 'montclip-e2e-');
  let dropped = null;
  t.after(async () => { if (!dropped) await dropProfile(profile).catch(() => {}); });
  const { jobs, log } = queue({ host: '', keepProfile: () => profile });
  const t0 = Date.now(), j = jobs.request({ kind: 'export', where: 'headless' });
  const v = await ended(jobs, j.id), took = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 1500));
  const leftRunning = (await browsersOf(profile)).length;
  dropped = await dropProfile(profile);
  t.diagnostic('browser processes of this job still running after it ended: ' + leftRunning + ' (MontClip#241); put away by the test: left ' + dropped.left.length + ', folder removed ' + dropped.removed);
  a.equal(dropped.left.length, 0, 'the test leaves no browser behind');
  t.diagnostic('ended as ' + v.code + ' after ' + took + ' ms; log: ' + (log[0] || '(none)'));
  a.equal(v.status, 'failed'); a.equal(v.code, 'EXPORT_ELEVATED_PROGRAM');
  a.ok(took < FAST_EXIT_MS + 2000, 'at once: ' + took + ' ms');
  a.equal(v.src, null, 'no file');
  a.match(log[0], /^export: running elevated \(administrator\); the headless browser exited within \d+ ms$/);
  const next = jobs.request({ kind: 'scopes', where: 'headless', time: 0 });
  a.ok(next.id && next.id !== j.id, 'the queue took the next job');
  jobs.cancel(next.id);
});

// JJ 定稿 (#247 issuecomment-6720532815), word for word, punctuation included
test('JJ\'s sentences, word for word; the plugin\'s names Cindy; where the program is not known, 「这个程序」', () => {
  const zh = (c) => V.errorText('zh-CN', { code: c }), en = (c) => V.errorText('en', { code: c });
  a.equal(zh('EXPORT_ELEVATED_MONTCLIP').text, 'MontClip 是用「以管理员身份运行」打开的，导出需要的浏览器在这种方式下没法正常工作，这次导出已停下，没有生成文件。请先关掉 MontClip，不要选「以管理员身份运行」，直接双击打开，再导出一次。');
  a.equal(en('EXPORT_ELEVATED_MONTCLIP').text, 'MontClip was opened with "Run as administrator", and the browser it needs for exporting can\'t work properly that way, so this export stopped and no file was made. Close MontClip, open it normally (not "Run as administrator"), and export again.');
  a.equal(zh('EXPORT_ELEVATED_CINDY').text, zh('EXPORT_ELEVATED_MONTCLIP').text.replaceAll('MontClip', 'Cindy'));
  a.equal(en('EXPORT_ELEVATED_CINDY').text, en('EXPORT_ELEVATED_MONTCLIP').text.replaceAll('MontClip', 'Cindy'));
  a.equal(zh('EXPORT_ELEVATED_PROGRAM').text, zh('EXPORT_ELEVATED_MONTCLIP').text.replaceAll('MontClip ', '这个程序').replaceAll(' MontClip', '这个程序'));
  for (const c of ['EXPORT_ELEVATED_MONTCLIP', 'EXPORT_ELEVATED_CINDY', 'EXPORT_ELEVATED_PROGRAM']) for (const r of [zh(c), en(c)]) {
    a.equal(r.known, true);
    a.doesNotMatch(r.text, /高完整性|沙箱|退出码|integrity|sandbox|exit code|headless/i, 'none of the words JJ ruled out');
    a.ok(r.text.startsWith(r.what) && r.what.length < r.text.length, 'what happened is the first sentence; what to do is not in it');
  }
  // the plain crash keeps #231's sentence
  a.match(zh('EXPORT_PAGE_CRASHED').text, /^导出时出了意外/);
});

test('nothing is done to make the browser work elevated; the server says who started the engine', () => {
  const src = read('export-jobs.js');
  a.doesNotMatch(src, /--no-sandbox|--do-not-de-elevate|--disable-gpu-sandbox|runas/i);
  a.match(src, /path\.join\(env\.SystemRoot \|\| env\.windir \|\| "C:\\\\Windows", "System32", "whoami\.exe"\), \["\/groups", "\/fo", "csv", "\/nh"\]/, 'whoami by its full path, fixed arguments, no shell');
  a.match(read('server.js'), /host: EMBED \? "cindy" : DESKTOP \? "montclip" : "",/);
  a.equal(require('../export-jobs').isElevated({}, 'linux'), false, 'only asked on Windows');
});
