'use strict';
// The owner (2026-11-02): "why is the Chinese UI's text in two languages?" The native dialogs the main
// process shows (the close prompt, the stopped-service box) were one "中文 / English" line each. They now
// follow the interface language the main process reads from view-settings.json at the moment they show.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const N = require('../desktop/native-text');
const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
const KEYS = ['closeTitle', 'closeMessage', 'closeDetail', 'closeKeepWaiting', 'closeForce', 'serviceStopped',
  'startFailedTitle', 'startFailedHint', 'serviceStartTimeout', 'serviceExitedAtStart', 'serviceStoppedTitle', 'ok'];

test('each native string in one language at a time', () => {
  const zh = N.nativeText('zh-CN'), en = N.nativeText('en');
  for (const k of KEYS) {
    a.ok(zh[k] && en[k], k);
    a.equal(zh[k].replace(/MontClip/g, '').match(/[A-Za-z]{2,}/), null, 'zh ' + k + ': ' + zh[k]);
    a.ok(!/[一-鿿]/.test(en[k]), 'en ' + k + ': ' + en[k]);
  }
  a.deepEqual(N.nativeText('fr'), zh, 'anything else is the default, Chinese');
  a.deepEqual(N.nativeText(undefined), zh);
});

test('the language is read from the view settings each time a dialog shows', () => {
  a.equal(N.languageOf({ ok: true, value: { mode: 'simple', language: 'en' } }), 'en');
  a.equal(N.languageOf({ ok: true, value: { mode: 'advanced', language: 'zh-CN' } }), 'zh-CN');
  a.equal(N.languageOf({ ok: false, code: 'VIEW_SETTINGS_READ_FAILED', value: { mode: 'simple', language: 'zh-CN' } }), 'zh-CN');
  a.equal(N.languageOf(null), 'zh-CN');
  const prompt = main.slice(main.indexOf('prompt: async (reason) =>'), main.indexOf('close: () =>', main.indexOf('prompt: async (reason) =>')));
  a.match(prompt, /const t = nativeText\(languageOf\(settings\.get\(\)\)\);/, 'read at the moment the dialog shows');
  a.match(prompt, /title: t\.closeTitle, message: t\.closeMessage, detail: t\.closeDetail,\s*buttons: \[t\.closeKeepWaiting, t\.closeForce\]/);
  // the stopped service and the start-up failure: see 'no showErrorBox' below
  // the start-up failure's own errors carry a key, said in the interface language
  a.match(main, /textKey: "serviceStartTimeout"/); a.match(main, /textKey: "serviceExitedAtStart"/);
});

// VV (2026-11-02, real window): dialog.showErrorBox titles the window "Error" and labels its button "OK",
// whatever the interface language. Both error boxes are message boxes now, titled and labelled from native-text.js.
test('no showErrorBox: the stopped-service and start-up boxes take their title and button from the interface language', () => {
  a.doesNotMatch(main, /showErrorBox/);
  // the stopped service: the language is read when it happens
  const stop = main.slice(main.indexOf('worker.on("exit"'), main.indexOf('await win.loadURL(origin)'));
  a.ok(stop.includes('const t = nativeText(languageOf(settings.get()));'), stop);
  a.ok(stop.includes('dialog.showMessageBox({ type: "error", title: t.serviceStoppedTitle, message: t.serviceStopped, buttons: [t.ok], noLink: true })'), stop);
  // ...and the handler is registered inside start(), which only runs once the app is ready
  const start = main.indexOf('async function start()'), reg = main.indexOf('worker.on("exit"');
  a.ok(start >= 0 && reg > start && reg < main.indexOf('app.on("window-all-closed"'), 'the handler is registered in start()');
  a.deepEqual([...main.matchAll(/\bstart\b(?!\()/g)].map(m => main.slice(m.index - 21, m.index + 5)), ['app.whenReady().then(start'],
    'start() is only called once the app is ready');
  // the start-up failure: the box is awaited before the app quits (showErrorBox blocked; showMessageBox does not)
  const fail = main.slice(main.indexOf('app.whenReady().then(start)'));
  a.ok(fail.includes('.catch(async (error) =>'), fail);
  a.ok(fail.includes('await dialog.showMessageBox({ type: "error", title: t.startFailedTitle,\n      message: `${(error && error.textKey && t[error.textKey]) || String((error && error.message) || error)}\\n${t.startFailedHint}`,\n      buttons: [t.ok], noLink: true });'), fail);
  a.ok(fail.indexOf('await dialog.showMessageBox') < fail.indexOf('app.quit()'), 'shown before quitting');
});

test('the new strings (JJ to review): the stopped-service title and the button', () => {
  const zh = N.nativeText('zh-CN'), en = N.nativeText('en');
  a.equal(zh.ok, '确定'); a.equal(en.ok, 'OK');
  a.equal(zh.serviceStoppedTitle, 'MontClip 出错了'); a.equal(en.serviceStoppedTitle, 'MontClip ran into a problem');
});

test('desktop/main.js holds no "中文 / English" string', () => {
  const lit = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of main.matchAll(lit)) {
    const t = m[0].replace(/\$\{[^}]*\}/g, '');
    // the dialog text lives in native-text.js, one language per entry
    a.ok(!/[一-鿿]/.test(t), 'Chinese written into main.js: ' + t.slice(0, 80));
  }
});

test("JJ's wording (2026-11-02): the start-up hint, and \"MontClip's internal service\"", () => {
  const zh = N.nativeText('zh-CN'), en = N.nativeText('en');
  a.equal(zh.startFailedHint, '请关闭后重新打开。还不行，就换一个能保存文件的文件夹再试。');
  a.equal(en.startFailedHint, 'Close and reopen MontClip. If it still fails, try a folder where files can be saved.');
  for (const k of KEYS) {
    a.ok(!/本地编辑服务/.test(zh[k]), 'zh ' + k + ' says MontClip 的内部服务');
    a.ok(!/local editor service/i.test(en[k]), 'en ' + k + " says MontClip's internal service");
  }
  for (const k of ['serviceStopped', 'serviceStartTimeout', 'serviceExitedAtStart']) {
    a.match(zh[k], /MontClip 的内部服务/, k);
    a.match(en[k], /MontClip's internal service/, k);
  }
});
