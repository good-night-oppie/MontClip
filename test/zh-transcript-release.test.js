'use strict';
// JJ, review of #34 0315cbd/4dc47cc (2026-11-02):
// (a) the top bar must not read as "AI connected": 就绪 / 本机程序没响应，请重开 MontClip (JJ, 2026-11-03; was 本机服务正常 / 仅本地会话);
// (b) on-device Chinese transcription is not in this release: a packaged build shows no transcribe
//     button, no model choice and no download hint, and starts no transcription or download; a
//     development build, or the main process's own switch, turns it back on;
// (c) the Chinese says 听写 everywhere, never 转写.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const V = require('../ui-preferences'), F = require('../desktop/features');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js'), zh = V.text['zh-CN'], en = V.text.en;

// JJ's copy review (2026-11-03): 就绪 / 本机程序没响应, 剪掉, the caption-last, empty-panel and module-missing lines
test('(a) the top bar: 就绪, or that the local program is not responding (not that anything is connected)', () => {
  a.equal(zh['own.connected'], '就绪'); a.equal(en['own.connected'], 'Ready');
  a.equal(zh['own.local-session'], '本机程序没响应，请重开 MontClip'); a.equal(en['own.local-session'], "The local program isn't responding. Reopen MontClip");
  a.match(app, /"  ·  ⚪ " \+ uiText\("own\.local-session"\)/);
});

test("JJ's review: 剪掉 instead of 剪切", () => {
  a.equal(zh['own.cut-all'], '全部剪掉'); a.equal(en['own.cut-all'], 'Cut all out');
  a.equal(zh['own.cut-n'], '剪掉 {n} 处'); a.equal(en['own.cut-n'], 'Cut out {n}');
});

test("JJ's review: captions last", () => {
  a.equal(zh['own.caption-last'], '字幕最后再加：剪辑改了以后，已经加好的字幕不会跟着对齐，要重新加一次。');
  a.equal(en['own.caption-last'], "Add captions last: once the edit changes, captions already added don't follow it, so add them again.");
});

// #70 (Deja, 2026-11-03): on-device transcription is in this release now, so the empty panel no longer says it is being developed
test("(b) the empty-panel line (new copy, for JJ)", () => {
  a.equal(zh['own.tr-empty'], '先听写，或者导入 SRT 字幕文件，文稿就会显示在这里。');
  a.equal(en['own.tr-empty'], 'Transcribe, or import an SRT subtitle file, and the transcript will show here.');
});

test("JJ's review: the transcript feature did not load", () => {
  a.equal(zh['own.tr-module-missing'], '文稿功能没加载出来。请关掉 MontClip 再重新打开。');
  a.equal(en['own.tr-module-missing'], "The transcript feature didn't load. Close MontClip and open it again.");
});

// #70 (Deja, 2026-11-03): the speech runs in the local server (sherpa-onnx, asr-local.js). The page reaches it one way:
// transcribeFile → POST /api/asr/transcribe, called only from transcribeSrcs after the transcribeAvailable() check. The
// page holds no model address; a model is downloaded or imported only by the main process (window.montclipAsr), which
// asks first. The desktop session still cancels every request from the window that is not to the local server.
test('(b) one path to the speech engine, behind the switch; downloads only through the main process', () => {
  const count = (re) => (app.match(re) || []).length;
  a.equal(count(/\/api\/asr\/transcribe/g), 1, 'one call to the engine');
  a.match(app, /async function transcribeFile\([^)]*\) \{[\s\S]*?fetch\("\/api\/asr\/transcribe", \{ method: "POST"/);
  a.equal(count(/transcribeFile\(/g), 2, 'transcribeFile: its definition and one call, in transcribeSrcs');
  const at = app.indexOf('async function transcribeSrcs('), body = app.slice(at, app.indexOf('\nasync function ', at + 1));
  a.ok(body.indexOf('if (!transcribeAvailable()) throw') >= 0 && body.indexOf('if (!transcribeAvailable()) throw') < body.indexOf('transcribeFile('),
    'the switch is checked before anything is transcribed');
  a.ok(body.indexOf('if (!transcribeAvailable()) throw') < body.indexOf('trState.busy = '));
  a.equal(count(/trState\.busy = \{/g), 1);
  // (the one CDN address left in app.js is MediaPipe's portrait cut-out, which the desktop session blocks anyway)
  a.ok(!/https?:\/\/[^"'\s]*(hf-mirror|github|huggingface|paraformer|sherpa|whisper|transformers)/i.test(app), 'no speech model address in the page');
  a.match(app, /window\.montclipAsr\.download\(/); a.match(app, /window\.montclipAsr\.import\(/);
  a.match(read('desktop/main.js'), /ses\.webRequest\.onBeforeRequest\(\(details, callback\) => \{\s*const embedded = \/\^\(blob:\|data:\)\/\.test\(details\.url\);\s*callback\(\{ cancel: !local\(details\.url\) && !embedded \}\);/);
});

test('(c) 听写 everywhere in Chinese, never 转写', () => {
  for (const [k, v] of Object.entries(zh)) a.ok(!/转写/.test(v), k + ': ' + v);
  a.match(zh['own.transcribe'], /听写/);
  for (const f of ['app.js', 'index.html', 'ui-terms.js', 'desktop/main.js']) a.ok(!/转写/.test(read(f)), f);
});

// #70 (Deja, 2026-11-03): this release carries transcription, so the package turns it on; a test can still turn it off
test('(b) the switch: on, in development and in the package; a launch argument or an environment variable turns it off', () => {
  const on = F.transcribeEnabled;
  a.equal(on({ isPackaged: false, argv: [], env: {} }), true);
  a.equal(on({ isPackaged: true, argv: ['MontClip.exe'], env: {} }), true);
  a.equal(on({ isPackaged: true, argv: ['MontClip.exe', '--montclip-no-transcribe'], env: {} }), false);
  a.equal(on({ isPackaged: true, argv: [], env: { MONTCLIP_NO_TRANSCRIBE: '1' } }), false);
  a.equal(on({ isPackaged: true, argv: [], env: { MONTCLIP_NO_TRANSCRIBE: 'yes' } }), true);
  const main = read('desktop/main.js'), preload = read('desktop/view-preload.js');
  a.match(main, /ipcMain\.on\("montclip:features:get", \(event\) => \{\s*event\.returnValue = settingsAllowed\(event, win, origin\) \? \{ transcribe: features\.transcribe \} : \{ transcribe: false \};/);
  a.match(main, /const features = \{ transcribe: transcribeEnabled\(\{ isPackaged: app\.isPackaged, argv: process\.argv, env: process\.env \}\) \};/);
  // the page reads it once; it has no way to set it
  a.match(preload, /contextBridge\.exposeInMainWorld\('montclipFeatures',Object\.freeze\(\{transcribe:!!\(ipcRenderer\.sendSync\('montclip:features:get'\)\|\|\{\}\)\.transcribe\}\)\)/);
  a.ok(!/montclip:features:set/.test(main + preload));
});

test('(b) with the switch off, no transcribe entry, no model status and no download button', () => {
  const at = app.indexOf('function buildTranscriptPage()'), body = app.slice(at, app.indexOf('\n}\n', at));
  a.match(body, /const listen = transcribeAvailable\(\);/);
  for (const sel of ['data-tr-go', 'data-tr-asr', 'data-tr-cap-add', 'data-tr-busy'])
    a.match(body, new RegExp('\\$\\{listen \\? `[^`]*' + sel), sel + ' only when transcription is available');
  a.match(app, /function transcribeAvailable\(\) \{ return !window\.montclipViewSettings \|\| !!\(window\.montclipFeatures && window\.montclipFeatures\.transcribe\); \}/);
});

test('(b) with transcription off nothing starts: no request to the engine', async () => {
  const pick = (start, endMark) => { const i = app.indexOf(start); return app.slice(i, app.indexOf(endMark, i)); };
  const src = pick('function transcribeAvailable()', '\n') + '\n' + pick('async function transcribeSrcs(', '\nasync function ') ;
  const calls = { fetch: 0 };
  const ctx = { window: { montclipViewSettings: {}, montclipFeatures: { transcribe: false } }, fetch: async () => { calls.fetch++; return {}; },
    transcribeSettings: () => ({}), trState: {}, renderTranscript() {},
    console, Promise, Error, Object };
  vm.createContext(ctx); vm.runInContext(src + '\nthis.transcribeSrcs = transcribeSrcs;', ctx);
  await a.rejects(ctx.transcribeSrcs(['/media/a.wav']), (e) => e.code === 'TRANSCRIBE_DISABLED');
  a.deepEqual(calls, { fetch: 0 });
});
