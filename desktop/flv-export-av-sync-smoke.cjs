'use strict';
// QQ on #130 (ea1c84d9, the A/V sync red line): an FLV with breaks must export with picture and sound together. The
// export reads sound with decodeAudioData, which puts the decoded samples back to back; a hole left in the imported MP4
// would make the sound after it come early (QQ: ~245 ms at the end of typical-live, 2 s after G-gap2.000s).
// Fresh profile, hidden offscreen window. Each synthetic FLV (test/flv-fixtures.js, cut out of Rea's C0-clean.flv: a
// flash and a 100 ms 1 kHz beep at 2, 7, … 57 s) is imported the way the page does it — POST /api/upload, and on
// FLV_TIMELINE_GAP the 〔帮我转〕 request /api/prepare-media {fixGaps, acceptReadable, allowTranscode} — then put whole
// on V1 (muted) and A1 and exported with fastExport (master, MONTCLIP_AV_ENCODER, default h264_mf). Every flash in the
// export is paired with its beep (desktop/av-sync-measure.cjs). Limits (QQ's review, point 1; Deja 2026-11-05 00:16):
// each pair ≤ 40 ms — reported at the start, around 32 s, around 52 s and at the end — and the export's length within
// 0.1 s of the original's (QQ's point 2: ±1 frame).
//   MONTCLIP_AV_OUT=<folder> [MONTCLIP_AV_WHOLE=1] electron desktop/flv-export-av-sync-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// ffmpeg: MONTCLIP_FFMPEG_DIR or vendor/ (MontClip's own build). Prints FLV_EXPORT_AV_PASS / FLV_EXPORT_AV_FAIL and
// writes <out>/flv-export-av.json.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), os = require('node:os');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const outDir = process.env.MONTCLIP_AV_OUT;
if (!outDir || !path.isAbsolute(outDir)) throw Error('MONTCLIP_AV_OUT (an absolute folder) is required');
const ENCODER = process.env.MONTCLIP_AV_ENCODER || 'h264_mf', LIMIT = 0.04, LENGTH = 0.1;
// MONTCLIP_AV_WHOLE=1: the export's fallback — /api/audio-window refused, so the mix decodes the whole imported file with
// decodeAudioData (exportAudioSource), the reading QQ's review is about; also what the waveform and the analyses read.
const WHOLE = process.env.MONTCLIP_AV_WHOLE === '1';
const Measure = require('./av-sync-measure.cjs');
const FF = require('../server/ffmpeg-path'), ffmpeg = FF.path('ffmpeg');
const { make, CLEAN, LIVE, withSound } = require('../test/flv-fixtures');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const CASES = [
  { name: 'G-gap2.000s.flv', rea: true },
  { name: 'typical-live.flv', edits: LIVE },
  { name: 'video-starts-58ms-late.flv', edits: [['lead', { to: 58 }]] },
  { name: 'video-starts-92ms-late.flv', edits: [['lead', { to: 92 }]] },
  { name: 'audio-starts-93ms-late.flv', edits: [['late', { before: 100 }]] },
  // H.264 + MP3, as VV's five real recordings (the sound re-encoded with libmp3lame; holes kept)
  { name: 'G-gap2.000s-mp3.flv', from: 'G-gap2.000s.flv', mp3: true },
  { name: 'typical-live-mp3.flv', edits: LIVE, mp3: true },
];
const duration = (file) => Number(cp.execFileSync(FF.path('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', windowsHide: true }).trim());

async function exercise({ name, encoder, whole }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (whole && !window.__wholeOnly) { const f = window.fetch; window.__wholeOnly = true;
    window.fetch = (u, ...rest) => (String(u).startsWith('/api/audio-window') ? Promise.resolve(new Response('', { status: 503 })) : f(u, ...rest)); }
  for (let i = 0; i < 200 && !runtime.projectId; i++) await wait(50);
  // the page's own import: upload; a refusal for a break is answered with 〔帮我转〕
  const bin = await (await fetch('/media/source-' + encodeURIComponent(name))).arrayBuffer();
  let res = await fetch('/api/upload?name=' + encodeURIComponent(name), { method: 'POST', body: new Blob([bin]) });
  let body = await res.json(), asked = null;
  if (!res.ok) {
    asked = body.code;
    if (body.code !== 'FLV_TIMELINE_GAP') throw Error('upload ' + res.status + ' ' + body.code);
    res = await fetch('/api/prepare-media', { method: 'POST', body: JSON.stringify({ src: body.originalSrc, fixGaps: true, acceptReadable: true, allowTranscode: true }) });
    body = await res.json();
    if (!res.ok) throw Error('prepare ' + res.status + ' ' + body.code);
  }
  const m = { id: 'fb', src: body.src, kind: 'video', name, originalSrc: body.originalSrc, preparation: body.preparation };
  await loadMediaMetadata(m);
  const doc = projectJSON();
  Object.assign(doc, { name: 'FLV AV export', width: m.width || 320, height: m.height || 180, fps: 30, media: [m],
    clips: [{ id: 'v', kind: 'video', mediaId: 'fb', track: 'V1', start: 0, in: 0, duration: m.duration, props: { volume: 0 } },
      { id: 'a', kind: 'audio', mediaId: 'fb', track: 'A1', start: 0, in: 0, duration: m.duration, props: { volume: 1 } }] });
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw Error('save failed');
  setTime(0); await fetchEncodeProfiles();
  const r = await fastExport({ silent: true, delivery: { preset: 'master', video: { codec: 'h264', encoder } } });
  if (!r || !r.outputs || r.outputs.some((o) => !o.ok)) throw Error('export failed: ' + JSON.stringify(r));
  return { src: r.outputs[0].src, imported: body.src, asked, preparation: body.preparation, audio: body.audio, mediaDuration: m.duration };
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-flvav-')), records = [];
  let pass = false;
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    const media = path.join(profile, 'workspace', 'media'); fs.mkdirSync(media, { recursive: true });
    for (const c of CASES) {
      const base = c.rea || c.from ? path.join(path.dirname(CLEAN), c.from || c.name) : make(tmp, c.mp3 ? 'aac-' + c.name : c.name, c.edits).file;
      const file = c.mp3 ? withSound(base, path.join(tmp, c.name)) : base;
      fs.copyFileSync(file, path.join(media, 'source-' + c.name));
      const res = await read(`(${exercise.toString()})(${JSON.stringify({ name: c.name, encoder: ENCODER, whole: WHOLE })})`);
      const exported = path.join(profile, 'workspace', 'exports', decodeURIComponent(res.src.replace(/^\/exports\//, '')));
      // Rea's beep peaks at −18 dBFS (0.13), under av-sync-measure's default onset level: 0.05 (−26 dBFS) here
      const d = Measure.decode(ffmpeg, exported);
      const m = Measure.pair(Measure.flashTimes(d.luma, d.fps).map((t) => t + d.videoStart), Measure.beepOnsets(d.samples, d.rate, 0.05), LIMIT);
      const near = (t) => m.pairs.reduce((b, p) => (!b || Math.abs(p.flash - t) < Math.abs(b.flash - t) ? p : b), null);
      const at = (p) => p && { flash: Math.round(p.flash * 1000) / 1000, offsetMs: Math.round(p.offset * 1e4) / 10 };
      const lengthDiff = Math.abs(duration(exported) - duration(file));
      const ok = m.ok && lengthDiff <= LENGTH;
      records.push({ name: c.name, asked: res.asked, preparation: res.preparation, audio: res.audio, pairs: m.pairs.length,
        unpaired: m.unpaired, worstMs: Math.round(m.worst * 1e4) / 10,
        start: at(m.pairs[0]), at32: at(near(32)), at52: at(near(52)), end: at(m.pairs.at(-1)),
        lengthDiffS: Math.round(lengthDiff * 1000) / 1000, ok });
      out(ok ? 'FLV_EXPORT_AV_CASE_PASS' : 'FLV_EXPORT_AV_CASE_FAIL', records.at(-1));
    }
    pass = records.every((r) => r.ok);
    const ver = cp.spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout.split(/\r?\n/)[0];
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, WHOLE ? 'flv-export-av-whole.json' : 'flv-export-av.json'), JSON.stringify({ encoder: ENCODER, ffmpeg: ver, wholeFileDecode: WHOLE, limitMs: LIMIT * 1000, lengthLimitS: LENGTH, cases: records }, null, 2) + '\n');
    out(pass ? 'FLV_EXPORT_AV_PASS' : 'FLV_EXPORT_AV_FAIL', { cases: records.length, failed: records.filter((r) => !r.ok).map((r) => r.name) });
  } catch (e) { out('FLV_EXPORT_AV_FAIL', { error: String(e && e.message || e) }); }
  finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    process.exitCode = pass ? 0 : 1;
    app.exit(pass ? 0 : 1);   // main.js's before-quit stops the service with it
  }
  await new Promise(() => {});   // main.js's own smoke steps must not run
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; }
  return load.call(this, id, ...args); }; }
require('./main');
