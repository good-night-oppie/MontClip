'use strict';
// VV's offscreen review of #111: the plugin's engine first, then the desktop app on the same data folder. The app
// said "the internal service stopped — close and reopen, or try another folder", which was neither the reason nor a
// way out. DATA_DIR_IN_USE now always gets its own words (VV's draft, JJ to review), never the generic start failure.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, makeDataDir, startServer } = require('./helpers');
const WriterLock = require('../writer-lock');
const { dataDirInUse, exitedAtStart, startFailureBox } = require('../desktop/startup-failure');
const N = require('../desktop/native-text');
const main = fs.readFileSync(path.join(ROOT, 'desktop', 'main.js'), 'utf8');

test('the box for a data folder in use: its own title, reason, next step and button, in either language', () => {
  const zh = startFailureBox({ textKey: 'dataDirInUse' }, N.nativeText('zh-CN'));
  a.deepEqual(zh, { title: 'MontClip 没打开',
    message: '另一个 MontClip 正在用这些项目（可能是 Cindy 里的 MontClip）。两个同时改，会互相盖掉。',
    detail: '先把那边的 MontClip 关掉，再打开这里。', buttons: ['好'] });
  const en = startFailureBox({ textKey: 'dataDirInUse' }, N.nativeText('en'));
  a.deepEqual([en.title, en.buttons], ["MontClip didn't open", ['OK']]);
  for (const box of [zh, en]) {
    a.ok(!box.message.includes(N.nativeText('zh-CN').startFailedHint) && !box.message.includes(N.nativeText('en').startFailedHint), 'not the generic hint');
    a.notEqual(box.title, N.nativeText('zh-CN').startFailedTitle);
  }
  // every other start failure keeps the generic box
  const other = startFailureBox({ textKey: 'serviceStartTimeout' }, N.nativeText('zh-CN'));
  a.deepEqual(other, { title: 'MontClip 启动失败', message: '启动 MontClip 的内部服务超时。\n请关闭后重新打开。还不行，就换一个能保存文件的文件夹再试。', buttons: ['确定'] });
});

test("the plugin's engine first: the desktop app sees the live lock before it starts its own", async (t) => {
  const dir = makeDataDir(t);
  const engine = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_SHELL: 'cindy' });
  const e = dataDirInUse(dir, WriterLock.holder);
  a.equal(e.textKey, 'dataDirInUse');
  a.deepEqual([e.holder.shell, e.holder.port], ['cindy', engine.port]);
  a.equal(startFailureBox(e, N.nativeText('zh-CN')).title, 'MontClip 没打开');
  a.equal(dataDirInUse(makeDataDir(t), WriterLock.holder), null, 'a folder nobody has: no error');
});

test('both at the same moment: the server refuses with DATA_DIR_IN_USE, and its stderr is told apart', async (t) => {
  const dir = makeDataDir(t);
  await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_SHELL: 'cindy' });
  const second = spawnSync(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: '1' } });
  a.notEqual(second.status, 0);
  a.equal(exitedAtStart(second.stderr).textKey, 'dataDirInUse');
  a.equal(exitedAtStart('Error: listen EACCES').textKey, 'serviceExitedAtStart');
  a.equal(exitedAtStart('').textKey, 'serviceExitedAtStart');
});

test('main.js: checks the lock before starting the server, reads its stderr when it stops, and shows the box for the key', () => {
  const start = main.slice(main.indexOf('async function start()'));
  const check = start.indexOf('dataDirInUse(env.FABLECUT_DATA_DIR, require("../writer-lock").holder)');
  a.ok(check > 0 && check < start.indexOf('utilityProcess.fork('), 'before the fork');
  a.ok(start.includes('if (inUse) throw inUse;'));
  a.ok(start.includes('setTimeout(() => reject(exitedAtStart(startErr)), 100)'));
  a.ok(start.includes('startErr = (startErr + data).slice(-8192)'));
  a.match(main, /await dialog\.showMessageBox\(\{ type: "error", \.\.\.startFailureBox\(error, t\), noLink: true \}\);/);
});
