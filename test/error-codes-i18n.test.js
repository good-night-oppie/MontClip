'use strict';
// The export-job and offline-import refusals were "中文 / English" lines. The server now answers in English
// (agents and logs read it) with a reason code; the page says the code in the interface language.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), J = require('../server/export-jobs');
const ROOT = path.join(__dirname, '..'), app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), server = fs.readFileSync(path.join(ROOT, 'server/server.js'), 'utf8');
const CODES = { NETWORK_DISABLED: 'err-offline', HEADLESS_DISABLED: 'err-headless-disabled', EDITOR_NOT_READY: 'err-editor-not-ready', EDITOR_DID_NOT_ACCEPT: 'err-editor-no-accept' };

test('each code has a key in both languages, one language each', () => {
  for (const k of Object.values(CODES).concat('map-no-media')) {
    const zh = V.text['zh-CN']['own.' + k], en = V.text.en['own.' + k];
    a.ok(zh && en, k);
    a.equal(zh.replace(/MontClip/g, '').match(/[A-Za-z]{2,}/), null, 'zh ' + k + ': ' + zh);
    a.ok(!/[一-鿿]/.test(en), 'en ' + k);
  }
});

test('the server and the job queue answer in English with a code', () => {
  const jobs = J.createExportJobs({ allowHeadless: false, editors: () => 0, url: () => '', broadcast() {} });
  for (const [where, code] of [['headless', 'HEADLESS_DISABLED'], ['auto', 'EDITOR_NOT_READY']]) {
    let e; try { jobs.request({ where }); } catch (x) { e = x; }
    a.ok(e, where); a.equal(e.errorCode, code); a.ok(!/[一-鿿]/.test(e.message), e.message);
  }
  jobs.dispose && jobs.dispose();
  const src = fs.readFileSync(path.join(ROOT, 'server/export-jobs.js'), 'utf8');
  a.match(src, /errorCode: "EDITOR_DID_NOT_ACCEPT"/, 'the tab that never took the job has a code too');
  a.match(server, /code: "NETWORK_DISABLED", error: "Offline mode: import a local file\."/);
});

test('the page says the code in the interface language', () => {
  // one function for every failure (Deja, 2026-11-04; test/error-text.test.js): MontClipView.errorText
  for (const [code, key] of Object.entries(CODES)) a.equal(V.errorText('zh-CN', { code }).text, V.text['zh-CN']['own.' + key], code);
  for (const [code, key] of Object.entries(CODES)) a.equal(V.errorText('en', { errorCode: code }).text, V.text.en['own.' + key], code);
  a.match(app, /function sayError\(error/);
  const at = app.indexOf('async function importFromUrl') >= 0 ? app.indexOf('async function importFromUrl') : app.indexOf('fetch("/api/import-url"');
  a.match(app.slice(at, at + 2600), /toastProblem\(sayError\(e, "import-url"\)\)/, 'a refused URL import is said by code');
  a.match(app, /toast\(uiText\("own\.map-no-media"\)\)/);
});
