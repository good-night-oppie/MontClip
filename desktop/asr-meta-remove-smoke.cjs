'use strict';
// 删了一半, in the real app (Deja / JJ, 11-05): Meta's model agreed to, with model.int8.onnx and tokens.txt here and
// LICENSE gone — what removing left on Windows when the model was busy (EBUSY 0.8 s into a Meta transcription, before
// the removal waited for Meta's process). Steps:
//   1. the Transcript tab says JJ's 删了一半 words, with 〔删掉 Meta 的模型〕 first and 〔换回 Paraformer〕, no 〔下载并使用〕
//      (zh-CN and en);
//   2. 〔删掉 Meta 的模型〕 once more (the host's box answered 〔删掉〕): the rest of the files and the agreement go;
//   3. the tab is on Paraformer again, and choosing Meta shows "not installed" with 〔下载并使用〕.
//   MONTCLIP_SMOKE_META_DIR=<a folder holding asrMeta/> electron desktop/asr-meta-remove-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// Needs vendor/asr (the engine and the VAD). Prints ASR_META_REMOVE_PASS / ASR_META_REMOVE_FAIL.
const electron = require('electron'), { app, BrowserWindow, session } = electron, fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg = process.argv.find((a) => a.startsWith('--user-data-dir='));
if (!profileArg || !profileArg.slice('--user-data-dir='.length).trim()) throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const META = process.env.MONTCLIP_SMOKE_META_DIR;
if (!META || !fs.existsSync(path.join(META, 'asrMeta', 'model.int8.onnx'))) throw Error('MONTCLIP_SMOKE_META_DIR must hold asrMeta/');
const ROOT = path.join(__dirname, '..'), VENDOR = path.join(ROOT, 'vendor', 'asr');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

// 删了一半: the agreement, two of the three files
const models = path.join(profile, 'asr-models'), metaDir = path.join(models, 'asrMeta');
fs.mkdirSync(metaDir, { recursive: true });
for (const f of ['model.int8.onnx', 'tokens.txt']) fs.copyFileSync(path.join(META, 'asrMeta', f), path.join(metaDir, f));
require('../asr-consent').createConsent({ modelsDir: models }).agree('asrMeta', 'smoke');
const record = path.join(models, 'consent', 'asrMeta.json');
// the engine and the VAD (a copy, so cleaning up never touches vendor/asr)
const asrDir = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-asr-'));
fs.cpSync(path.join(VENDOR, 'engine'), path.join(asrDir, 'engine'), { recursive: true });
fs.copyFileSync(path.join(VENDOR, 'silero_vad.onnx'), path.join(asrDir, 'silero_vad.onnx'));
process.env.MONTCLIP_ASR_DIR = asrDir;
process.env.MONTCLIP_SMOKE_ASR_REVOKE = '1';   // the host's box is answered 〔删掉〕

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  let ok = false;
  const report = {};
  const look = () => read(`(()=>{const q=(s)=>document.querySelector(s),shown=(s)=>!!q(s)&&!q(s).hidden;return{model:asrKey(),text:q('[data-tr-asr]').textContent,
    buttons:[...q('.tr-asr').querySelectorAll('button')].filter((b)=>!b.hidden).map((b)=>b.textContent+(b.classList.contains('accent')?' (first)':'')),
    download:shown('[data-tr-asr-download]'),go:q('[data-tr-go]').disabled};})()`);
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    await read(`updateMontClipView({language:'zh-CN'});true`);
    await wait(1500);
    await read(`(()=>{const d=document.querySelector('.asr-setup[open]');if(d)d.close();return true;})()`);
    await read(`setSideTab('transcript');setAsrKey('asrMeta');true`); await wait(300);
    await read(`loadAsrStatus()`); await wait(300);
    report.status = await read(`fetch('/api/asr/status').then(r=>r.json()).then(s=>({installed:s.asrMeta.installed,consented:s.asrMeta.consented,partlyRemoved:s.asrMeta.partlyRemoved,missing:s.asrMeta.missing}))`);
    if (!report.status.partlyRemoved || report.status.missing.join() !== 'LICENSE') throw Error('STATUS ' + JSON.stringify(report.status));
    // 1. JJ's words and the buttons, both languages
    report.zh = await look();
    const zhWant = 'Meta 的模型没删干净，现在用不了。再点一次〔删掉 Meta 的模型〕就能删完；之后还想用 Meta，再重新下载。现在要听写，先换回 Paraformer。';
    if (report.zh.text !== zhWant || report.zh.buttons.join('|') !== '删掉 Meta 的模型 (first)|换回 Paraformer' || report.zh.download || !report.zh.go) throw Error('ZH ' + JSON.stringify(report.zh));
    await read(`updateMontClipView({language:'en'});paintAsrStatus();true`); await wait(200);
    report.en = await look();
    const enWant = "Meta's model wasn't fully removed, so it can't be used right now. Click “Remove Meta's model” again to finish removing it. To use Meta later, download it again after that. To transcribe now, switch back to Paraformer.";
    if (report.en.text !== enWant || report.en.buttons.join('|') !== "Remove Meta's model (first)|Switch to Paraformer") throw Error('EN ' + JSON.stringify(report.en));
    await read(`updateMontClipView({language:'zh-CN'});paintAsrStatus();true`); await wait(200);
    // 2. 〔删掉 Meta 的模型〕 once more
    const t0 = Date.now();
    await read(`document.querySelector('[data-tr-asr-revoke]').click();true`);
    const until = Date.now() + 20000;
    while (Date.now() < until && (await read(`asrKey()`)) !== 'asr') await wait(150);
    report.removeMs = Date.now() - t0;
    report.left = { metaDir: fs.existsSync(metaDir) ? fs.readdirSync(metaDir) : null, record: fs.existsSync(record) };
    if (report.left.metaDir !== null || report.left.record) throw Error('LEFT ' + JSON.stringify(report.left));
    // 3. back on Paraformer; Meta now simply not installed
    await wait(300);
    report.after = await look();
    if (report.after.model !== 'asr') throw Error('AFTER ' + JSON.stringify(report.after));
    await read(`setAsrKey('asrMeta');true`); await read(`loadAsrStatus()`); await wait(300);
    report.meta = await look();
    report.statusAfter = await read(`fetch('/api/asr/status').then(r=>r.json()).then(s=>({installed:s.asrMeta.installed,consented:s.asrMeta.consented,partlyRemoved:s.asrMeta.partlyRemoved,missing:s.asrMeta.missing.length}))`);
    const missingWant = await read(`uiText('own.asr-missing-meta')`);
    if (report.meta.text !== missingWant || !report.meta.download || report.meta.buttons.includes('换回 Paraformer') || report.statusAfter.partlyRemoved || report.statusAfter.consented) throw Error('META ' + JSON.stringify(report.meta));
    ok = true;
  } catch (e) { report.error = String((e && e.stack) || e).slice(0, 1500); }
  finally {
    try { fs.rmSync(asrDir, { recursive: true, force: true }); } catch { }
    out(ok ? 'ASR_META_REMOVE_PASS' : 'ASR_META_REMOVE_FAIL', report);
    process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1);
  }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, session, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
