'use strict';
/* #231 follow-up (Video on europa, #231 issuecomment-6715105038; QQ's triage).
   1. A 2-hour MP4 written in fragments makes ffmpeg read ~949 MB just to open it, 23 s from a cold disk, however short the
      stretch; the check's 20 s limit killed the read and the clip counted as unreadable — the export failed and its file
      was deleted, though the sound had been read and the clip really was quiet. Out of time is not unreadable: the file
      is kept, with a warning that the piece could not be checked (EXPORT_CLIP_UNCHECKED). A real read error still fails.
   2. On the profile export path (no delivery: what fablecut_export {} takes when the project has none) the reply was
      {ok, src} only, so 「第 N 段是无声的」 never reached the job.
   3. A failed job's record had code: null; the page's reason code is kept now.
   Synthetic media only: a fragmented MP4 (thousands of moof boxes) and a 1 ms limit standing in for the slow disk. */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const app = read('app.js');
const body = (src, head) => { const i = src.indexOf(head); a.ok(i >= 0, head); return src.slice(i, src.indexOf('\n}', i) + 2); };
const V = require('../ui-preferences'), FF = require('../server/ffmpeg-path'), C = require('../server/export-check');
const noFf = !FF.available('ffmpeg') && 'bundled ffmpeg not installed';

function fragmentedQuiet(file, seconds = 600) {
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(seconds), '-c:a', 'aac', '-b:a', '24k',
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '100000', file], { windowsHide: true });
}
function tmp(t, name) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/** The page's exportCheckText, run outside the browser in one language. */
const checkText = (language) => new Function('uiText', 'mcView', 'MontClipAutoSlices', 'oneSidedWarning',
  [body(app, 'function exportClipWords('), body(app, 'function exportCheckText(')].join('\n') + '\nreturn exportCheckText;')(
  (k, v) => V.t(language, k, v), { get: () => ({ language }) }, require('../auto-slices'), null);

test('the two new sentences (JJ 定稿, #238): number and time for a piece with a picture, time only for a sound on its own', () => {
  const v = { n: 3, time: '1:12:04' };
  a.equal(V.t('zh-CN', 'own.export-clip-unchecked', v), '第 3 段（时间线 1:12:04 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。');
  a.equal(V.t('zh-CN', 'own.export-clip-unchecked-track', v), '时间线 1:12:04 处的声音在成片里是无声的，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。');
  a.equal(V.t('en', 'own.export-clip-unchecked', v), "Clip 3 (at 1:12:04 on the timeline) has no sound in the export, and we couldn't confirm whether the original has sound there. The export was made; please listen to this part yourself before you share it.");
  a.equal(V.t('en', 'own.export-clip-unchecked-track', v), "The sound at 1:12:04 on the timeline is silent in the export, and we couldn't confirm whether the original has sound there. The export was made; please listen to this part yourself before you share it.");
  a.match(read('ui-preferences.js'), /JJ 定稿 \(2026-11-08, #238 issuecomment-6716851239\)[\s\S]{0,400}"export-clip-unchecked":/, 'marked as final');
  a.doesNotMatch(read('ui-preferences.js'), /DRAFT for JJ[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*"(?:own\.)?export-clip-unchecked/, 'no longer a draft');
  // registered like the other texts with a code: errorText says it; no number → the -track sentence
  a.ok(V.ERROR_CODES.includes('EXPORT_CLIP_UNCHECKED'));
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_CLIP_UNCHECKED', params: { n: '2', time: '0:10' } }).text, '第 2 段（时间线 0:10 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。');
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_CLIP_UNCHECKED', params: { time: '0:10' } }).text, '时间线 0:10 处的声音在成片里是无声的，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。');
  for (const k of ['own.export-clip-unchecked', 'own.export-clip-unchecked-track'])
    for (const l of ['zh-CN', 'en']) a.doesNotMatch(V.t(l, k, v), /解码|buffer|decode|超时|timeout|\{n\}|\{time\}/i, `${l} ${k}`);
});

test('a piece whose file takes too long to read is not "unreadable": the file is kept, with a warning to listen to it', { skip: noFf }, async (t) => {
  const dir = tmp(t, 'mcto-');
  const frag = path.join(dir, 'frag.mp4'), junk = path.join(dir, 'junk.mp4'), out = path.join(dir, 'out.wav');
  fragmentedQuiet(frag);
  fs.writeFileSync(junk, require('crypto').randomBytes(64 * 1024));
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=3', out], { windowsHide: true });
  const resolve = (src) => path.join(dir, src.replace('/media/', ''));
  const plan = C.cleanPlan({ video: [], audio: [], silent: [{ n: 2, t: 10, src: '/media/frag.mp4', at: 300, dur: 5 }, { n: null, t: 75, src: '/media/frag.mp4', at: 500, dur: 3 }] });
  a.deepEqual(await C.soundRead(FF.path('ffmpeg'), frag, 300, 5, 1), { db: null, timedOut: true }, 'stopped for time');
  // read in time: quiet in its file too — the warning #231 already gives
  // (cases that must finish their read get 120 s: a loaded CI machine can take 20 s over 6,000 fragments — this very bug)
  const r0 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan, resolve, silent: false, mix: null, timeoutMs: 120000 });
  a.deepEqual([r0.ok, r0.lost, r0.unchecked], [true, [], []]); a.deepEqual(r0.quiet, [{ n: 2, t: 10 }, { n: null, t: 75 }]);
  // out of time (the slow disk): neither lost nor quiet — the file stays, with a warning per piece
  const r = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan, resolve, silent: false, mix: null, timeoutMs: 1 });
  a.equal(r.ok, true, 'not a failure: ' + JSON.stringify(r));
  a.deepEqual([r.lost, r.quiet], [[], []]); a.deepEqual(r.unchecked, [{ n: 2, t: 10 }, { n: null, t: 75 }]);
  a.equal(C.failCode(r), null);
  const report = C.warningReport(r.quiet, r.unchecked);
  a.equal(report.ok, false);
  a.deepEqual(report.checks.map((c) => [c.code, c.n, c.t]), [['EXPORT_CLIP_UNCHECKED', 2, 10], ['EXPORT_CLIP_UNCHECKED', null, 75]]);
  a.match(report.line, /⚠ the sound of clip 2 \(at 0:10\) could not be checked in time — the file was kept/);
  a.match(report.checks[1].text, /^the sound at 1:15 could not be checked in time/);
  a.equal(C.warningReport([], []), null, 'nothing to say: no report');
  // a delivery report gets the same warnings after its own checks
  const rep = C.withQuiet({ ok: true, checks: [{ ok: true, text: '-14.0 LUFS' }], line: '-14.0 LUFS' }, [], r.unchecked);
  a.deepEqual(rep.checks.map((c) => c.code || 'ok'), ['ok', 'EXPORT_CLIP_UNCHECKED', 'EXPORT_CLIP_UNCHECKED']);
  // the page says it in the interface language, numbered as #231 numbers them (time only for a sound on its own)
  a.deepEqual(report.checks.map(checkText('zh-CN')), ['第 2 段（时间线 0:10 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。',
    '时间线 1:15 处的声音在成片里是无声的，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。']);
  a.deepEqual(report.checks.map(checkText('en')), ["Clip 2 (at 0:10 on the timeline) has no sound in the export, and we couldn't confirm whether the original has sound there. The export was made; please listen to this part yourself before you share it.",
    "The sound at 1:15 on the timeline is silent in the export, and we couldn't confirm whether the original has sound there. The export was made; please listen to this part yourself before you share it."]);
  // a file that really can't be read still fails the export, given all the time it needs
  const bad = C.cleanPlan({ video: [], audio: [], silent: [{ n: 4, t: 30, src: '/media/junk.mp4', at: 1, dur: 2 }] });
  const r2 = await C.check({ ffmpeg: FF.path('ffmpeg'), file: out, plan: bad, resolve, silent: false, mix: null, timeoutMs: 120000 });
  a.deepEqual([r2.ok, r2.lost, r2.unchecked], [false, [{ n: 4, t: 30 }], []]);
  a.equal(C.failCode(r2), 'EXPORT_AUDIO_FAILED');
  a.equal((await C.soundRead(FF.path('ffmpeg'), junk, 1, 2)).timedOut, false, 'a read error is not a timeout');
});

/** One profile export through the real routes (/api/export/begin with a profile, no delivery), its plan naming one silent
 *  piece in rec.mp4. → {status, out (the /api/export/end reply), exports (finished files)} */
async function profileExport(t, env, srcFile) {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const data = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(data, 'media'), { recursive: true });
  fs.copyFileSync(srcFile, path.join(data, 'media', 'rec.mp4'));
  const { base } = await startServer(t, data, { FABLECUT_NO_FS_WATCH: '1', ...env });
  const post = (route, b, json = true) => fetch(base + route, { method: 'POST', ...(json ? { headers: { 'Content-Type': 'application/json' } } : {}), body: json ? JSON.stringify(b) : b });
  const jpeg = execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:size=320x180', '-frames:v', '1', '-c:v', 'mjpeg', '-f', 'image2pipe', '-'], { windowsHide: true });
  const wav = execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=1', '-f', 'wav', '-'], { windowsHide: true });
  const check = { video: [], audio: [], silent: [{ n: 2, t: 10, src: '/media/rec.mp4', at: 300, dur: 5 }] };
  const begin = await (await post('/api/export/begin', { fps: 30, frames: 30, profile: 'prores422', name: 'quiet', hasAudio: true, check })).json();
  a.ok(begin.id, JSON.stringify(begin));
  a.equal((await post('/api/export/audio?id=' + begin.id, wav, false)).status, 200);
  a.equal((await post('/api/export/frame?id=' + begin.id, Buffer.concat(Array(30).fill(jpeg)), false)).status, 200);
  const res = await post('/api/export/end?id=' + begin.id, {});
  const out = await res.json();
  return { status: res.status, out, exports: fs.readdirSync(path.join(data, 'exports')).filter((f) => /\.mov$/.test(f)) };   // finished files only (the server's own temp folder may still be there)
}

test('profile export: a silent piece and one not checked in time reach the reply (and so the job); unreadable still deletes the file', { skip: noFf, timeout: 180_000 }, async (t) => {
  const dir = tmp(t, 'mctp-');
  const frag = path.join(dir, 'frag.mp4'), junk = path.join(dir, 'junk.mp4');
  fragmentedQuiet(frag);
  fs.writeFileSync(junk, require('crypto').randomBytes(64 * 1024));
  const quiet = await profileExport(t, { MONTCLIP_EXPORT_CHECK_TIMEOUT_MS: '120000' }, frag);   // read in time, however loaded
  a.equal(quiet.status, 200, JSON.stringify(quiet.out));
  a.deepEqual(quiet.out.report.checks.map((c) => [c.code, c.n, c.t]), [['EXPORT_CLIP_SILENT', 2, 10]], 'the silent piece reaches the profile reply');
  a.deepEqual(quiet.exports, ['quiet.mov']);
  const slow = await profileExport(t, { MONTCLIP_EXPORT_CHECK_TIMEOUT_MS: '1' }, frag);
  a.equal(slow.status, 200, 'out of time is not a failure: ' + JSON.stringify(slow.out));
  a.deepEqual(slow.out.report.checks.map((c) => [c.code, c.n, c.t]), [['EXPORT_CLIP_UNCHECKED', 2, 10]]);
  a.deepEqual(slow.exports, ['quiet.mov'], 'the file is kept');
  const lost = await profileExport(t, { MONTCLIP_EXPORT_CHECK_TIMEOUT_MS: '120000' }, junk);
  a.equal(lost.status, 500); a.equal(lost.out.code, 'EXPORT_AUDIO_FAILED');
  a.deepEqual(lost.exports, [], 'unreadable: no file');
});

test('the page hands a profile export\'s warnings to the job result, as the delivery path does', () => {
  const fast = body(app, 'async function fastExport(');
  a.ok(fast.includes('ok: true, src: end.src, ...(end.report ? { report: end.report } : {}) }]'), 'the profile output carries end.report');
  a.ok(fast.includes(': end.report ? { result: { outputs: result.outputs } } : {}) }, true);'), 'and the job result carries it');
  a.ok(fast.includes('{ exportFile: true, ...(end.report ? { savedMsg: exportReportLine(end.report) } : {}) }'), 'an export from the editor says it too');
  // fablecut_export reads outputs[0].report for one file
  a.match(read('server/mcp-server.js'), /const rep = outs && outs\[0\] && outs\[0\]\.report;/);
  // the job keeps the result the page reports
  const { createExportJobs } = require('../server/export-jobs');
  const jobs = createExportJobs({ url: () => 'http://127.0.0.1:1/', broadcast() {}, editors: () => 1 });
  const j = jobs.request({ kind: 'export', where: 'tab' });
  jobs.claim(j.id, {});
  const report = C.warningReport([{ n: 14, t: 137 }], []);
  jobs.report(j.id, { status: 'done', src: '/exports/a.mp4', result: { outputs: [{ file: 'a.mp4', ok: true, src: '/exports/a.mp4', report }] } });
  a.equal(jobs.get(j.id).result.outputs[0].report.checks[0].code, 'EXPORT_CLIP_SILENT');
  jobs.shutdown();
});

test('a failed export job keeps its reason code (EXPORT_AUDIO_FAILED …) in the record and its view, not only the English', () => {
  const { createExportJobs } = require('../server/export-jobs');
  const jobs = createExportJobs({ url: () => 'http://127.0.0.1:1/', broadcast() {}, editors: () => 1 });
  const j = jobs.request({ kind: 'export', where: 'tab' });
  a.ok(jobs.claim(j.id, {}));
  jobs.report(j.id, { status: 'failed', error: 'quiet.mov: the sound of clip 12 (at 3:34) could not be read', code: 'EXPORT_AUDIO_FAILED' });
  const v = jobs.get(j.id);
  a.deepEqual([v.status, v.code], ['failed', 'EXPORT_AUDIO_FAILED']);
  a.match(v.error, /could not be read/);
  // anything that isn't a code is not kept
  for (const code of [undefined, 42, '<b>', 'x'.repeat(80)]) {
    const k = jobs.request({ kind: 'export', where: 'tab' });
    jobs.claim(k.id, {}); jobs.report(k.id, { status: 'failed', error: 'boom', code });
    a.equal(jobs.get(k.id).code, null, String(code));
  }
  jobs.shutdown();
  // the page sends the code it failed with; fablecut_export says it
  const fast = body(app, 'async function fastExport(');
  a.ok(fast.includes('reportExportJob(job, { status: "failed", error: msg, ...(e && typeof e.code === "string" ? { code: e.code } : {}) }, true);'));
  // tool-error-exits.test.js checks the real MCP reply keeps this code and redacts its reason.
});

/* QQ on #238 (export-check.js:63): a read stopped for time can still print a max_volume. On Linux / macOS Node stops
   ffmpeg with SIGTERM and it prints what it decoded so far — maybe only the quiet start of the stretch (Rea, #238
   issuecomment-6716796422; on Windows the kill leaves no statistics). Out of time is unchecked, whatever was printed. */
test('a read stopped for time that still printed a max_volume is unchecked, never quiet (any OS: a stand-in runner)', async () => {
  const said = (stderr, timedOut) => async () => ({ ok: !timedOut, stdout: '', stderr, timedOut });
  const partial = said('[Parsed_volumedetect_0 @ 0] n_samples: 96000\n[Parsed_volumedetect_0 @ 0] max_volume: -91.0 dB\n', true);
  a.deepEqual(await C.soundRead('ffmpeg', 'rec.flac', 1700, 30, 1000, partial), { db: -91, timedOut: true });
  a.deepEqual(await C.soundRead('ffmpeg', 'rec.flac', 1700, 30, 1000, said('max_volume: -inf dB\n', true)), { db: -Infinity, timedOut: true });
  const plan = C.cleanPlan({ video: [], audio: [], silent: [{ n: 2, t: 10, src: '/media/rec.flac', at: 1690, dur: 20 }] });
  const resolve = () => 'rec.flac';
  const r = await C.check({ ffmpeg: 'ffmpeg', file: 'out.mov', plan, resolve, silent: false, mix: null, run: partial });
  a.deepEqual([r.ok, r.lost, r.quiet, r.unchecked], [true, [], [], [{ n: 2, t: 10 }]], 'unchecked, not quiet');
  a.deepEqual(C.warningReport(r.quiet, r.unchecked).checks.map((c) => c.code), ['EXPORT_CLIP_UNCHECKED']);
  // a loud partial read stopped for time: not lost either (the file is kept, with the warning)
  const loud = await C.check({ ffmpeg: 'ffmpeg', file: 'out.mov', plan, resolve, silent: false, mix: null, run: said('max_volume: -6.0 dB\n', true) });
  a.deepEqual([loud.ok, loud.lost, loud.quiet, loud.unchecked], [true, [], [], [{ n: 2, t: 10 }]]);
  // the same statistics from a read that finished: quiet and lost as before
  const done = await C.check({ ffmpeg: 'ffmpeg', file: 'out.mov', plan, resolve, silent: false, mix: null, run: said('max_volume: -91.0 dB\n', false) });
  a.deepEqual([done.quiet, done.unchecked], [[{ n: 2, t: 10 }], []]);
  const heard = await C.check({ ffmpeg: 'ffmpeg', file: 'out.mov', plan, resolve, silent: false, mix: null, run: said('max_volume: -6.0 dB\n', false) });
  a.deepEqual([heard.ok, heard.lost, heard.unchecked], [false, [{ n: 2, t: 10 }], []]);
});

test('Rea\'s source on #238: a long FLAC, quiet first and a tone after, read with a small limit — timed out, on every OS', { skip: noFf, timeout: 180_000 }, async (t) => {
  const dir = tmp(t, 'mcto-'), flac = path.join(dir, 'late-tone.flac');
  // 1800 s, mono: silence to 1700 s, then a 1 kHz tone (read to its end: about −18 dB)
  execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=1000:r=48000:d=1800', '-af', 'volume=0:enable=lt(t\\,1700)',
    '-c:a', 'flac', flac], { windowsHide: true });
  const full = await C.soundRead(FF.path('ffmpeg'), flac, 0, null, 120000);
  a.equal(full.timedOut, false); a.ok(full.db > C.QUIET_DB, 'the tone is there when read to the end: ' + full.db);
  // stopped part way: Windows leaves no statistics (db null), Linux / macOS may print the quiet start's — timed out either way
  const cut = await C.soundRead(FF.path('ffmpeg'), flac, 0, null, 300);
  a.equal(cut.timedOut, true, JSON.stringify(cut));
  a.ok(cut.db == null || cut.db <= C.QUIET_DB, 'only the quiet start, if anything: ' + cut.db);
});
