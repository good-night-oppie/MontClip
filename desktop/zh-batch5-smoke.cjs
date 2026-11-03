'use strict';
// 中文第五批: the ripple-delete button's tooltip as the page shows it — Chinese in the Chinese interface, English in the
// English one, and without its (⇧Del) in simple mode (#55). Fresh profile, hidden offscreen window, no provider call.
//   electron desktop/zh-batch5-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → ZH5_PASS / ZH5_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron, assert = require('node:assert/strict');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg = process.argv.find((a) => a.startsWith('--user-data-dir='));
if (!profileArg || !profileArg.slice('--user-data-dir='.length).trim()) throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const WANT = {
  'zh-CN advanced': '波纹删除所选（⇧Del）：删掉以后，目标轨道上后面的片段往前移，补上空隙',
  'zh-CN simple': '波纹删除所选：删掉以后，目标轨道上后面的片段往前移，补上空隙',
  'en advanced': 'Ripple delete selection (⇧Del) — closes gap on targeted tracks',
  'en simple': 'Ripple delete selection — closes gap on targeted tracks',
};
const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  let ok = false; const seen = {};
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    for (const language of ['zh-CN', 'en']) for (const mode of ['advanced', 'simple']) {
      await read(`updateMontClipView(${JSON.stringify({ language, mode })}); true`); await wait();
      seen[language + ' ' + mode] = await read(`document.getElementById('btnRippleDelete').getAttribute('title')`);
    }
    // back to advanced: the hint returns
    await read(`updateMontClipView({language:'zh-CN',mode:'advanced'}); true`); await wait();
    seen['zh-CN advanced again'] = await read(`document.getElementById('btnRippleDelete').getAttribute('title')`);
    for (const [k, v] of Object.entries(WANT)) assert.equal(seen[k], v, k);
    assert.equal(seen['zh-CN advanced again'], WANT['zh-CN advanced']);
    ok = true;
  } catch (e) { seen.error = String(e && e.message || e).slice(0, 600); }
  finally { out(ok ? 'ZH5_PASS' : 'ZH5_FAIL', seen); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
