'use strict';
// 中文第四批: the assistant's format collapsible as the page renders it — title, body (with the quote button's own text in
// place of {reference}) and the technical line — in zh-CN and en. Fresh profile, hidden offscreen window, no provider call.
//   electron desktop/zh-batch4-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → ZH4_PASS / ZH4_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron;
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

const readPane = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  setSideTab('assistant'); mcAgent.render(); await wait(300);
  const T = MontClipView.text[mcView.get().language];
  const more = [...document.querySelectorAll('.cindy-port button')].find((b) => b.textContent === T.officialPane_more);
  if (!document.querySelector('[data-format-help]') && more) { more.click(); await wait(300); }
  const d = document.querySelector('[data-format-help]');
  if (!d) return { error: 'no format collapsible' };
  d.open = true; await wait(100);
  const ref = [...document.querySelectorAll('[data-reference-actions] button')].map((b) => b.textContent)[0] || null;
  return { language: mcView.get().language, summary: d.querySelector('summary').textContent, body: d.querySelector('[data-format-body]').textContent,
    tech: d.querySelector('[data-format-tech]').textContent, referenceButton: ref,
    expected: { summary: T.officialPane_formatTitle, body: T.officialPane_format.split('{reference}').join(T.officialPane_reference), tech: T.officialPane_formatTech } };
})()`;

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s);
  let ok = false;
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    const res = [];
    for (const language of ['zh-CN', 'en']) {
      await read(`updateMontClipView({ language: ${JSON.stringify(language)} }); true`);
      res.push(await read(readPane));
    }
    const checks = res.map((r) => ({ language: r.language, error: r.error,
      summary: r.summary === r.expected?.summary, body: r.body === r.expected?.body, tech: r.tech === r.expected?.tech,
      bodyNamesButton: !!r.referenceButton && r.body?.includes(r.referenceButton), noPlaceholder: !/\{reference\}/.test(r.body || '') }));
    ok = checks.every((c) => !c.error && c.summary && c.body && c.tech && c.bodyNamesButton && c.noPlaceholder);
    out(ok ? 'ZH4_PASS' : 'ZH4_FAIL', { checks, rendered: res.map(({ expected, ...r }) => r) });
  } catch (e) { out('ZH4_FAIL', { error: String(e && e.message || e) }); }
  finally { process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
