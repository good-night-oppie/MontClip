'use strict';
// The owner (2026-11-02): "why is the Chinese UI's text in two languages?" The native dialogs the main
// process shows (the close prompt, the stopped-service box) were one "中文 / English" line each. They now
// follow the interface language the main process reads from view-settings.json at the moment they show.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const N = require('../desktop/native-text');
const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
const KEYS = ['closeTitle', 'closeMessage', 'closeDetail', 'closeKeepWaiting', 'closeForce', 'serviceStopped'];

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
});

test('desktop/main.js holds no "中文 / English" string', () => {
  const lit = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  for (const m of main.matchAll(lit)) {
    const t = m[0];
    if (!/[一-鿿]/.test(t)) continue;
    a.ok(!/[A-Za-z]{3,}/.test(t.replace(/MontClip/g, '')), 'a string in both languages: ' + t.slice(0, 80));
  }
});
