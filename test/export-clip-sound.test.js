'use strict';
/* MC-14 / MC-15 / MC-11 (JJ's Dev Spec, 2026-11-07, sha256 94d1468e…): a timeline that used multi-GB recordings exported with
   that clip's sound silent (−91 dB), and the export check said "Checks passed −13.6 LUFS". Exports that used a large FLAC
   (fablecut_denoise) crashed the export page and the shared engine restarted. A 16 s caption read the whole 2 h file.
   What must hold (JJ: 「结果必须正确」):
     1. the mix reads only the part of each file a clip plays — never the whole file in the page;
     2. a sound that can't be read is never silence: the export stops, says which clip (第 N 段), and leaves no file;
     3. the check looks at every clip: one silent clip under loud music is still said, the overall loudness passing or not;
     4. a crashed export page ends its own job, with a reason, and the queue takes the next one.
   Synthetic media only. */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js');
const body = (src, head) => { const i = src.indexOf(head); a.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}', i) + 2); };
const V = require('../ui-preferences');

/** The page's pure export-sound helpers, run outside the browser. */
function helpers(language = 'zh-CN') {
  const src = ['function exportAudioHeard(', 'function exportMixFailure(', 'function exportSegmentNumbers(', 'function exportClipPeak(',
    'function exportWindowShort(', 'function exportSilentSegments('].map((h) => body(app, h)).join('\n');
  a.match(app, /const EXPORT_QUIET_DB = -50;/);
  return new Function('uiText', 'EXPORT_QUIET_DB', src + '\nreturn { exportAudioHeard, exportMixFailure, exportSegmentNumbers, exportClipPeak, exportWindowShort, exportSilentSegments };')(
    (k, v) => V.t(language, k, v), -50);
}
/** A stand-in AudioBuffer: channels of Float32Array at 48 kHz. */
const buffer = (channels, rate = 48000) => ({ sampleRate: rate, numberOfChannels: channels.length, length: channels[0].length,
  duration: channels[0].length / rate, getChannelData: (i) => channels[i] });
const tone = (sec, amp, rate = 48000) => { const x = new Float32Array(Math.round(sec * rate)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * 440 * i / rate); return x; };

test('JJ\'s sentences, word for word, with the real clip number; English drafts beside them; no 解码 / buffer', () => {
  a.equal(V.t('zh-CN', 'own.export-audio-failed', { n: 3 }), '第 3 段的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(V.t('zh-CN', 'own.export-clip-silent', { n: 3 }), '第 3 段是无声的，请确认是不是你想要的。');
  a.equal(V.t('en', 'own.export-audio-failed', { n: 3 }), "The sound of clip 3 couldn't be read, so this export stopped and no file was made. The originals are unchanged.");
  a.equal(V.t('en', 'own.export-clip-silent', { n: 3 }), 'Clip 3 is silent. Please check that this is what you want.');
  for (const k of ['own.export-audio-failed', 'own.export-clip-silent', 'own.err-export-page-crashed'])
    for (const l of ['zh-CN', 'en']) a.doesNotMatch(V.t(l, k, { n: 3 }), /解码|buffer|decode|\{n\}/i, `${l} ${k}`);
  // registered like the other error texts: the code says JJ's sentence through errorText, the number filled in
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_AUDIO_FAILED', params: { n: 2 } }).text, '第 2 段的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_AUDIO_FAILED', params: { n: 2 } }).known, true);
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_PAGE_CRASHED' }).known, true);
});

test('a clip whose sound can\'t be read stops the export, with its number (第 N 段), in both languages', () => {
  for (const language of ['zh-CN', 'en']) {
    const { exportMixFailure } = helpers(language);
    const aud = { kind: 'audio', props: {} }, pic = { kind: 'video', props: { volume: 0 } };
    a.equal(exportMixFailure([{ c: aud, n: 1, buf: {} }]), null);
    const e = exportMixFailure([{ c: aud, n: 1, buf: {} }, { c: aud, n: 3, failed: new Error('audio window 422'), heard: true }, { c: pic, n: 2, failed: new Error('x'), heard: false }]);
    a.ok(e instanceof Error); a.equal(e.code, 'EXPORT_AUDIO_FAILED'); a.deepEqual(e.params, { n: 3 });
    a.equal(e.message, V.t(language, 'own.export-audio-failed', { n: 3 }));
    a.equal(exportMixFailure([{ c: pic, n: 2, failed: new Error('x'), heard: false }]), null, 'an unheard failure is not one');
  }
});

test('第 N 段 is the streamer\'s count: pieces on the timeline by where they start, a video and its stems one piece', () => {
  const { exportSegmentNumbers } = helpers();
  const clips = [
    { id: 'music', kind: 'audio', track: 'A3', start: 0, duration: 30 },
    { id: 'v2', kind: 'video', track: 'V1', start: 10, duration: 10, linkGroup: 'g2' },
    { id: 'a2', kind: 'audio', track: 'A1', start: 10, duration: 10, linkGroup: 'g2' },
    { id: 'v1', kind: 'video', track: 'V1', start: 0, duration: 10, linkGroup: 'g1' },
    { id: 'a1', kind: 'audio', track: 'A1', start: 0, duration: 10, linkGroup: 'g1' },
    { id: 'v3', kind: 'video', track: 'V1', start: 20, duration: 10 },
    { id: 'title', kind: 'text', track: 'V2', start: 0, duration: 5 },
    { id: 'late', kind: 'audio', track: 'A1', start: 40, duration: 5 },
  ];
  const n = exportSegmentNumbers(clips, 0, 30);
  a.deepEqual(Object.fromEntries(n), { v1: 1, a1: 1, music: 2, v2: 3, a2: 3, v3: 4 });
  a.equal(n.has('late'), false, 'outside the range: not counted');
});

test('a timeline with one silent clip and loud music: the silent clip is still flagged; a clip with sound is not', () => {
  const { exportClipPeak, exportSilentSegments } = helpers();
  const loud = buffer([tone(20, 0.5), tone(20, 0.5)]), quiet = buffer([new Float32Array(48000 * 12), new Float32Array(48000 * 12)]);
  a.ok(exportClipPeak(loud, 2, 5) > -7, 'the music peaks near −6 dB');
  a.equal(exportClipPeak(quiet, 1, 10), -Infinity);
  // the clip's own part only: sound before or after the part it plays does not count
  const tail = buffer([Float32Array.from({ length: 48000 * 10 }, (_, i) => (i > 48000 * 8 ? 0.5 : 0))]);
  a.equal(exportClipPeak(tail, 1, 5), -Infinity);
  const results = [
    { c: { id: 'music', kind: 'audio', props: {} }, n: 1, heard: true, buf: loud, at: 0, m0: 0, m1: 20, src: '/media/music.wav' },
    { c: { id: 'v', kind: 'video', props: { volume: 0 } }, n: 2, heard: false, buf: quiet, at: 0, m0: 1, m1: 11, src: '/media/rec.mp4' },
    { c: { id: 'a', kind: 'audio', props: {} }, n: 2, heard: true, buf: quiet, at: 0, m0: 1, m1: 11, src: '/media/rec.mp4' },
    { c: { id: 'b', kind: 'audio', props: {} }, n: 3, heard: true, buf: loud, at: 0, m0: 2, m1: 12, src: '/media/rec2.mp4' },
  ];
  a.deepEqual(exportSilentSegments(results), [{ n: 2, src: '/media/rec.mp4', at: 1, dur: 10 }]);
});

test('a read that stops short of the clip is not silence: it stops the export', () => {
  const { exportWindowShort } = helpers();
  const b = (sec) => buffer([new Float32Array(Math.round(sec * 48000))]);
  a.equal(exportWindowShort(b(21), 99.5, 120, 7200), null, 'the window covers the clip');
  a.match(exportWindowShort(b(4), 99.5, 120, 7200), /ends at 103\.50 s.*120\.00 s/, 'a window cut short');
  a.match(exportWindowShort(b(600), 0, 3300, 3600), /ends at 600\.00 s/, 'a whole-file decode that stopped part way (the old silent export)');
  a.equal(exportWindowShort(b(9.6), 290.5, 300.2, 300), null, 'a clip running to the file\'s end: the file\'s own length counts');
});

test('the export mix never decodes a whole file in the page with a server: a failed window stops the export', () => {
  const src = body(app, 'async function exportAudioSource(');
  a.match(src, /\/api\/audio-window\?src=/);
  a.doesNotMatch(src, /decoding the whole file/, 'no whole-file fallback after a failed window');
  // the whole-file decode stays only for no server (or a cross-origin file) and for one span over an hour
  const connected = src.slice(src.indexOf('if (state.connected'), src.indexOf('// no server (or a cross-origin file)'));
  a.doesNotMatch(connected.replace(/\/\/.*$/gm, ''), /getAudioBuffer\(/);
  a.match(src, /exportWindowShort\(/, 'every read is checked for covering the clip');
  const mix = body(app, 'async function renderAudioMix(');
  a.match(mix, /exportSegmentNumbers\(/); a.match(mix, /exportSilentSegments\(/);
  a.match(mix, /if \(failed && !opts\.raw\) throw failed;/, 'the mix fails before /api/export/begin: no file is written');
  // both export paths hand the silent clips to the server's check
  a.equal((app.match(/const wav = await renderAudioMix\(t0, t1, \{ silent \}\);/g) || []).length, 2);
  a.equal((app.match(/check: \{ \.\.\.exportCheckPlan\(t0, t1\), silent \}/g) || []).length, 3);
  // the check line says a silent clip in the interface language
  a.match(body(app, 'function exportCheckText('), /EXPORT_CLIP_SILENT[\s\S]*own\.export-clip-silent/);
});

test('server check: each silent clip is measured at its source — silent there too: a warning; sound there: the export fails, no file', async (t) => {
  const FF = require('../ffmpeg-path'), C = require('../export-check');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc14-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const make = (name, expr) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=12`, '-c:a', 'pcm_s16le', path.join(dir, name)]);
  make('music.wav', '0.5*sin(2*PI*440*t)'); make('quiet.wav', '0'); make('rec.wav', '0.1*sin(2*PI*660*t)');
  // the export: loud music all through (its loudness passes) — the silent clip sits under it
  const out = path.join(dir, 'out.wav'); fs.copyFileSync(path.join(dir, 'music.wav'), out);
  const resolve = (src) => path.join(dir, src.replace('/media/', ''));
  const plan = C.cleanPlan({ video: [], audio: [{ src: '/media/music.wav', at: 0, dur: 10 }], silent: [{ n: 2, src: '/media/quiet.wav', at: 1, dur: 10 }, { n: 'x' }] });
  a.deepEqual(plan.silent, [{ n: 2, src: '/media/quiet.wav', at: 1, dur: 10 }], 'cleaned');
  const r = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan, resolve, silent: false, mix: null });
  a.equal(r.ok, true, 'a clip silent in its file too is not a failure'); a.deepEqual(r.quiet, [2]); a.deepEqual(r.lost, []);
  const report = C.withQuiet({ ok: true, checks: [{ ok: true, text: '-14.0 LUFS' }], line: '-14.0 LUFS' }, r.quiet);
  a.equal(report.ok, false, 'overall loudness passing is not enough');
  a.deepEqual(report.checks[1], { ok: false, code: 'EXPORT_CLIP_SILENT', n: 2, text: 'clip 2 is silent — check that it is meant to be' });
  a.match(report.line, /⚠ clip 2 is silent/);
  // the page heard nothing where the file has sound (the MC-14 export): lost, the export fails with the clip's number
  const lostPlan = C.cleanPlan({ video: [], audio: [], silent: [{ n: 3, src: '/media/rec.wav', at: 1, dur: 10 }] });
  const r2 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan: lostPlan, resolve, silent: false, mix: null });
  a.equal(r2.ok, false); a.deepEqual(r2.lost, [3]);
  a.equal(C.failCode(r2), 'EXPORT_AUDIO_FAILED'); a.deepEqual(C.failParams(r2), { n: 3 });
  a.match(C.failText(r2), /clip 3/);
  // the server deletes that file instead of handing it over
  const server = read('server.js');
  a.match(server, /blank\.code === "EXPORT_AUDIO_FAILED"[\s\S]{0,200}fs\.unlinkSync\(o\.outPath\)/);
});

test('reading only the used span: 16 s of a 2-hour file decodes about 16 s (bytes and length), not the file', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../ffmpeg-path');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const long = path.join(dir, 'media', 'two-hours.mka');
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:r=8000:d=7200', '-c:a', 'flac', long]);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const r = await fetch(base + '/api/audio-window?src=/media/two-hours.mka&from=3600&to=3616');
  a.equal(r.status, 200);
  const bytes = (await r.arrayBuffer()).byteLength, want = 16 * 48000 * 4;   // 16 s, mono, f32
  a.ok(Math.abs(bytes - want) < 48000, `about 16 s read: ${bytes} bytes, want ${want}`);
  // the page asks for the clip's part (± AUDIO_WINDOW_PAD), on the media's own clock
  const src = body(app, 'async function exportAudioSource(');
  a.match(src, /const from = Math\.max\(0, Math\.floor\(\(m0 - AUDIO_WINDOW_PAD\) \* 1000\) \/ 1000\), to = Math\.ceil\(\(m1 \+ AUDIO_WINDOW_PAD\) \* 1000\) \/ 1000;/);
});

test('MC-11: captions for 16 s of a 2-hour file read that part only (ffmpeg -ss / -t, about 16 s out)', (t) => {
  const T = require('../transcribe.js'), FF = require('../ffmpeg-path');
  const rs = T.clipRanges([{ in: 3600, duration: 16, props: {} }], { duration: null });
  a.deepEqual(rs, [[3598.5, 3617.5]]);
  // a file whose length the project doesn't know yet is read in its clips' windows too, never whole
  const mcp = read('mcp-server.js'), plan = mcp.slice(mcp.indexOf('const rangesOf = new Map();'), mcp.indexOf('const ask = {};'));
  a.match(plan, /dur != null && !\(dur > LONG_FILE_S\)/); a.match(plan, /dur == null \|\| T\.rangeSeconds\(rs\) < dur \/ 2/);
  const { readArgs } = require('../asr-local').__test || require('../asr-local');
  const { args } = readArgs({ file: 'x', from: rs[0][0], to: rs[0][1] });
  a.equal(args[args.indexOf('-ss') + 1], '3598.5'); a.equal(args[args.indexOf('-t') + 1], '19');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc11-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const long = path.join(dir, 'two-hours.mka');
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:r=8000:d=7200', '-c:a', 'flac', long]);
  const pcm = execFileSync(FF.path('ffmpeg'), readArgs({ file: long, from: rs[0][0], to: rs[0][1] }).args, { maxBuffer: 1 << 26 });
  const sec = pcm.length / 2 / 16000;
  a.ok(Math.abs(sec - 19) < 0.1, `about 16 s and its 1.5 s pads: ${sec} s`);
});

test('MC-15: an export page that crashes ends its own job with a reason; the engine stays, the queue takes the next one', async (t) => {
  const { createExportJobs } = require('../export-jobs');
  const saved = process.env.FABLECUT_CHROME;
  process.env.FABLECUT_CHROME = process.execPath;   // "a browser" that exits at once: node refuses Chrome's flags
  t.after(() => { if (saved == null) delete process.env.FABLECUT_CHROME; else process.env.FABLECUT_CHROME = saved; });
  const jobs = createExportJobs({ url: (id) => 'http://127.0.0.1:1/?exportJob=' + id, broadcast() {}, editors: () => 0 });
  const pid = process.pid;
  const j = jobs.request({ kind: 'export', where: 'headless' });
  let v;
  for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 100)); v = jobs.get(j.id); if (v.status !== 'pending') break; }
  a.equal(v.status, 'failed'); a.equal(v.code, 'EXPORT_PAGE_CRASHED'); a.match(v.error, /exited before the export finished/);
  a.equal(process.pid, pid);
  const next = jobs.request({ kind: 'scopes', where: 'headless', time: 0 });
  a.ok(next.id && next.id !== j.id, 'the queue took the next job');
  jobs.cancel?.(next.id);
  // a stalled headless page (its renderer gone, the browser still up) says the same code
  a.match(read('export-jobs.js'), /EXPORT_PAGE_CRASHED[\s\S]{0,300}\(tab closed or browser crashed\)/);
});

test('MC-15 on Linux: the headless browser is started as the first thing the kernel kills when memory runs out, not the engine', () => {
  const { browserCommand } = require('../export-jobs');
  const lin = browserCommand('/usr/bin/chromium', ['--headless=new', 'http://x/'], 'linux');
  a.equal(lin.cmd, '/bin/sh');
  a.deepEqual(lin.args, ['-c', 'echo 1000 > /proc/self/oom_score_adj 2>/dev/null; exec "$0" "$@"', '/usr/bin/chromium', '--headless=new', 'http://x/']);
  for (const p of ['win32', 'darwin']) a.deepEqual(browserCommand('C:/b.exe', ['--x'], p), { cmd: 'C:/b.exe', args: ['--x'] });
});
