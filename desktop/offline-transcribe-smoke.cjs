'use strict';
// On-device transcription with no network (owner, 2026-11-03). Fresh profile, hidden offscreen window, the real main.js:
// its session refuses every request that is not to this computer's MontClip server. This script wraps main.js's own
// request filter so the filter still decides, and every request the window, its workers and its fetches make is logged
// with that decision. A synthetic speech file is transcribed through the app's own transcribeSrcs; the words are
// compared with the text the speech was made from (character error rate), and the time and the memory are recorded.
//   MONTCLIP_ASR_AUDIO=<wav> MONTCLIP_ASR_TEXT=<utf-8 text> MONTCLIP_ASR_MODEL=base|small MONTCLIP_ASR_LANG=zh|en
//   MONTCLIP_ASR_OUT=<result.json> electron desktop/offline-transcribe-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// The bundled files: MONTCLIP_TRANSCRIBE_DIR, else vendor/transcribe (desktop/fetch-transcribe.cjs).
// Prints ASR_PASS / ASR_FAIL. Passes when words came back and no request left this computer.
const electron = require('electron'), { app, BrowserWindow, session } = electron, fs = require('node:fs'), path = require('node:path');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const E = process.env, AUDIO = E.MONTCLIP_ASR_AUDIO, TEXT = E.MONTCLIP_ASR_TEXT, MODEL = E.MONTCLIP_ASR_MODEL || 'base', LANG = E.MONTCLIP_ASR_LANG || 'zh', OUT = E.MONTCLIP_ASR_OUT;
if (!AUDIO || !TEXT || !OUT) throw Error('MONTCLIP_ASR_AUDIO, MONTCLIP_ASR_TEXT and MONTCLIP_ASR_OUT are required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');

// every request, with what main.js's filter decided
const requests = [];
const fromPartition = session.fromPartition.bind(session);
session.fromPartition = (...args) => {
  const ses = fromPartition(...args), wr = ses.webRequest, on = wr.onBeforeRequest.bind(wr);
  wr.onBeforeRequest = (filterOrListener, maybe) => {
    const listener = typeof filterOrListener === 'function' ? filterOrListener : maybe;
    const wrapped = (details, callback) => listener(details, (res) => {
      requests.push({ url: details.url.slice(0, 200), type: details.resourceType, cancelled: !!(res && res.cancel) });
      callback(res);
    });
    return typeof filterOrListener === 'function' ? on(wrapped) : on(filterOrListener, wrapped);
  };
  return ses;
};

/** Character error rate: edit distance over the reference length, on letters, digits and CJK characters only. */
function cer(ref, hyp) {
  const norm = (s) => Array.from(String(s).toLowerCase().normalize('NFKC')).filter((c) => /[\p{L}\p{N}]/u.test(c));
  const r = norm(ref), h = norm(hyp);
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return { cer: r.length ? prev[h.length] / r.length : 0, refChars: r.length, hypChars: h.length, edits: prev[h.length] };
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s);
  let ok = false, peak = { privateMB: 0, workingSetMB: 0 };
  const sample = () => { let p = 0, w = 0; for (const m of app.getAppMetrics()) { p += (m.memory.privateBytes || 0) / 1024; w += (m.memory.workingSetSize || 0) / 1024; }
    peak = { privateMB: Math.max(peak.privateMB, Math.round(p)), workingSetMB: Math.max(peak.workingSetMB, Math.round(w)) }; };
  const timer = setInterval(sample, 1000);
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    const media = path.join(profile, 'workspace', 'media'); fs.mkdirSync(media, { recursive: true });
    const name = 'speech' + path.extname(AUDIO); fs.copyFileSync(AUDIO, path.join(media, name));
    sample();
    const before = { ...peak };
    const res = await read(`(async () => {
      const t0 = performance.now();
      const r = await transcribeSrcs(['/media/${name}'], { model: ${JSON.stringify(MODEL)}, language: ${JSON.stringify(LANG)} });
      const t = await loadTranscript('/media/${name}', true);
      return { ms: Math.round(performance.now() - t0), done: r.done.length, failed: r.failed, words: (t && t.words) || [], duration: t && t.duration };
    })()`);
    sample();
    const text = res.words.map((w) => w[0]).join(LANG === 'zh' ? '' : ' ');
    const score = cer(fs.readFileSync(TEXT, 'utf8'), text);
    const external = requests.filter((r) => !/^(https?:\/\/127\.0\.0\.1:\d+\/|blob:|data:|devtools:|chrome-extension:)/.test(r.url));
    const record = { model: MODEL, language: LANG, audioSeconds: res.duration, transcribeMs: res.ms,
      secondsPerAudioHour: res.duration ? Math.round(res.ms / 1000 / res.duration * 3600) : null,
      ...score, words: res.words.length, failed: res.failed, memoryAtStartMB: before, memoryPeakMB: peak,
      requests: { total: requests.length, external: external.length, externalSample: external.slice(0, 5),
        assets: requests.filter((r) => r.url.includes('/transcribe-assets/')).map((r) => r.url.replace(/^https?:\/\/[^/]+/, '')).filter((u, i, a) => a.indexOf(u) === i) },
      textSample: text.slice(0, 200) };
    fs.writeFileSync(OUT, JSON.stringify(record, null, 2) + '\n');
    ok = res.done === 1 && res.words.length > 0 && external.length === 0;
    out(ok ? 'ASR_PASS' : 'ASR_FAIL', { model: MODEL, cer: Math.round(score.cer * 1000) / 10, transcribeMs: res.ms, audioSeconds: res.duration, memoryPeakMB: peak, requests: record.requests.total, external: external.length });
  } catch (e) { out('ASR_FAIL', { error: String(e && e.message || e), external: requests.filter((r) => !/127\.0\.0\.1/.test(r.url)).slice(0, 5) }); }
  finally { clearInterval(timer); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, session, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
