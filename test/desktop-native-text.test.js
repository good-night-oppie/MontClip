'use strict';
// The owner (2026-11-02): "why is the Chinese UI's text in two languages?" The native dialogs the main
// process shows (the close prompt, the stopped-service box) were one "中文 / English" line each. They now
// follow the interface language the main process reads from view-settings.json at the moment they show.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const N = require('../desktop/native-text');
const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
const KEYS = ['closeTitle', 'closeMessage', 'closeDetail', 'closeKeepWaiting', 'closeForce', 'serviceStopped',
  'startFailedTitle', 'startFailedHint', 'serviceStartTimeout', 'serviceExitedAtStart'];

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
  a.match(main, /dialog\.showErrorBox\("MontClip", nativeText\(languageOf\(settings\.get\(\)\)\)\.serviceStopped\)/);
  // the start-up failure too: its own errors carry a key, said in the interface language
  a.match(main, /dialog\.showErrorBox\(t\.startFailedTitle, /);
  a.match(main, /textKey: "serviceStartTimeout"/); a.match(main, /textKey: "serviceExitedAtStart"/);
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
