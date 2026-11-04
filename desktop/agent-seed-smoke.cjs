'use strict';
// Development-only check of a private package's one-time key (desktop/agent-seed.js) with the real Electron safeStorage:
// own fresh profile, hidden offscreen window, a synthetic key, no network. The seed is named with MONTCLIP_SEED_FILE (a
// packaged app reads resources/montclip-seed-v1.json instead). Checks: the key is sealed into agent-connection-v1.json,
// the seed is deleted, no file of the profile holds the plain key, and nothing this process writes to stdout / stderr
// or the console holds it.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length), connection = path.join(profile, 'agent-connection-v1.json');
const KEY = 'sk-synthetic' + Date.now().toString(36) + 'smoke0seed0key';
const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-seed-smoke-')), seed = path.join(seedDir, 'montclip-seed-v1.json');
fs.writeFileSync(seed, require('./agent-seed').seedText({ model: 'synthetic-flash-model', apiKey: KEY }));
process.env.MONTCLIP_SEED_FILE = seed;
// everything this process says, to search for the key afterwards (and still shown)
const said = [];
for (const s of [process.stdout, process.stderr]) { const w = s.write.bind(s); s.write = (c, ...r) => { said.push(String(c)); return w(c, ...r); }; }
for (const n of ['log', 'info', 'warn', 'error', 'debug']) { const f = console[n].bind(console); console[n] = (...x) => { said.push(x.map(String).join(' ')); return f(...x); }; }
const holding = (dir) => { const out = []; (function walk(d) { let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of list) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { if (fs.statSync(p).size < 64 << 20 && fs.readFileSync(p).includes(Buffer.from(KEY))) out.push(path.relative(dir, p)); } catch {} } } })(dir); return out; };

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args); const read = (s) => this.webContents.executeJavaScript(s);
  let report = {};
  try {
    const conf = await read('montclipAgentService.get()');
    const raw = fs.existsSync(connection) ? fs.readFileSync(connection, 'utf8') : '';
    report = { code: (said.join('').match(/MONTCLIP_SEED (\{[^\n]*\})/) || [])[1] || null, configured: conf.configured, provider: conf.provider, model: conf.model,
      seedGone: !fs.existsSync(seed), connectionWritten: !!raw, connectionHoldsKey: raw.includes(KEY), profileFilesHoldingKey: holding(profile),
      seedDirFilesHoldingKey: holding(seedDir), encryption: require('electron').safeStorage.isEncryptionAvailable() };
    const pass = report.code === '{"code":"SEALED"}' && report.configured === true && report.provider === 'deepseek' && report.model === 'synthetic-flash-model'
      && report.seedGone && report.connectionWritten && !report.connectionHoldsKey && !report.profileFilesHoldingKey.length && !report.seedDirFilesHoldingKey.length;
    const logsHoldKey = said.join('\n').includes(KEY);
    process.stdout.write((pass && !logsHoldKey ? 'SEED_PASS ' : 'SEED_FAIL ') + JSON.stringify({ ...report, logsHoldKey }) + '\n');
  } catch (e) { process.stdout.write('SEED_FAIL ' + (e && e.message) + '\n'); }
  finally { try { fs.rmSync(seedDir, { recursive: true, force: true }); } catch {} setTimeout(() => app.exit(0), 300); }
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load;
  return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
