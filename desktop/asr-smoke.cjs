'use strict';
// On-device transcription in the real app (#70, Deja 2026-11-03): a fresh profile, a hidden offscreen window, the real
// main.js. Every request the window makes is logged with what main.js's session filter decided, and every https request
// the main process starts is logged too. Steps:
//   1. no model: the Transcript tab says so and offers Download and Import; transcribing answers ASR_MODEL_MISSING;
//   2. Download asks first (the host's own box) and, declined, sends nothing;
//   3. Import from a "U 盘": a folder with the model files under other names and a stray file; they are recognised by
//      their SHA-256, the stray one is left alone, and the tab says the model is ready;
//   4. the model's own public test sentence (vendor/asr/test_wavs/0.wav) is transcribed through the app's transcribeSrcs:
//      Chinese characters with times, punctuation, no space between characters, in the tab too.
// Passes with no request leaving this computer.
//   MONTCLIP_FFMPEG_DIR=<bundled ffmpeg> electron desktop/asr-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// Needs vendor/asr with the models (node desktop/fetch-asr.cjs --models asr,punct). Prints ASR_SMOKE_PASS / ASR_SMOKE_FAIL.
const electron = require('electron'), { app, BrowserWindow, session } = electron, fs = require('node:fs'), os = require('node:os'), path = require('node:path'), https = require('node:https');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const ROOT = path.join(__dirname, '..'), VENDOR = path.join(ROOT, 'vendor', 'asr');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

// a "U 盘": the model files renamed, inside a folder, beside a stray file
const usb = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-usb-'));
fs.mkdirSync(path.join(usb, '听写模型'), { recursive: true });
// the punctuation model on a second one, imported afterwards (Deja: Settings › 听写 offers it while it is missing)
const usb2 = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-usb2-'));
fs.mkdirSync(path.join(usb2, '标点'), { recursive: true });
fs.copyFileSync(path.join(VENDOR, 'models', 'asr', 'model.int8.onnx'), path.join(usb, '听写模型', 'paraformer.onnx'));
fs.copyFileSync(path.join(VENDOR, 'models', 'asr', 'tokens.txt'), path.join(usb, '听写模型', 'tokens 副本.txt'));
fs.copyFileSync(path.join(VENDOR, 'models', 'punct', 'model.int8.onnx'), path.join(usb2, '标点', 'punct.onnx'));
fs.copyFileSync(path.join(VENDOR, 'models', 'punct', 'tokens.json'), path.join(usb2, '标点', 'tokens.json'));
fs.writeFileSync(path.join(usb, '说明.txt'), '这不是模型文件');
process.env.MONTCLIP_SMOKE_ASR_IMPORT = usb;
// the engine and the VAD as a package without models has them (a copy, so cleaning up never touches vendor/asr)
const asrDir = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-asr-'));
fs.cpSync(path.join(VENDOR, 'engine'), path.join(asrDir, 'engine'), { recursive: true });
fs.copyFileSync(path.join(VENDOR, 'silero_vad.onnx'), path.join(asrDir, 'silero_vad.onnx'));
process.env.MONTCLIP_ASR_DIR = asrDir;
delete process.env.MONTCLIP_SMOKE_ASR_CONSENT;   // the download question is answered "Cancel"

// every request the window makes, with main.js's decision; every https request of the main process
const requests = [], mainRequests = [];
const fromPartition = session.fromPartition.bind(session);
session.fromPartition = (...args) => {
  const ses = fromPartition(...args), wr = ses.webRequest, on = wr.onBeforeRequest.bind(wr);
  wr.onBeforeRequest = (filterOrListener, maybe) => {
    const listener = typeof filterOrListener === 'function' ? filterOrListener : maybe;
    const wrapped = (details, callback) => listener(details, (res) => { requests.push({ url: details.url.slice(0, 200), cancelled: !!(res && res.cancel) }); callback(res); });
    return typeof filterOrListener === 'function' ? on(wrapped) : on(filterOrListener, wrapped);
  };
  return ses;
};
for (const k of ['get', 'request']) { const orig = https[k]; https[k] = (...a) => { mainRequests.push(String(a[0] && a[0].href || a[0]).slice(0, 200)); return orig.apply(https, a); }; }

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  let ok = false;
  const report = {};
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    await read(`updateMontClipView({language:'zh-CN'});true`);
    const media = path.join(profile, 'workspace', 'media'); fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(path.join(VENDOR, 'test_wavs', '0.wav'), path.join(media, '语音 测试.wav'));
    const src = '/media/' + encodeURIComponent('语音 测试.wav').replace(/%20/g, ' ');
    // 0. v10: the setup page opens by itself the first time
    const setupOpen = async () => { const until = Date.now() + 8000; while (Date.now() < until) { if (await read(`!!document.querySelector('.asr-setup[open]')`)) return true; await wait(150); } return false; };
    if (!(await setupOpen())) throw Error('SETUP did not open');
    report.setup = await read(`(()=>{const d=document.querySelector('.asr-setup[open]');return{title:d.querySelector('h2').textContent,cloud:/选服务|云端/.test(d.textContent),n:/测试电脑/.test(d.textContent),buttons:[...d.querySelectorAll('button')].map(b=>b.textContent)};})()`);
    if (report.setup.title !== '要不要自动出字幕？' || report.setup.cloud || report.setup.n || report.setup.buttons.join('|') !== '下载并使用（约 230 MB）|以后再说') throw Error('SETUP ' + JSON.stringify(report.setup));
    await read(`document.querySelector('.asr-setup [data-asr-setup=download]').click();true`); await wait(800);
    report.setupDeclined = await read(`(()=>{const d=document.querySelector('.asr-setup[open]');return d&&d.querySelector('h2').textContent;})()`);
    if (report.setupDeclined !== '要不要自动出字幕？' || mainRequests.length) throw Error('SETUP_DECLINED ' + report.setupDeclined);
    await read(`document.querySelector('.asr-setup [data-asr-setup=later]').click();true`); await wait(500);
    report.later = await read(`(async()=>({open:!!document.querySelector('.asr-setup[open]'),choice:(await window.montclipAsr.choice()).choice}))()`);
    if (report.later.open || report.later.choice !== 'later') throw Error('LATER ' + JSON.stringify(report.later));
    await read(`openSettings();true`); await wait(400);
    report.settings = await read(`({shown:!document.getElementById('setAsr').classList.contains('hidden'),status:document.getElementById('setAsrStatus').textContent,button:document.getElementById('btnAsrSetup').textContent})`);
    if (!report.settings.shown || report.settings.status !== '还没装听写' || report.settings.button !== '去装') throw Error('SETTINGS ' + JSON.stringify(report.settings));
    await read(`document.getElementById('btnAsrSetup').click();true`);
    if (!(await setupOpen())) throw Error('SETUP from Settings did not open');
    // the five states of the page, painted from the same state the download sets
    report.states = await read(`(()=>{const out={},d=()=>document.querySelector('.asr-setup[open]'),look=()=>({title:d().querySelector('h2').textContent,text:d().querySelector('p').textContent,buttons:[...d().querySelectorAll('button')].map(b=>b.textContent)});
      asrState.downloading={loaded:12*1048576,total:243371218};paintAsrSetup();out.dl=look();asrState.downloading=null;
      asrSetup.state='done';paintAsrSetup();out.done=look();asrSetup.state=null;
      for(const [k,ph] of [['net','interrupted'],['space','no-space'],['bad','check-failed']]){asrState.phase=ph;asrState.space={drive:'C',free:120*1048576};paintAsrSetup();out[k]=look();}
      asrState.phase=null;asrState.space=null;paintAsrSetup();return out;})()`);
    const S = report.states, want = {
      dl: ['正在下载听写模型', '正在下载听写模型：12 MB / 约 230 MB。可以先去剪辑，下载完会告诉你。', '取消下载'],
      done: ['听写模型装好了', '听写模型装好了。以后听写都在这台电脑上做，不用再联网。', '好'],
      net: ['没下载完', '听写模型没下载完，已经下载的部分会留着。检查一下网络，再点「接着下载」。', '接着下载|以后再说'],
      space: ['空间不够', 'C 盘空间不够，下载听写模型需要大约 230 MB，现在只剩 120 MB。腾出空间以后再点「接着下载」。', '接着下载|以后再说'],
      bad: ['文件不完整', '下载的文件不完整，已删掉，请再下载一次。', '再下载一次|以后再说'] };
    for (const [k, [title, text, buttons]] of Object.entries(want))
      if (S[k].title !== title || S[k].text !== text || S[k].buttons.join('|') !== buttons) throw Error('STATE ' + k + ' ' + JSON.stringify(S[k]));
    await read(`document.querySelector('.asr-setup[open]').close();closeSettings();true`); await wait(300);
    // 1. no model
    await read(`setSideTab('transcript');true`); await wait(300);
    await read(`loadAsrStatus()`); await wait(200);
    report.before = await read(`({text:document.querySelector('[data-tr-asr]').textContent,download:!document.querySelector('[data-tr-asr-download]').hidden,import:!document.querySelector('[data-tr-asr-import]').hidden,go:document.querySelector('[data-tr-go]').disabled})`);
    if (!report.before.text.startsWith('第一次要联网下载一个听写模型') || !report.before.download || !report.before.import) throw Error('BEFORE ' + JSON.stringify(report.before));
    report.missing = await read(`transcribeSrcs([${JSON.stringify(src)}]).then(r=>r.failed.map(f=>f.code))`);
    if (report.missing[0] !== 'ASR_MODEL_MISSING') throw Error('MISSING ' + JSON.stringify(report.missing));
    // 2. download declined: nothing sent
    report.declined = await read(`window.montclipAsr.download('asr')`);
    if (!report.declined.declined || mainRequests.length) throw Error('DECLINED ' + JSON.stringify(report.declined) + ' ' + mainRequests.length);
    // 3. import from the "U 盘"
    await read(`document.querySelector('[data-tr-asr-import]').click();true`);
    const until = Date.now() + 60000;
    while (Date.now() < until && !(await read(`asrReady()`))) await wait(250);
    // the speech model only: Settings › 听写 offers the punctuation model
    await read(`openSettings();true`); await wait(300);
    report.punctOffer = await read(`({shown:!document.getElementById('setAsrPunct').hidden,text:document.getElementById('setAsrPunctText').textContent,button:document.getElementById('btnAsrPunct').textContent})`);
    await read(`closeSettings();true`);
    if (!report.punctOffer.shown || report.punctOffer.text !== '字幕默认不带标点；另外装一个标点模型（下载约 60 MB）就有标点。' || report.punctOffer.button !== '装标点模型') throw Error('PUNCT_OFFER ' + JSON.stringify(report.punctOffer));
    // then the punctuation model from the second "U 盘"
    process.env.MONTCLIP_SMOKE_ASR_IMPORT = usb2;
    await read(`asrImport();true`);
    while (Date.now() < until && !(await read(`asrReady()&&!!(asrState.status&&asrState.status.punct.ready)`))) await wait(250);
    report.imported = await read(`({note:asrState.note,text:document.querySelector('[data-tr-asr]').textContent})`);
    await wait(6500);
    report.after = await read(`document.querySelector('[data-tr-asr]').textContent`);
    if (report.after !== '听写模型装好了。以后听写都在这台电脑上做，不用再联网。') throw Error('AFTER ' + JSON.stringify(report));
    report.modelFiles = fs.readdirSync(path.join(profile, 'asr-models', 'asr')).sort();
    if (report.modelFiles.join() !== 'model.int8.onnx,tokens.txt') throw Error('FILES ' + report.modelFiles);
    await read(`openSettings();true`); await wait(300);
    report.settingsAfter = await read(`({status:document.getElementById('setAsrStatus').textContent,button:document.getElementById('btnAsrSetup').hidden,punctLine:!document.getElementById('setAsrPunct').hidden})`);
    await read(`closeSettings();true`);
    if (report.settingsAfter.status !== '听写模型装好了。以后听写都在这台电脑上做，不用再联网。' || !report.settingsAfter.button || report.settingsAfter.punctLine) throw Error('SETTINGS_AFTER ' + JSON.stringify(report.settingsAfter));
    // 4. transcribe the model's own test sentence
    const t0 = Date.now();
    report.result = await read(`transcribeSrcs([${JSON.stringify(src)}]).then(async r=>{const d=await loadTranscript(${JSON.stringify(src)},true);return{done:r.done.length,failed:r.failed,words:d?d.words.length:0,text:d?MontClipTranscribe.join(d.words.map(w=>w[0])):'',first:d?d.words.slice(0,3):[],model:d&&d.model,language:d&&d.language}})`);
    report.ms = Date.now() - t0;
    if (report.result.done !== 1 || !/介绍/.test(report.result.text) || !/[，。]/.test(report.result.text) || /[一-鿿] [一-鿿]/.test(report.result.text)) throw Error('RESULT ' + JSON.stringify(report.result));
    report.first = report.result.first;
    // the tab shows the words without spaces between characters (the clip has to be on the timeline for that)
    await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_s',name:'语音 测试.wav',kind:'audio',src:${JSON.stringify(src)},duration:5.6});doc.clips.push({id:'c_s',kind:'audio',mediaId:'m_s',track:'A1',start:0,in:0,duration:5.6,props:{volume:1}});applyProject(doc);scheduleSave();await flushSave();renderTranscript(true);})()`);
    await wait(500);
    report.tab = await read(`(document.querySelector('[data-tr-body]')||{}).innerText||''`);
    if (!/介绍/.test(report.tab) || /[一-鿿] [一-鿿]/.test(report.tab)) throw Error('TAB ' + JSON.stringify(report.tab.slice(0, 120)));
    const external = requests.filter((r) => !/^(https?:\/\/127\.0\.0\.1:\d+\/|blob:|data:|devtools:|chrome-extension:)/.test(r.url));
    report.requests = { window: requests.length, external: external.length, mainProcess: mainRequests.length };
    ok = external.length === 0 && mainRequests.length === 0;
  } catch (e) { report.error = String((e && e.stack) || e).slice(0, 1500); }
  finally {
    fs.rmSync(usb, { recursive: true, force: true }); fs.rmSync(usb2, { recursive: true, force: true });
    try { fs.rmSync(asrDir, { recursive: true, force: true }); } catch { }   // the engine's .node may still be loaded by the server; the OS temp cleanup takes it then
    delete report.result;
    out(ok ? 'ASR_SMOKE_PASS' : 'ASR_SMOKE_FAIL', report);
    process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1);
  }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, session, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
