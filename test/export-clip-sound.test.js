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
const app = read('app/app.js');
const body = (src, head) => { const i = src.indexOf(head); a.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}', i) + 2); };
const V = require('../shared/ui-preferences');

/** The page's pure export-sound helpers, run outside the browser. */
function helpers(language = 'zh-CN') {
  const src = ['function exportAudioHeard(', 'function exportMixFailure(', 'function exportSegmentNumbers(', 'function exportClipPeak(',
    'function exportWindowShort(', 'function exportSilentSegments(', 'function exportClipWords('].map((h) => body(app, h)).join('\n');
  a.match(app, /const EXPORT_QUIET_DB = -50;/);
  return new Function('uiText', 'EXPORT_QUIET_DB', 'mcView', 'MontClipAutoSlices', src + '\nreturn { exportAudioHeard, exportMixFailure, exportSegmentNumbers, exportClipPeak, exportWindowShort, exportSilentSegments, exportClipWords };')(
    (k, v) => V.t(language, k, v), -50, { get: () => ({ language }) }, require('../shared/auto-slices'));
}
/** A stand-in AudioBuffer: channels of Float32Array at 48 kHz. */
const buffer = (channels, rate = 48000) => ({ sampleRate: rate, numberOfChannels: channels.length, length: channels[0].length,
  duration: channels[0].length / rate, getChannelData: (i) => channels[i] });
const tone = (sec, amp, rate = 48000) => { const x = new Float32Array(Math.round(sec * rate)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * 440 * i / rate); return x; };

/* JJ 定稿 (#231 issuecomment-6714366423), word for word, punctuation included: a piece with a picture by its number and
   its time on the timeline; a sound clip on its own (music, a voice-over) by its time only (the -track sentences). */
test('JJ\'s final sentences, word for word: number and time for a piece with a picture, time only for a sound on its own', () => {
  const zh = (k, v) => V.t('zh-CN', k, v), en = (k, v) => V.t('en', k, v), v = { n: 3, time: '1:12:04' };
  a.equal(zh('own.export-audio-failed', v), '第 3 段（时间线 1:12:04 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(zh('own.export-audio-failed-track', v), '时间线 1:12:04 处的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(zh('own.export-clip-silent', v), '第 3 段（时间线 1:12:04 处）是无声的，请确认是不是你想要的。');
  a.equal(zh('own.export-clip-silent-track', v), '时间线 1:12:04 处的声音是无声的，请确认是不是你想要的。');
  a.equal(en('own.export-audio-failed', v), "The sound of clip 3 (at 1:12:04 on the timeline) couldn't be read, so this export stopped and no file was made. The originals are unchanged.");
  a.equal(en('own.export-audio-failed-track', v), "The sound at 1:12:04 on the timeline couldn't be read, so this export stopped and no file was made. The originals are unchanged.");
  a.equal(en('own.export-clip-silent', v), 'Clip 3 (at 1:12:04 on the timeline) is silent. Please check that this is what you want.');
  a.equal(en('own.export-clip-silent-track', v), 'The sound at 1:12:04 on the timeline is silent. Please check that this is what you want.');
  a.equal(zh('own.err-export-page-crashed'), '导出时出了意外，这次导出已停下，没有生成文件。原片没有改动。可以直接重新导出；还是这样的话，点「复制问题信息」发给我们。');
  a.equal(en('own.err-export-page-crashed'), 'Something went wrong while exporting, so this export stopped and no file was made. The originals are unchanged. You can start the export again; if it happens again, use "Copy problem details" and send it to us.');
  for (const k of ['own.export-audio-failed', 'own.export-audio-failed-track', 'own.export-clip-silent', 'own.export-clip-silent-track', 'own.err-export-page-crashed'])
    for (const l of ['zh-CN', 'en']) a.doesNotMatch(V.t(l, k, v), /解码|buffer|decode|页面|\bpage\b|\{n\}|\{time\}/i, `${l} ${k}`);
  // registered like the other error texts: the code says JJ's sentence through errorText; no number → the -track sentence
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_AUDIO_FAILED', params: { n: '2', time: '0:10' } }).text, '第 2 段（时间线 0:10 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_AUDIO_FAILED', params: { time: '0:10' } }).text, '时间线 0:10 处的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_AUDIO_FAILED', params: { n: '2', time: '0:10' } }).known, true);
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_PAGE_CRASHED' }).text, zh('own.err-export-page-crashed'));
});

test('a clip whose sound can\'t be read stops the export, with its number and time; a sound on its own by its time only', () => {
  for (const language of ['zh-CN', 'en']) {
    const { exportMixFailure } = helpers(language);
    const aud = { kind: 'audio', props: {} }, pic = { kind: 'video', props: { volume: 0 } };
    a.equal(exportMixFailure([{ c: aud, n: 1, t: 0, buf: {} }]), null);
    const e = exportMixFailure([{ c: aud, n: 1, t: 0, buf: {} }, { c: aud, n: 3, t: 72, failed: new Error('audio window 422'), heard: true }, { c: pic, n: 2, t: 10, failed: new Error('x'), heard: false }]);
    a.ok(e instanceof Error); a.equal(e.code, 'EXPORT_AUDIO_FAILED'); a.deepEqual(e.params, { n: '3', time: '1:12' });
    a.equal(e.message, V.t(language, 'own.export-audio-failed', { n: 3, time: '1:12' }));
    a.equal(exportMixFailure([{ c: pic, n: 2, t: 10, failed: new Error('x'), heard: false }]), null, 'an unheard failure is not one');
    // the music on its own: no number, its time
    const m = exportMixFailure([{ c: aud, n: null, t: 4332, failed: new Error('x'), heard: true }]);
    a.deepEqual(m.params, { time: '1:12:12' }); a.equal(m.message, V.t(language, 'own.export-audio-failed-track', { time: '1:12:12' }));
    // several: the pieces with a picture, at most 5, in timeline order (JJ: 「第 3、5、8 段」); a sound on its own then isn't listed
    const many = [3, 5, 8, 9, 11, 12].map((n) => ({ c: aud, n, t: n * 10, failed: new Error('x'), heard: true }));
    const e2 = exportMixFailure([{ c: aud, n: null, t: 1, failed: new Error('x'), heard: true }, ...many.reverse()]);
    const sep = language === 'en' ? ', ' : '、';
    a.deepEqual(e2.params, { n: [3, 5, 8, 9, 11].join(sep), time: ['0:30', '0:50', '1:20', '1:30', '1:50'].join(sep) });
  }
});

/* JJ (#231): she counts the pieces in the picture. Music from 0 s beside the first video must not take a number. */
test('第 N 段 counts only pieces with a picture (a video and its linked sound); a sound on its own gets its time, no number', () => {
  const { exportSegmentNumbers } = helpers();
  const clips = [
    { id: 'music', kind: 'audio', track: 'A3', start: 0, duration: 30 },
    { id: 'v2', kind: 'video', track: 'V1', start: 10, duration: 10, linkGroup: 'g2' },
    { id: 'a2', kind: 'audio', track: 'A1', start: 10, duration: 10, linkGroup: 'g2' },
    { id: 'v1', kind: 'video', track: 'V1', start: 0, duration: 10, linkGroup: 'g1' },
    { id: 'a1', kind: 'audio', track: 'A1', start: 0, duration: 10, linkGroup: 'g1' },
    { id: 'vo', kind: 'audio', track: 'A2', start: 12, duration: 5 },
    { id: 'v3', kind: 'video', track: 'V1', start: 20, duration: 10 },
    { id: 'title', kind: 'text', track: 'V2', start: 0, duration: 5 },
    { id: 'late', kind: 'audio', track: 'A1', start: 40, duration: 5 },
  ];
  const n = exportSegmentNumbers(clips, 0, 30);
  a.deepEqual(Object.fromEntries(n), { v1: { n: 1, t: 0 }, a1: { n: 1, t: 0 }, v2: { n: 2, t: 10 }, a2: { n: 2, t: 10 }, v3: { n: 3, t: 20 },
    music: { n: null, t: 0 }, vo: { n: null, t: 12 } });
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
    { c: { id: 'music', kind: 'audio', props: {} }, n: null, t: 0, heard: true, buf: loud, at: 0, m0: 0, m1: 20, src: '/media/music.wav' },
    { c: { id: 'v', kind: 'video', props: { volume: 0 } }, n: 2, t: 10, heard: false, buf: quiet, at: 0, m0: 1, m1: 11, src: '/media/rec.mp4' },
    { c: { id: 'a', kind: 'audio', props: {} }, n: 2, t: 10, heard: true, buf: quiet, at: 0, m0: 1, m1: 11, src: '/media/rec.mp4' },
    { c: { id: 'b', kind: 'audio', props: {} }, n: 3, t: 20, heard: true, buf: loud, at: 0, m0: 2, m1: 12, src: '/media/rec2.mp4' },
    { c: { id: 'vo', kind: 'audio', props: {} }, n: null, t: 25, heard: true, buf: quiet, at: 0, m0: 0, m1: 5, src: '/media/vo.wav' },
  ];
  a.deepEqual(exportSilentSegments(results), [{ n: 2, t: 10, src: '/media/rec.mp4', at: 1, dur: 10 }, { n: null, t: 25, src: '/media/vo.wav', at: 0, dur: 5 }]);
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
  const FF = require('../server/ffmpeg-path'), C = require('../server/export-check');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc14-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const make = (name, expr) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=12`, '-c:a', 'pcm_s16le', path.join(dir, name)]);
  make('music.wav', '0.5*sin(2*PI*440*t)'); make('quiet.wav', '0'); make('rec.wav', '0.1*sin(2*PI*660*t)');
  // the export: loud music all through (its loudness passes) — the silent clip sits under it
  const out = path.join(dir, 'out.wav'); fs.copyFileSync(path.join(dir, 'music.wav'), out);
  const resolve = (src) => path.join(dir, src.replace('/media/', ''));
  const plan = C.cleanPlan({ video: [], audio: [{ src: '/media/music.wav', at: 0, dur: 10 }],
    silent: [{ n: 2, t: 10, src: '/media/quiet.wav', at: 1, dur: 10 }, { n: null, t: 4332, src: '/media/quiet.wav', at: 0, dur: 5 }, { n: 'x', t: 1 }] });
  a.deepEqual(plan.silent, [{ n: 2, t: 10, src: '/media/quiet.wav', at: 1, dur: 10 }, { n: null, t: 4332, src: '/media/quiet.wav', at: 0, dur: 5 }], 'cleaned');
  const r = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan, resolve, silent: false, mix: null });
  a.equal(r.ok, true, 'a clip silent in its file too is not a failure'); a.deepEqual(r.quiet, [{ n: 2, t: 10 }, { n: null, t: 4332 }]); a.deepEqual(r.lost, []);
  const report = C.withQuiet({ ok: true, checks: [{ ok: true, text: '-14.0 LUFS' }], line: '-14.0 LUFS' }, r.quiet);
  a.equal(report.ok, false, 'overall loudness passing is not enough');
  a.deepEqual(report.checks[1], { ok: false, code: 'EXPORT_CLIP_SILENT', n: 2, t: 10, text: 'clip 2 (at 0:10) is silent — check that it is meant to be' });
  a.deepEqual(report.checks[2], { ok: false, code: 'EXPORT_CLIP_SILENT', n: null, t: 4332, text: 'the sound at 1:12:12 is silent — check that it is meant to be' });
  a.match(report.line, /⚠ clip 2 \(at 0:10\) is silent/);
  // the page says each one in the interface language, with the same numbers and times
  const text = new Function('uiText', 'mcView', 'MontClipAutoSlices', 'oneSidedWarning', [body(app, 'function exportClipWords('), body(app, 'function exportCheckText(')].join('\n') + '\nreturn exportCheckText;')(
    (k, v) => V.t('zh-CN', k, v), { get: () => ({ language: 'zh-CN' }) }, require('../shared/auto-slices'), null);
  a.equal(text(report.checks[1]), '第 2 段（时间线 0:10 处）是无声的，请确认是不是你想要的。');
  a.equal(text(report.checks[2]), '时间线 1:12:12 处的声音是无声的，请确认是不是你想要的。');
  // the page heard nothing where the file has sound (the MC-14 export): lost, the export fails with the clip's number
  const lostPlan = C.cleanPlan({ video: [], audio: [], silent: [{ n: 3, t: 72, src: '/media/rec.wav', at: 1, dur: 10 }, { n: 5, t: 90, src: '/media/rec.wav', at: 2, dur: 5 }] });
  const r2 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan: lostPlan, resolve, silent: false, mix: null });
  a.equal(r2.ok, false); a.deepEqual(r2.lost, [{ n: 3, t: 72 }, { n: 5, t: 90 }]);
  a.equal(C.failCode(r2), 'EXPORT_AUDIO_FAILED'); a.deepEqual(C.failParams(r2), { clips: [{ n: 3, t: 72 }, { n: 5, t: 90 }] }, 'every lost piece, not only the first');
  a.match(C.failText(r2), /clip 3, 5 \(at 1:12, 1:30\)/);
  // the page turns the server's list into JJ's sentence: 「第 3、5 段（时间线 1:12、1:30 处）」
  const endErr = new Function('mcView', 'MontClipAutoSlices', [body(app, 'function exportClipWords('), body(app, 'function exportEndError(')].join('\n') + '\nreturn exportEndError;')(
    { get: () => ({ language: 'zh-CN' }) }, require('../shared/auto-slices'));
  const e = endErr({ error: C.failText(r2), code: 'EXPORT_AUDIO_FAILED', params: C.failParams(r2) }, 'x');
  a.equal(V.errorText('zh-CN', e).text, '第 3、5 段（时间线 1:12、1:30 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。');
  // the server deletes that file instead of handing it over
  const server = read('server/server.js');
  a.match(server, /blank\.code === "EXPORT_AUDIO_FAILED"[\s\S]{0,200}fs\.unlinkSync\(o\.outPath\)/);
});

test('reading only the used span: 16 s of a 2-hour file decodes about 16 s (bytes and length), not the file', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers'), FF = require('../server/ffmpeg-path');
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
  const T = require('../shared/transcribe.js'), FF = require('../server/ffmpeg-path');
  const rs = T.clipRanges([{ in: 3600, duration: 16, props: {} }], { duration: null });
  a.deepEqual(rs, [[3598.5, 3617.5]]);
  // a file whose length the project doesn't know yet is read in its clips' windows too, never whole
  const mcp = read('server/mcp-server.js'), plan = mcp.slice(mcp.indexOf('const rangesOf = new Map();'), mcp.indexOf('const ask = {};'));
  a.match(plan, /dur != null && !\(dur > LONG_FILE_S\)/); a.match(plan, /dur == null \|\| T\.rangeSeconds\(rs\) < dur \/ 2/);
  const { readArgs } = require('../server/asr-local').__test || require('../server/asr-local');
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
  const { createExportJobs } = require('../server/export-jobs');
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
  a.match(read('server/export-jobs.js'), /EXPORT_PAGE_CRASHED[\s\S]{0,300}\(tab closed or browser crashed\)/);
});

/* JJ asked (#231): when the headless page crashes, is the half-written file cleaned up? A crash ends the job
   (export-jobs.js: the browser's exit → end(j, "failed") → opts.onEnd); the server's onEnd stops that job's export
   sessions (server.js cleanupExport → export-cleanup.js stopSessions), which kills ffmpeg and deletes the .part. */
test('MC-15: a crashed export page\'s half-written file is deleted (onEnd → cleanupExport → stopSessions removes the .part)', async (t) => {
  const { createExportJobs } = require('../server/export-jobs'), { stopSessions } = require('../server/export-cleanup');
  const saved = process.env.FABLECUT_CHROME;
  process.env.FABLECUT_CHROME = process.execPath;
  t.after(() => { if (saved == null) delete process.env.FABLECUT_CHROME; else process.env.FABLECUT_CHROME = saved; });
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc15-')), part = path.join(dir, 'clip.part.mp4');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(part, Buffer.alloc(4096));
  const sessions = new Map(), stopped = [];
  const jobs = createExportJobs({ url: (id) => 'http://127.0.0.1:1/?exportJob=' + id, broadcast() {}, editors: () => 0,
    // the server's own onEnd (server.js), with its session map
    onEnd: (j) => { for (const [id, s] of [...sessions]) if (s.job === j.id) { sessions.delete(id); stopped.push(stopSessions([s], { timeoutMs: 2000 })); } } });
  const j = jobs.request({ kind: 'export', where: 'headless' });
  sessions.set('sess1', { job: j.id, partPath: part, outputs: [] });   // /api/export/begin with opts.job
  for (let i = 0; i < 100 && jobs.get(j.id).status === 'pending'; i++) await new Promise((r) => setTimeout(r, 100));
  a.equal(jobs.get(j.id).code, 'EXPORT_PAGE_CRASHED');
  await Promise.all(stopped);
  a.equal(stopped.length, 1, 'the crashed job\'s session was stopped'); a.equal(fs.existsSync(part), false, 'the .part is gone');
  const server = read('server/server.js');
  a.match(server, /onEnd: \(j\) => \{ for \(const \[id, s\] of \[\.\.\.exportSessions\]\) if \(s\.job === j\.id\) cleanupExport\(id\); \}/);
  a.match(server, /exportSessions\.get\(begun\.id\)\.job = opts\.job/, 'a session knows its job from /api/export/begin');
});

/* MC-15, the truth (Video on europa, #231 issuecomment-6715105038): #231's `echo 1000 > /proc/self/oom_score_adj` before
   the browser did not hold — Chrome sets its own per process type (0 / 200 / renderer 300) as it starts, so it was
   removed. MontClip claims nothing about which process the kernel kills first; what it does claim is tested above: a page
   that dies ends its own job (EXPORT_PAGE_CRASHED). */
test('MC-15: the headless browser is started as itself — no oom_score_adj line that Chrome overrides, and no claim that it works', () => {
  const jobs = read('server/export-jobs.js');
  a.equal(require('../server/export-jobs').browserCommand, undefined);
  a.doesNotMatch(jobs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /oom_score_adj|\/bin\/sh/, 'no wrapper in the code');
  a.ok(jobs.includes('const proc = spawn(exe, args, { stdio: "ignore", windowsHide: true });'));
  // the comment says what is true: Chrome's own values, not ours
  a.ok(jobs.includes('renderer (the export page) 300')); a.ok(jobs.includes("that is Chrome's default, not ours"));
  a.doesNotMatch(jobs, /first thing the kernel's out-of-memory/);
});

/* QQ on #229: why did #161's self-check say "passed"? (1) It only reads the sources when the WHOLE export is silent
   (export-check.js on main: `if (silent) {`), so loud music hid a silent clip. (2) A source it couldn't read counted as
   silent: soundPeak gave −Infinity when ffmpeg ran but volumedetect said nothing, and null (a failed or timed-out read)
   was skipped by `peaks.some((db) => db != null && db > QUIET_DB)`. A source the check can't read must never count as
   silent. Synthetic media only. */
test('the self-check never counts a source it couldn\'t read as silent: the export fails instead of passing', async (t) => {
  const FF = require('../server/ffmpeg-path'), C = require('../server/export-check');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mc14u-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ff = (args) => execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', ...args]);
  ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '10', '-c:a', 'pcm_s16le', path.join(dir, 'silent-export.wav')]);
  ff(['-f', 'lavfi', '-i', "aevalsrc='0':s=48000:d=10", '-c:a', 'pcm_s16le', path.join(dir, 'quiet.wav')]);
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=4', '-an', '-c:v', 'mpeg4', path.join(dir, 'picture-only.mp4')]);
  // a "recording" whose bytes ffmpeg can't read: a WAV header over garbage
  const good = fs.readFileSync(path.join(dir, 'quiet.wav'));
  fs.writeFileSync(path.join(dir, 'broken.wav'), Buffer.concat([Buffer.from('not a media file at all'), good.subarray(0, 4000)]));
  const F = (n) => path.join(dir, n), exp = F('silent-export.wav');
  const q = await C.soundPeak(FF.path('ffmpeg'), F('quiet.wav'), 1, 5);
  a.ok(q != null && q < C.QUIET_DB, `digital silence is silence (volumedetect says ${q} dB)`);
  a.equal(await C.soundPeak(FF.path('ffmpeg'), F('picture-only.mp4'), 0, 2), -Infinity, 'no sound stream: nothing to lose');
  a.equal(await C.soundPeak(FF.path('ffmpeg'), F('broken.wav'), 1, 5), null, 'unreadable: not known');
  a.equal(await C.soundPeak(FF.path('ffmpeg'), F('quiet.wav'), 60, 5), null, 'nothing decoded there (past its end): not known');
  const resolve = (src) => F(src.replace('/media/', ''));
  const run = (plan) => C.check({ ffmpeg: FF.path('ffmpeg'), file: exp, plan: C.cleanPlan(plan), resolve, silent: true, mix: null });
  // a silent export whose source is silent too: fine (the streamer's choice)
  a.equal((await run({ video: [], audio: [{ src: '/media/quiet.wav', at: 1, dur: 5 }] })).ok, true);
  // a silent export whose source couldn't be read: on main this passed; now it fails (EXPORT_BLANK_SOUND)
  const r = await run({ video: [], audio: [{ src: '/media/broken.wav', at: 1, dur: 5 }] });
  a.equal(r.ok, false); a.equal(r.sound, true); a.equal(C.failCode(r), 'EXPORT_BLANK_SOUND');
  // one piece the page heard as silent, its file unreadable: lost (第 N 段没读出来), never "silent in its file too"
  const r2 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: exp, resolve, silent: false, mix: null,
    plan: C.cleanPlan({ video: [], audio: [], silent: [{ n: 4, t: 30, src: '/media/broken.wav', at: 1, dur: 5 }] }) });
  a.deepEqual(r2.lost, [{ n: 4, t: 30 }]); a.deepEqual(r2.quiet, []); a.equal(C.failCode(r2), 'EXPORT_AUDIO_FAILED');
  // a mix the check can't read is not taken as "has sound": the sources are read
  const r3 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: exp, resolve, silent: null, mix: F('broken.wav'),
    plan: C.cleanPlan({ video: [], audio: [{ src: '/media/broken.wav', at: 1, dur: 5 }] }) });
  a.equal(r3.sound, true);
});
