'use strict';
// VV's offscreen review of #111: the plugin's engine first, then the desktop app on the same data folder. The app
// said "the internal service stopped — close and reopen, or try another folder", which was neither the reason nor a
// way out. DATA_DIR_IN_USE now always gets its own words (VV's draft, JJ to review), never the generic start failure.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, makeDataDir, startServer } = require('./helpers');
const WriterLock = require('../server/writer-lock');
const { dataDirInUse, exitedAtStart, startFailureBox } = require('../desktop/startup-failure');
const N = require('../desktop/native-text');
const main = fs.readFileSync(path.join(ROOT, 'desktop', 'main.js'), 'utf8');

// JJ's final words (2026-11-04), word for word: who has the folder comes from the writer lock's shell
const JJ = {
  'zh-CN': { title: 'MontClip 没打开', cindy: 'Cindy 里的 MontClip 正在用这些项目。两边同时改，会互相盖掉。',
    desktop: '另一个 MontClip 窗口正在用这些项目。两边同时改，会互相盖掉。',
    hint: '先把那边的 MontClip 关掉，再打开这里。找不到那边的窗口，就重启电脑再试。', ok: '好' },
  en: { title: "MontClip didn't open", cindy: 'The MontClip inside Cindy is using these projects. If both edit at once, one overwrites the other.',
    desktop: 'Another MontClip window is using these projects. If both edit at once, one overwrites the other.',
    hint: "Close the other MontClip first, then open this one. If you can't find it, restart the computer and try again.", ok: 'OK' },
};

for (const lang of ['zh-CN', 'en']) for (const shell of ['cindy', 'desktop']) {
  test(`the box for a data folder in use — the other one is ${shell}, the interface in ${lang}: JJ's words`, () => {
    const t = N.nativeText(lang), w = JJ[lang];
    a.deepEqual(startFailureBox({ textKey: 'dataDirInUse', holder: { shell, pid: 1, port: 2 } }, t),
      { title: w.title, message: w[shell], detail: w.hint, buttons: [w.ok] });
  });
}

test('the box for a data folder in use: a holder that is not known, or another shell, is "another MontClip window"; other failures keep the generic box', () => {
  for (const holder of [null, { shell: 'server' }, { shell: null }])
    a.equal(startFailureBox({ textKey: 'dataDirInUse', holder }, N.nativeText('zh-CN')).message, JJ['zh-CN'].desktop);
  const box = startFailureBox({ textKey: 'dataDirInUse', holder: { shell: 'cindy' } }, N.nativeText('zh-CN'));
  a.ok(!box.detail.includes(N.nativeText('zh-CN').startFailedHint) && box.title !== N.nativeText('zh-CN').startFailedTitle, 'never the generic words');
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
  const second = spawnSync(process.execPath, [path.join(ROOT, 'server/server.js')], { cwd: ROOT, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: '1' } });
  a.notEqual(second.status, 0);
  const e = exitedAtStart(second.stderr);
  a.equal(e.textKey, 'dataDirInUse');
  a.equal(e.holder.shell, 'cindy', 'the server tells the app who has the folder');
  a.match(second.stderr, /^MONTCLIP_DATA_DIR_IN_USE \{"shell":"cindy","port":\d+\}$/m);
  a.equal(startFailureBox(e, N.nativeText('en')).message, JJ.en.cindy);
  a.equal(exitedAtStart('Error: listen EACCES').textKey, 'serviceExitedAtStart');
  a.equal(exitedAtStart('').textKey, 'serviceExitedAtStart');
});

test('the other one is the desktop app: told apart the same way, before the start and from the server\'s stderr', async (t) => {
  const dir = makeDataDir(t);
  await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_SHELL: 'desktop' });
  a.equal(startFailureBox(dataDirInUse(dir, WriterLock.holder), N.nativeText('zh-CN')).message, JJ['zh-CN'].desktop);
  const second = spawnSync(process.execPath, [path.join(ROOT, 'server/server.js')], { cwd: ROOT, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FABLECUT_DATA_DIR: dir, FABLECUT_NO_FS_WATCH: '1', MONTCLIP_SHELL: 'cindy' } });
  const e = exitedAtStart(second.stderr);
  a.equal(e.holder.shell, 'desktop');
  a.equal(startFailureBox(e, N.nativeText('en')).message, JJ.en.desktop);
  // an older server without the line: the shell is read from its message
  a.equal(exitedAtStart('Error: Another MontClip (cindy, pid 9 on port 8) is already editing X').holder.shell, 'cindy');
});

test('main.js: checks the lock before starting the server, reads its stderr when it stops, and shows the box for the key', () => {
  const start = main.slice(main.indexOf('async function start()'));
  const check = start.indexOf('dataDirInUse(env.FABLECUT_DATA_DIR, require("../server/writer-lock").holder)');
  a.ok(check > 0 && check < start.indexOf('utilityProcess.fork('), 'before the fork');
  a.ok(start.includes('if (inUse) throw inUse;'));
  a.ok(start.includes('setTimeout(() => reject(exitedAtStart(startErr)), 100)'));
  a.ok(start.includes('startErr = (startErr + data).slice(-8192)'));
  a.match(main, /await dialog\.showMessageBox\(\{ type: "error", \.\.\.startFailureBox\(error, t\), noLink: true \}\);/);
});
