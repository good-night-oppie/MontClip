'use strict';
// JJ, review of #34 0315cbd/4dc47cc (2026-11-02):
// (a) the top bar must not read as "AI connected": 本机服务正常 / 仅本地会话;
// (b) on-device Chinese transcription is not in this release: a packaged build shows no transcribe
//     button, no model choice and no download hint, and starts no transcription or download; a
//     development build, or the main process's own switch, turns it back on;
// (c) the Chinese says 听写 everywhere, never 转写.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const V = require('../ui-preferences'), F = require('../desktop/features');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js'), zh = V.text['zh-CN'], en = V.text.en;

test('(a) the top bar says the local service runs, not that anything is connected', () => {
  a.equal(zh['own.connected'], '本机服务正常'); a.equal(en['own.connected'], 'local service running');
  a.equal(zh['own.local-session'], '仅本地会话'); a.equal(en['own.local-session'], 'local session only');
});

test("(b) JJ's empty-panel line", () => {
  a.equal(zh['own.tr-empty'], '先导入 SRT 字幕，这里会显示文稿。本机中文听写还在做。');
  a.equal(en['own.tr-empty'], 'Import an SRT subtitle file and the transcript will show here. Chinese transcription on this computer is still in progress.');
});

test('(c) 听写 everywhere in Chinese, never 转写', () => {
  for (const [k, v] of Object.entries(zh)) a.ok(!/转写/.test(v), k + ': ' + v);
  a.match(zh['own.transcribe'], /听写/);
  for (const f of ['app.js', 'index.html', 'ui-terms.js', 'desktop/main.js']) a.ok(!/转写/.test(read(f)), f);
});

test('(b) the switch: on in development; in a packaged build only by a launch argument or an environment variable', () => {
  const on = F.transcribeEnabled;
  a.equal(on({ isPackaged: false, argv: [], env: {} }), true);
  a.equal(on({ isPackaged: true, argv: ['MontClip.exe'], env: {} }), false);
  a.equal(on({ isPackaged: true, argv: ['MontClip.exe', '--montclip-dev-transcribe'], env: {} }), true);
  a.equal(on({ isPackaged: true, argv: [], env: { MONTCLIP_DEV_TRANSCRIBE: '1' } }), true);
  a.equal(on({ isPackaged: true, argv: [], env: { MONTCLIP_DEV_TRANSCRIBE: 'yes' } }), false);
  const main = read('desktop/main.js'), preload = read('desktop/view-preload.js');
  a.match(main, /ipcMain\.on\("montclip:features:get", \(event\) => \{\s*event\.returnValue = settingsAllowed\(event, win, origin\) \? \{ transcribe: features\.transcribe \} : \{ transcribe: false \};/);
  a.match(main, /const features = \{ transcribe: transcribeEnabled\(\{ isPackaged: app\.isPackaged, argv: process\.argv, env: process\.env \}\) \};/);
  // the page reads it once; it has no way to set it
  a.match(preload, /contextBridge\.exposeInMainWorld\('montclipFeatures',Object\.freeze\(\{transcribe:!!\(ipcRenderer\.sendSync\('montclip:features:get'\)\|\|\{\}\)\.transcribe\}\)\)/);
  a.ok(!/montclip:features:set/.test(main + preload));
});

test('(b) a packaged build shows no transcribe entry and no download hint', () => {
  const at = app.indexOf('function buildTranscriptPage()'), body = app.slice(at, app.indexOf('\n}\n', at));
  a.match(body, /const listen = transcribeAvailable\(\);/);
  for (const sel of ['data-tr-go', 'data-tr-model', 'data-tr-lang', 'data-tr-cap-add', 'data-tr-busy'])
    a.match(body, new RegExp('\\$\\{listen \\? `[^`]*' + sel), sel + ' only when transcription is available');
  a.match(app, /function transcribeAvailable\(\) \{ return !window\.montclipViewSettings \|\| !!\(window\.montclipFeatures && window\.montclipFeatures\.transcribe\); \}/);
});

test('(b) with transcription off nothing starts: no worker, no download', async () => {
  const pick = (start, endMark) => { const i = app.indexOf(start); return app.slice(i, app.indexOf(endMark, i)); };
  const src = pick('function transcribeAvailable()', '\n') + '\n' + pick('async function transcribeSrcs(', '\nasync function ') ;
  const calls = { worker: 0, fetch: 0 };
  const ctx = { window: { montclipViewSettings: {}, montclipFeatures: { transcribe: false } }, Worker: function () { calls.worker++; }, fetch: async () => { calls.fetch++; return {}; },
    console, Promise, Error, Object };
  vm.createContext(ctx); vm.runInContext(src + '\nthis.transcribeSrcs = transcribeSrcs;', ctx);
  await a.rejects(ctx.transcribeSrcs(['/media/a.wav']), (e) => e.code === 'TRANSCRIBE_DISABLED');
  a.deepEqual(calls, { worker: 0, fetch: 0 });
});
