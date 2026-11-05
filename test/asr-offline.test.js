'use strict';
// #70 (Deja, 2026-11-03): on-device transcription is sherpa-onnx-node 2.0.1 with Paraformer zh (2023-09-14, int8), run by
// the local server (asr-local.js), silero VAD first. The editor no longer runs Whisper in the browser: nothing in the page
// loads a speech model, a library or a wasm file, and the desktop window's script policy is back to plain 'self'.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { startServer, makeDataDir } = require('./helpers');

test('Whisper, transformers.js and the browser worker are gone; the editor asks the local server to transcribe', () => {
  a.ok(!fs.existsSync(path.join(ROOT, 'transcribe-worker.js')), 'no browser worker');
  a.ok(!fs.existsSync(path.join(ROOT, 'desktop', 'transcribe-manifest.json')) && !fs.existsSync(path.join(ROOT, 'desktop', 'fetch-transcribe.cjs')));
  for (const f of ['app.js', 'transcribe.js', 'index.html', 'server.js']) {
    const s = read(f);
    a.ok(!/whisper|transformers\.min|onnxruntime-web|transcribe-worker|transcribe-assets|jsdelivr\.net\/npm\/@huggingface/i.test(s), f + ' still mentions the old browser path');
  }
  const app = read('app.js');
  a.match(app, /fetch\("\/api\/asr\/transcribe", \{ method: "POST"/);
  a.ok(!/new Worker\(/.test(app.slice(app.indexOf('async function transcribeFile('), app.indexOf('async function transcribeSrcs('))));
});
test('transcribe.js knows one model, Paraformer zh, and Mandarin (with some English)', () => {
  const T = require('../transcribe');
  a.equal(T.DEFAULT_MODEL, 'paraformer-zh'); a.equal(T.model(), 'paraformer-zh'); a.equal(T.model('paraformer-zh'), 'paraformer-zh');
  a.throws(() => T.model('base'), /paraformer-zh/);
  a.equal(T.language(), 'zh'); a.equal(T.language('auto'), 'zh'); a.equal(T.language('ZH'), 'zh');
  a.throws(() => T.language('ja'), /Mandarin/);
  a.ok(!('LIBRARY' in T) && !('joinChunks' in T) && !('plan' in T), 'the Whisper helpers are gone');
});
test('the desktop window: no wasm in the script policy any more; the session still cancels every non-local request', () => {
  const main = read('desktop/main.js');
  a.match(main, /"default-src 'self'; script-src 'self'; style-src/);
  a.ok(!/wasm-unsafe-eval/.test(main));
  a.match(main, /ses\.webRequest\.onBeforeRequest\(\(details, callback\) => \{\s*const embedded = \/\^\(blob:\|data:\)\/\.test\(details\.url\);\s*callback\(\{ cancel: !local\(details\.url\) && !embedded \}\);/);
});
test('the server: model status, one transcription at a time, cancel; it reads models only from its own folders', async (t) => {
  const dataDir = makeDataDir(t);
  // a stand-in engine folder: status() only looks for the engine's package.json and a VAD file of the pinned size
  const asrDir = path.join(dataDir, 'asr'); fs.mkdirSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node'), { recursive: true });
  fs.writeFileSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json'), '{}');
  // and its native part for this computer (P8: without it the engine is not ready)
  const native = path.join(asrDir, 'engine', 'node_modules', require('../asr-local').nativePackage()); fs.mkdirSync(native); fs.writeFileSync(path.join(native, 'package.json'), '{}');
  fs.writeFileSync(path.join(asrDir, 'silero_vad.onnx'), Buffer.alloc(643854));
  const s = await startServer(t, dataDir, { MONTCLIP_ASR_DIR: asrDir, MONTCLIP_ASR_MODELS_DIR: path.join(dataDir, 'no-models') });
  const st = await (await fetch(s.base + '/api/asr/status')).json();
  a.equal(st.asr.ready, false); a.deepEqual(st.asr.missing, ['model.int8.onnx', 'tokens.txt']);
  a.equal(st.punct.ready, false); a.equal(typeof st.engine.ready, 'boolean');
  a.equal(st.model, 'paraformer-zh-2023-09-14-int8');
  const r = await fetch(s.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ src: '/media/nothing.wav' }) });
  a.equal(r.status, 404, 'a file that is not there');
  const media = path.join(dataDir, 'media', 'a.wav'); fs.mkdirSync(path.dirname(media), { recursive: true }); fs.writeFileSync(media, Buffer.alloc(100));
  const r2 = await fetch(s.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ src: '/media/a.wav' }) });
  a.equal(r2.status, 409); a.equal((await r2.json()).code, 'ASR_MODEL_MISSING', 'no model: says so, downloads nothing');
  a.equal((await fetch(s.base + '/api/asr/cancel', { method: 'POST' })).status, 200);
  for (const bad of ['/media/../project.json', 'C:/Windows/win.ini', '/library/../../x'])
    a.ok([400, 403, 404].includes((await fetch(s.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify({ src: bad }) })).status), bad);
});
test('packaging: the engine and the VAD always; the models only in the 完整版 package (--full), each checked again inside it', () => {
  const pkg = read('desktop/package-win.cjs');
  a.match(pkg, /require\('\.\/fetch-asr\.cjs'\)/);
  a.match(pkg, /const full = process\.argv\.includes\('--full'\)/);
  a.match(pkg, /Asr\.verify\(\{ models: full \}\)/);
  a.match(pkg, /Asr\.verify\(\{ dir: path\.join\(appDir, 'resources', 'asr'\), models: full \}\)/);
  a.match(pkg, /MontClip-internal-win-x64\$\{full \? '-full' : ''\}-\$\{buildId\}/, 'the 完整版 zip has its own name');
  a.ok(pkg.includes("const asrKeep = (f) => !isUnder(f, 'test_wavs') && (full || !isUnder(f, 'models'));") && pkg.includes('filter: asrKeep'), 'no test sentence; models only in the 完整版');
  const fetchAsr = read('desktop/fetch-asr.cjs');
  a.match(fetchAsr, /integrityOk\(/); a.match(fetchAsr, /--models/);
  const main = read('desktop/main.js');
  a.match(main, /env\.MONTCLIP_ASR_DIR = path\.join\(process\.resourcesPath, "asr"\)/);
  a.match(main, /env\.MONTCLIP_ASR_MODELS_DIR = path\.join\(app\.getPath\("userData"\), "asr-models"\)/);
});
test('the package turns transcription on; the switch can still turn it off for a test', () => {
  const F = require('../desktop/features');
  a.equal(F.transcribeEnabled({ isPackaged: true, argv: [], env: {} }), true);
  a.equal(F.transcribeEnabled({ isPackaged: false, argv: [], env: {} }), true);
  a.equal(F.transcribeEnabled({ isPackaged: true, argv: ['--montclip-no-transcribe'], env: {} }), false);
  a.equal(F.transcribeEnabled({ isPackaged: true, argv: [], env: { MONTCLIP_NO_TRANSCRIBE: '1' } }), false);
});
test('downloading and importing a model are the main process\'s: it asks first (sizes and hosts), only listed hosts; the page cannot pass a path or a URL', () => {
  const main = read('desktop/main.js'), pre = read('desktop/view-preload.js');
  a.match(main, /ipcMain\.handle\("montclip:asr:download", async \(event, which\) =>/);
  a.match(main, /ipcMain\.handle\("montclip:asr:import", async \(event\) =>/);
  a.match(main, /settingsAllowed\(event, win, origin\)[\s\S]{0,200}montclip:asr:download|montclip:asr:download[\s\S]{0,400}settingsAllowed\(event, win, origin\)/);
  a.match(main, /const t = asrDownloadText\(languageOf\(settings\.get\(\)\), which\);[\s\S]{0,300}dialog\.showMessageBox\(win, \{ type: "question", title: t\.title, message: t\.message, detail: t\.detail, buttons: t\.buttons, defaultId: 0, cancelId: 0/,
    'a host-made question before anything is sent; Cancel is the default');
  a.match(main, /if \(answer\.response !== 1\) return \{ ok: false, declined: true \};\s*asrBusy = new AbortController\(\);/);
  // a folder (the U 盘, or a folder on it): Windows cannot pick files and folders in one dialog; inside it, model files and
  // the official archives are recognised by their SHA-256 (asr-models.js importPaths)
  a.match(main, /dialog\.showOpenDialog\(win, \{[\s\S]{0,300}properties: \["openDirectory"\]/);
  a.match(main, /AsrDownload\.fetchFile/);
  a.match(pre, /montclipAsr/);
  a.ok(!/montclip:asr:(download|import)'\s*,\s*[a-z]/i.test(pre.replace(/which/g, '')), 'the page sends no path or URL');
});
test('licences: sherpa-onnx, onnxruntime, Paraformer, CT-Transformer, silero VAD; the Whisper ones are gone', () => {
  const dir = path.join(ROOT, 'licenses', 'asr'), names = fs.readdirSync(dir).sort();
  for (const n of ['sherpa-onnx-Apache-2.0.txt', 'onnxruntime-MIT.txt', 'paraformer-zh-Apache-2.0.txt', 'ct-transformer-Apache-2.0.txt', 'silero-vad-MIT.txt']) a.ok(names.includes(n), n);
  a.ok(!fs.existsSync(path.join(ROOT, 'licenses', 'transcribe')));
  a.match(read('LICENSES.md'), /sherpa-onnx-node 2\.0\.1/);
  a.match(read('desktop/package-win.cjs'), /licenses', 'asr'/);
});
test('the real engine on the model\'s own public test sentence (only where desktop/fetch-asr.cjs --models asr has run)', { skip: !fs.existsSync(path.join(ROOT, 'vendor', 'asr', 'models', 'asr', 'model.int8.onnx')) && 'vendor/asr models not fetched here' }, async () => {
  const { createAsr } = require('../asr-local');
  const asr = createAsr({ asrDir: path.join(ROOT, 'vendor', 'asr'), modelsDir: path.join(ROOT, 'vendor', 'asr', 'models'), ffmpeg: require('../ffmpeg-path').path('ffmpeg') });
  a.equal(asr.status().asr.ready, true);
  const wav = path.join(ROOT, 'vendor', 'asr', 'test_wavs', '0.wav');
  const r = await asr.transcribe(wav, {});
  a.ok(r.words.length > 5, 'words: ' + r.words.length);
  a.ok(r.words.every((w, i) => w[2] >= w[1] && (!i || w[1] >= r.words[i - 1][1])));
});

// JJ's final copy (documents/2026-11-03-MontClip-听写文案定稿-JJ.md, v2) for what #70 shows: the model line of the
// Transcript tab, the download states and the empty panel. The first-run page with three choices, the cloud choice and
// 设置 › 听写 are not in #70.
test('JJ v2: the download states and the empty panel, word for word', () => {
  const V = require('../ui-preferences'), zh = (k, v) => V.t('zh-CN', 'own.' + k, v);
  a.equal(zh('asr-missing'), '第一次要联网下载一个听写模型，大约 230 MB，只下载这一次。下载完以后，听写全程在这台电脑上做，声音不会发出去。');
  a.equal(zh('asr-download'), '下载并使用（约 230 MB）');
  a.equal(zh('asr-downloading', { got: '12 MB' }), '正在下载听写模型：12 MB / 约 230 MB。可以先去剪辑，下载完会告诉你。');
  a.equal(zh('asr-download-cancel'), '取消下载');
  a.equal(zh('asr-ready'), '听写模型装好了。以后听写都在这台电脑上做，不用再联网。');
  a.equal(zh('asr-interrupted'), '听写模型没下载完，已经下载的部分会留着。检查一下网络，再点「接着下载」。');
  a.equal(zh('asr-resume'), '接着下载'); a.equal(zh('asr-later'), '以后再说');
  a.equal(zh('asr-no-space', { drive: 'C', free: '120 MB' }), 'C 盘空间不够，下载听写模型需要大约 230 MB，现在只剩 120 MB。腾出空间以后再点「接着下载」。');
  a.equal(zh('asr-check-failed'), '下载的文件不完整，已删掉，请再下载一次。');
  a.equal(zh('asr-again'), '再下载一次');
  a.equal(zh('tr-empty'), '还没有文稿。点「听写选中的」，把选中的片段听写成文字。');
  for (const k of ['asr-missing', 'asr-download', 'asr-downloading', 'asr-ready', 'asr-interrupted', 'asr-no-space', 'asr-check-failed', 'asr-resume', 'asr-later', 'asr-again', 'asr-download-cancel', 'tr-empty'])
    a.ok(V.text.en['own.' + k] && !/[一-鿿]/.test(V.text.en['own.' + k]), k + ' in English');
  const app = read('app.js');
  a.ok(!/data-tr-asr-punct/.test(app), 'the transcript tab offers no punctuation download (Settings › 听写 does: test/asr-jj3.test.js)');
  a.match(app, /data-tr-asr-cancel/); a.match(app, /data-tr-asr-later/);
});
test('the page can stop a download; the part is kept for 「接着下载」', () => {
  const main = read('desktop/main.js'), pre = read('desktop/view-preload.js');
  a.match(main, /ipcMain\.handle\("montclip:asr:cancel", async \(event\) =>/);
  a.match(pre, /cancel:\(\)=>ipcRenderer\.invoke\('montclip:asr:cancel'\)/);
});
