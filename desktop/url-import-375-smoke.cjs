'use strict';
// #375 (1): the desktop app imports local files only — "import from a URL" is refused both ways, by the same judgment
// (server/url-import-policy.js). The real app in a fresh profile and a hidden window; then:
//  - the page's own "+ URL" (POST /api/import-url): 403 NETWORK_DISABLED;
//  - an agent's MCP process (server/mcp-server.js, its own process) pointed at this app's data folder: fablecut_import_media
//    with an https URL answers NETWORK_DISABLED;
//  - the URL is a stand-in on 127.0.0.1 that counts every TCP connection: 0 — nothing was even tried.
// Nothing leaves this computer.
//   electron desktop/url-import-375-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → URL_IMPORT_PASS / URL_IMPORT_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron, assert = require('node:assert/strict');
const net = require('node:net'), path = require('node:path'), { spawn } = require('node:child_process');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

/** One MCP tools/call over stdio, in a process of its own (as an agent would run it). */
function mcpCall(dataDir, name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'mcp-server.js')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FABLECUT_DATA_DIR: dataDir, FABLECUT_PORT: '0', FABLECUT_NO_AUTOSTART: '1',
        FABLECUT_TEST_IMPORT_ALLOW_PRIVATE: '1', MONTCLIP_DESKTOP: '', MONTCLIP_HOST: '' },
      stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('MCP_TIMEOUT')); }, 60000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      buf += c; let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id === 2) { clearTimeout(timer); child.kill(); resolve(msg.result); }
      }
    });
    const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'url-import-375-smoke', version: '0' } } });
    send({ id: 2, method: 'tools/call', params: { name, arguments: args } });
  });
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let ok = false; const report = {};
  let hits = 0;
  const site = net.createServer((s) => { hits++; s.destroy(); });
  try {
    await new Promise((r) => site.listen(0, '127.0.0.1', r));
    const url = `https://127.0.0.1:${site.address().port}/clip.mp4`;
    const end = Date.now() + 15000; while (!(await read('typeof state!=="undefined"&&state.connected')) && Date.now() < end) await wait(100);
    const dataDir = path.join(app.getPath('userData'), 'workspace');
    report.lock = require('../server/writer-lock').holder(dataDir);
    assert.equal(report.lock && report.lock.shell, 'desktop', 'the app holds its data folder as the desktop engine');
    // the page's own way
    report.page = await read(`fetch('/api/import-url',{method:'POST',body:JSON.stringify({url:${JSON.stringify(url)}})}).then(async r=>({status:r.status,body:await r.json()}))`);
    assert.equal(report.page.status, 403); assert.equal(report.page.body.code, 'NETWORK_DISABLED');
    // an agent's MCP process on the same data folder
    const r = await mcpCall(dataDir, 'fablecut_import_media', { path: url });
    report.mcp = { isError: !!r.isError, text: ((r.content || []).find((c) => c.type === 'text') || {}).text || '' };
    assert.equal(report.mcp.isError, true); assert.match(report.mcp.text, /NETWORK_DISABLED/);
    report.standinHits = hits;
    assert.equal(hits, 0, 'nothing reached the stand-in');
    ok = true;
  } catch (e) { report.error = String(e && e.stack || e).slice(0, 1500); report.standinHits = hits; }
  finally { site.close(); out(ok ? 'URL_IMPORT_PASS' : 'URL_IMPORT_FAIL', report); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => { });
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o = {}) { super({ ...o, show: false }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
