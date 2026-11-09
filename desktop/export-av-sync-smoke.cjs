'use strict';
// Deja (#67): the export audio is now streamed to disk (bodyToFile) instead of read into memory; prove picture and sound
// still line up. Fresh profile, hidden offscreen window. A synthetic flash/beep source (black, one white frame and a 20 ms
// 1 kHz beep at the same instant every 0.5 s from 0.2 s; the same filters as #36's make-flash-beep.cjs) goes on V1
// (muted) and its sound on A1, whole, and is exported with fastExport (master, MONTCLIP_AV_ENCODER, default h264_mf).
// Every flash is paired with its beep by desktop/av-sync-measure.cjs (≤ 40 ms), and each flash must sit within a frame of
// where the source has it — the last ones included, so a drift towards the end shows.
//   MONTCLIP_AV_OUT=<folder> [MONTCLIP_AV_SECONDS=10|600] [MONTCLIP_AV_BACKGROUND=1: the background export, #263] electron desktop/export-av-sync-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// ffmpeg: MONTCLIP_FFMPEG_DIR (MontClip's own build). Prints AV_EXPORT_PASS / AV_EXPORT_FAIL and writes <out>/av-export-<s>s.json.
const electron = require('electron'), { app, BrowserWindow } = electron, fs = require('node:fs'), path = require('node:path');
const cp = require('node:child_process'), crypto = require('node:crypto'), os = require('node:os');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const outDir = process.env.MONTCLIP_AV_OUT;
if (!outDir || !path.isAbsolute(outDir)) throw Error('MONTCLIP_AV_OUT (an absolute folder) is required');
const SECONDS = Math.max(2, Number(process.env.MONTCLIP_AV_SECONDS) || 10), FPS = 30, FIRST = 6, EVERY = 15;
const ENCODER = process.env.MONTCLIP_AV_ENCODER || 'h264_mf';
const Measure = require('./av-sync-measure.cjs');
const ffmpeg = require('../ffmpeg-path').path('ffmpeg');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const events = () => { const e = []; for (let n = FIRST; n < SECONDS * FPS; n += EVERY) e.push(Math.round(n / FPS * 1e6) / 1e6); return e; };

function source() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-avx-')), file = path.join(dir, 'flash-beep.mp4');
  const t0 = FIRST / FPS, period = EVERY / FPS;
  const video = `color=c=black:size=320x180:rate=${FPS}:duration=${SECONDS},format=yuv420p,` +
    `drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,${FIRST})*eq(mod(n-${FIRST}\\,${EVERY})\\,0)'`;
  const audio = `aevalsrc=exprs='gte(t\\,${t0})*lt(mod(t-${t0}\\,${period})\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=${SECONDS}`;
  cp.execFileSync(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-n', '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', ENCODER, '-b:v', '400k', '-g', String(FPS), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '1', '-ar', '48000', '-movflags', '+faststart', file], { windowsHide: true, timeout: 20 * 60 * 1000 });
  return { dir, file };
}

async function exercise({ b64Path, seconds, encoder, background }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200 && !runtime.projectId; i++) await wait(50);
  const bin = await (await fetch(b64Path)).arrayBuffer();
  const up = await fetch('/api/upload?name=' + encodeURIComponent('flash-beep.mp4'), { method: 'POST', body: new Blob([bin]) });
  if (!up.ok) throw Error('upload ' + up.status);
  const { src } = await up.json();
  const doc = projectJSON();
  Object.assign(doc, { name: 'AV export', width: 320, height: 180, fps: 30,
    media: [{ id: 'fb', src, kind: 'video', name: 'flash-beep.mp4', duration: seconds, width: 320, height: 180 }],
    clips: [{ id: 'v', kind: 'video', mediaId: 'fb', track: 'V1', start: 0, in: 0, duration: seconds, props: { volume: 0 } },
      { id: 'a', kind: 'audio', mediaId: 'fb', track: 'A1', start: 0, in: 0, duration: seconds, props: { volume: 1 } }] });
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw Error('save failed');
  setTime(0); await fetchEncodeProfiles();
  const t = performance.now();
  let r;
  if (background) {   // MONTCLIP_AV_BACKGROUND=1: the background export (#263), its hidden page and its copy of the timeline
    saveDownload = () => { };
    const j = startBgExport({ delivery: normalizeDelivery({ preset: 'master', video: { codec: 'h264', encoder } }).spec });
    if (!j) throw Error('background export did not start');
    while (bgExportBusy()) await wait(100);
    const q = j.q;
    r = q.status === 'done' ? { outputs: [{ ok: true, src: q.src, report: q.report }] } : { error: q.error || q.status };
  } else r = await fastExport({ silent: true, delivery: { preset: 'master', video: { codec: 'h264', encoder } } });
  if (!r || !r.outputs || r.outputs.some((o) => !o.ok)) throw Error('export failed: ' + JSON.stringify(r));
  return { src: r.outputs[0].src, report: r.outputs[0].report && r.outputs[0].report.line, ms: Math.round(performance.now() - t) };
}

const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s);
  let made = null, pass = false;
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
    made = source();
    // the page fetches the source from the server's media folder (no base64 through executeJavaScript for long sources)
    const media = path.join(profile, 'workspace', 'media'); fs.mkdirSync(media, { recursive: true });
    fs.copyFileSync(made.file, path.join(media, 'source-flash-beep.mp4'));
    const res = await read(`(${exercise.toString()})(${JSON.stringify({ b64Path: '/media/source-flash-beep.mp4', seconds: SECONDS, encoder: ENCODER, background: process.env.MONTCLIP_AV_BACKGROUND === '1' })})`);
    const file = path.join(profile, 'workspace', 'exports', decodeURIComponent(res.src.replace(/^\/exports\//, '')));
    const m = Measure.measure(file, { ffmpeg, limit: 0.04, expect: events() });
    const last = m.placement.slice(-3).map((p) => ({ expected: p.expected, errorMs: p.error == null ? null : Math.round(p.error * 1e4) / 10 }));
    const tail = m.pairs.slice(-3).map((p) => Math.round(Math.abs(p.offset) * 1e4) / 10);
    const record = { seconds: SECONDS, encoder: ENCODER, source: { sha256: crypto.createHash('sha256').update(fs.readFileSync(made.file)).digest('hex'), bytes: fs.statSync(made.file).size },
      export: { bytes: fs.statSync(file).size, report: res.report, ms: res.ms },
      ffmpeg: cp.spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8', windowsHide: true }).stdout.split(/\r?\n/)[0],
      pairs: m.pairs.length, events: events().length, worstMs: Math.round(m.worst * 1e4) / 10, placementOk: m.placementOk, unpaired: m.unpaired, lastPlacement: last, lastPairsMs: tail, ok: m.ok };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `av-export-${SECONDS}s.json`), JSON.stringify(record, null, 2) + '\n');
    pass = m.ok;
    out(pass ? 'AV_EXPORT_PASS' : 'AV_EXPORT_FAIL', { seconds: SECONDS, pairs: m.pairs.length, events: record.events, worstMs: record.worstMs, placementOk: m.placementOk, lastPlacement: last });
  } catch (e) { out('AV_EXPORT_FAIL', { error: String(e && e.message || e) }); }
  finally {
    if (made) try { fs.rmSync(made.dir, { recursive: true, force: true }); } catch {}
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
