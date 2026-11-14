'use strict';
// #285: isolated real compositor export, not a Cindy-window acceptance test.
// MONTCLIP_ROLL_OUT=<absolute fresh folder> MONTCLIP_FFMPEG_DIR=<existing build>
// electron desktop/roll-av-smoke.cjs --montclip-smoke --user-data-dir=<fresh profile>
// Optional MONTCLIP_ROLL_LIMIT limits cases for harness debugging, reported in receipt.
const electron = require('electron'), { app, BrowserWindow } = electron;
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const Measure = require('./av-sync-measure.cjs');
const ffmpeg = require('../ffmpeg-path').path('ffmpeg');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length).trim();
const outDir = process.env.MONTCLIP_ROLL_OUT, encoder = process.env.MONTCLIP_AV_ENCODER || 'h264_mf';
if (!process.argv.includes('--montclip-smoke') || !profile || !path.isAbsolute(profile) || !outDir || !path.isAbsolute(outDir))
  throw Error('Explicit smoke, fresh absolute profile and MONTCLIP_ROLL_OUT required');
if (fs.existsSync(path.join(profile, 'workspace'))) throw Error('Profile already contains a workspace; use a fresh profile');
fs.mkdirSync(outDir, { recursive: true });
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const record = { platform: process.platform, mode: 'hidden Electron source smoke (not Cindy)', fps: 25, sourceSeconds: 60,
  head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
  files: Object.fromEntries(['edit-ops.js', 'project-ops.js', 'app.js'].map(f => [f, sha(path.join(__dirname, '..', f))])),
  sources: [], cases: [], ok: false };
const save = () => fs.writeFileSync(path.join(outDir, 'roll-av.json'), JSON.stringify(record, null, 2) + '\n');
function run(args, options = {}) {
  const r = cp.spawnSync(ffmpeg, ['-hide_banner', '-nostdin', ...args], { windowsHide: true, maxBuffer: 1 << 28, timeout: 180000, ...options });
  if (r.status !== 0) throw Error(String(r.stderr || r.error).slice(-2000));
  return r;
}
function source(mediaDir, id) {
  const file = path.join(mediaDir, `${id}.mp4`);
  const video = `color=c=${id === 'A' ? 'black' : '0x001020'}:size=320x180:rate=25:duration=60,format=yuv420p,` +
    "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='eq(mod(n-5\\,25)\\,0)'," +
    "drawtext=fontfile='C\\:/Windows/Fonts/consola.ttf':text='%{n}':x=10:y=140:fontsize=24:fontcolor=gray";
  const audio = "aevalsrc=exprs='0.08*sin(2*PI*440*t)+0.65*gte(t\\,0.2)*lt(mod(t-0.2\\,1)\\,0.02)*sin(2*PI*1000*t)':s=48000:d=60";
  const args = ['-loglevel', 'error', '-n', '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', encoder, '-b:v', '700k', '-g', '25', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-ar', '48000', '-movflags', '+faststart', file];
  run(args); record.sources.push({ id, sha256: sha(file), bytes: fs.statSync(file).size, args }); save();
}
async function exercise({ replacement, side, delta, encoder, reviewFps, offset }) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 300 && !state.connected; i++) await wait(50);
  if (!state.connected) throw Error('NOT_CONNECTED');
  const doc = projectJSON();
  Object.assign(doc, { name: `roll-${replacement}-${side}-${delta}`, width: 320, height: 180, fps: 25,
    media: ['A', 'B'].map(id => ({ id, kind: 'video', name: id + '.mp4', src: '/media/' + id + '.mp4',
      duration: 60, width: 320, height: 180, audioChannels: 2 })), clips: [] });
  for (const [tag, start] of [['before', 0], ['after', 30]]) for (const [ch, track] of ['V1', 'A1', 'A2'].entries())
    doc.clips.push({ id: `${tag}-${track}`, kind: ch ? 'audio' : 'video', mediaId: 'A', track,
      start, in: start, duration: 30, linkGroup: tag, props: ch ? { volume: 1, audioChannel: ch - 1, pan: ch === 1 ? -1 : 1 } : { volume: 0 } });
  for (const tag of ['before', 'after']) if (replacement === tag || replacement === 'both')
    doc.clips.find(c => c.id === `${tag}-V1`).mediaId = 'B';
  if (reviewFps) {
    doc.fps = reviewFps;
    doc.clips = doc.clips.filter(c => c.start === 0);
    for (const c of doc.clips) { c.mediaId = 'A'; c.duration = 60; }
    MontClipEdit.forDoc(doc).splitAt(30 + 1 / reviewFps);
    for (const c of doc.clips) {
      c.id = `${c.start === 0 ? 'before' : 'after'}-${c.track}`;
      if (c.kind === 'video' && c.start === 0 && replacement !== 'none') c.mediaId = 'B';
    }
  }
  if (offset) {
    doc.media.find(m => m.id === 'B').duration = 35;
    for (const c of doc.clips) {
      c.start /= 2; c.duration = 15; c.in = c.start + 30;
      if (c.mediaId === 'B') c.in = 0;
    }
  }
  // A saved synthetic document with recorded companions; the updateClip entry
  // that records these links is exercised separately in the patch/MCP tests.
  applyProject(doc); scheduleSave(); if (!await flushSave()) throw Error('base save failed');
  const geometry = () => project.clips.map(c => ({ id: c.id, mediaId: c.mediaId, start: c.start, in: c.in, duration: c.duration }));
  const before = geometry(); pushUndo();
  const id = `${side === 'out' ? 'before' : 'after'}-V1`;
  const deltas = reviewFps ? [0, 1 / reviewFps, 1 / reviewFps, -1 / reviewFps] :
    offset ? [0, .1, -.1, .1] : [delta];
  for (const d of deltas) {
    const applied = rollEdit(getClip(id), side, d);
    if (typeof applied !== 'number' || Math.abs(applied - d) > 1e-6) throw Error('roll refused/clamped: ' + applied);
  }
  const after = geometry();
  const check = rows => {
    for (const track of ['V1', 'A1', 'A2']) {
      const l = rows.find(c => c.id === `before-${track}`), r = rows.find(c => c.id === `after-${track}`);
      if (reviewFps || offset) {
        if (Math.abs(l.start + l.duration - r.start) > .00015 ||
            (track !== 'V1' && Math.abs(r.in - l.in - l.duration) > .00015) ||
            Math.abs(r.start + r.duration - (offset ? 30 : 60)) > .00015)
          throw Error('review geometry ' + track);
        continue;
      }
      if (Math.abs(l.duration - 30 - delta) > 1e-6 || Math.abs(r.start - 30 - delta) > 1e-6 ||
          Math.abs(r.in - l.in - l.duration) > 1e-6 || Math.abs(r.start + r.duration - 60) > 1e-6)
        throw Error('geometry ' + track);
    }
  };
  check(after); undo();
  if (JSON.stringify(geometry()) !== JSON.stringify(before)) throw Error('undo geometry');
  if (!await flushSave()) throw Error('undo save failed');
  const undone = await (await fetch('/api/project')).json();
  const readGeometry = rows => rows.map(c => ({ id: c.id, mediaId: c.mediaId, start: c.start, in: c.in, duration: c.duration }));
  if (JSON.stringify(readGeometry(undone.clips)) !== JSON.stringify(before)) throw Error('undo disk readback');
  redo(); if (JSON.stringify(geometry()) !== JSON.stringify(after)) throw Error('redo geometry');
  scheduleSave(); if (!await flushSave()) throw Error('roll save failed');
  const saved = await (await fetch('/api/project')).json();
  check(saved.clips);
  const cut = after.find(c => c.id === 'after-V1').start;
  const start = cut - 3, end = cut + 3;
  exportRangeForced = { start, end };
  await fetchEncodeProfiles();
  let result;
  try { result = await fastExport({ silent: true, delivery: { preset: 'master', fps: 25, video: { codec: 'h264', encoder } } }); }
  finally { exportRangeForced = null; }
  if (!result?.outputs?.length || result.outputs.some(o => !o.ok)) throw Error('export: ' + JSON.stringify(result));
  return { replacement, side, delta, reviewFps, offset, deltas, start, end, sourceStart: start + (offset ? 30 : 0), before, after, undoRedo: true, savedReadback: true,
    src: result.outputs[0].src, report: result.outputs[0].report?.line };
}
function measure(file, start, review = false) {
  const expected = Array.from({ length: 60 }, (_, i) => i + .2).filter(t => t >= start && t < start + 6).map(t => t - start);
  const decoded = Measure.decode(ffmpeg, file), flashes = Measure.flashTimes(decoded.luma, 25);
  const channels = [];
  for (const channel of [0, 1]) {
    const filter = `pan=mono|c0=c${channel}`;
    const silence = run(['-i', file, '-af', filter + ',silencedetect=noise=-60dB:d=0.02', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const pcm = run(['-loglevel', 'error', '-i', file, '-af', filter, '-ar', '48000', '-f', 'f32le', '-']).stdout;
    const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
    const beeps = Measure.beepOnsets(samples, 48000, .25, .1);
    const paired = Measure.pair(flashes, beeps, 1 / 25);
    const placement = expected.map(t => ({ expected: t, error: beeps.length ? Math.min(...beeps.map(b => Math.abs(b - t))) : null }));
    const intervals = beeps.slice(1).map((b, i) => b - beeps[i]);
    // Review mode exercises existing four-decimal split/trim quantization.
    // Keep its measured drift visible; mixed outputs must additionally match
    // the unchanged-source control PCM exactly. The original 64-case gate stays.
    const intervalLimit = (review ? .00015 : 1e-6) + 1 / 48000;
    const ok = !/silence_start:/.test(silence) && beeps.length === expected.length && paired.ok &&
      placement.every(p => p.error !== null && p.error <= 1 / 25) && intervals.every(t => Math.abs(t - 1) <= intervalLimit);
    channels.push({ channel: channel ? 'R' : 'L', pcmSha256: crypto.createHash('sha256').update(pcm).digest('hex'),
      silence: /silence_start:/.test(silence), beeps, intervals, intervalLimit, placement,
      syncWorst: paired.worst, unpaired: paired.unpaired, ok });
  }
  return { flashes, expected, frames: decoded.luma.length, channels, ok: channels.every(c => c.ok) && decoded.luma.length === 150 };
}
const loadURL = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await loadURL.apply(this, args); const win = this;
  try {
    const mediaDir = path.join(profile, 'workspace', 'media'); fs.mkdirSync(mediaDir, { recursive: true });
    source(mediaDir, 'A'); source(mediaDir, 'B');
    const cases = [], review = process.env.MONTCLIP_ROLL_REVIEW === '1';
    if (review) {
      record.reviewMode = 'quantized split / independent source In; 25fps export controls';
      for (const reviewFps of [30, 60, 29.97]) for (const replacement of ['none', 'before'])
        cases.push({ replacement, side: 'out', reviewFps, encoder });
      for (const replacement of ['none', 'before']) cases.push({ replacement, side: 'in', offset: true, encoder });
    } else for (const side of ['out', 'in']) for (const delta of [-2, -.5, -.1, -.04, .04, .1, .5, 2])
      for (const replacement of ['none', 'before', 'after', 'both']) cases.push({ replacement, side, delta, encoder });
    const limit = Number(process.env.MONTCLIP_ROLL_LIMIT) || cases.length; record.planned = cases.length; record.limit = limit;
    const controls = new Map();
    for (const item of cases.slice(0, limit)) {
      const result = await win.webContents.executeJavaScript(`(${exercise.toString()})(${JSON.stringify(item)})`);
      const file = path.join(profile, 'workspace', 'exports', decodeURIComponent(result.src.replace(/^\/exports\//, '')));
      const measured = measure(file, result.sourceStart, review);
      const key = `${item.side}/${item.delta}/${item.reviewFps}/${item.offset}`;
      if (item.replacement === 'none') controls.set(key, measured.channels.map(c => c.pcmSha256));
      else {
        measured.sameSamplesAsControl = measured.channels.every((c, i) => c.pcmSha256 === controls.get(key)?.[i]);
        measured.ok = measured.ok && measured.sameSamplesAsControl;
      }
      record.cases.push({ ...result, sha256: sha(file), measured }); save();
      process.stdout.write('ROLL_AV_CASE ' + JSON.stringify({ ...item, ok: measured.ok, count: record.cases.length }) + '\n');
      if (!measured.ok) throw Error('measurement failed (see roll-av.json)');
    }
    record.ok = record.cases.length === cases.length && record.cases.every(c => c.measured.ok);
  } catch (error) { record.error = String(error.stack || error); }
  finally { save(); process.stdout.write('ROLL_AV_RESULT ' + JSON.stringify({ ok: record.ok, cases: record.cases.length, error: record.error }) + '\n'); app.exit(record.ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) {
  if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow {
    constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); }
  } }; }
  return load.call(this, id, ...args);
}; }
require('./main');
