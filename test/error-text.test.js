'use strict';
// Deja, 2026-11-04 (decision B): every failure the streamer sees goes through one function, MontClipView.errorText — a
// code becomes plain words (what happened, what to do); the raw error goes to the log, and comes back only as `detail`
// (small print after the words) when no sentence fits. Export results say 「N 条导出好了，M 条没导出来」, and
// 「3 条都没导出来」 when none made it. The sentences wait for JJ, so these tests lock the structure, not the words.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js');
const CJK = /[　-〿㐀-鿿＀-￯]/;
// names a Chinese sentence may keep as they are: the product, the tools and formats she sees on her own computer
const NAMES = /MontClip|FFmpeg|ffmpeg\.exe|FLV|MP4|H\.264|x264|Windows|NVIDIA|Intel|AMD|Apple|Media Feature Pack|Yolo|AI/g;
const englishIn = (s) => String(s).replace(NAMES, '').match(/[A-Za-z]{2,}/);
const fnBody = (src, head) => { const at = src.indexOf(head); a.ok(at >= 0, head); let d = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(at, i + 1); };
const all = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

/** Every code the server, the desktop main process and the page hand to the interface. */
function publicCodes() {
  const codes = new Set([...require('../prepare-media').PUBLIC_CODES, 'IMPORT_FAILED']);
  for (const c of all(read('desktop/flv-import.js'), /fail\("([A-Z_]+)"/g)) codes.add(c);
  for (const c of all(read('export-jobs.js'), /errorCode: "([A-Z_]+)"/g)) codes.add(c);
  for (const c of all(read('external-ffmpeg.js'), /code: "([A-Za-z0-9]+)"/g)) codes.add(c);
  for (const c of all(read('server.js'), /code: ?"([A-Za-z0-9_]+)"/g)) codes.add(c);
  for (const c of all(read('server.js'), /"(ext[A-Z][A-Za-z]+)" : ext\.code/g)) codes.add(c);
  for (const c of all(app, /code: "((?:EXPORT|DISK)_[A-Z_]+)"/g)) codes.add(c);
  for (const c of V.ERROR_CODES) codes.add(c);
  codes.add('ffmpegMissing');
  codes.delete('none');        // "no local FFmpeg chosen": a state, never shown as a failure
  codes.delete('ffmpegDev');   // a development checkout without the bundled FFmpeg: stays English (ffmpeg-path.js)
  return [...codes].sort();
}
const PARAMS = { w: 120, h: 40, reason: 'extGone', encoder: 'h264_mf' };

test('the walk finds the codes it should (a regex that stops matching would make the next test pass on nothing)', () => {
  const codes = publicCodes();
  for (const c of ['FLV_TIMELINE_GAP', 'FLV_NOT_FOUND', 'HEADLESS_DISABLED', 'extNoX264', 'h264NoneOther', 'frameTooSmall',
    'NETWORK_DISABLED', 'extNeeded', 'EXPORT_TIMELINE_CHANGED', 'DISK_FULL', 'ffmpegMissing']) a.ok(codes.includes(c), c);
  a.ok(codes.length >= 40, String(codes.length));
});

test('every public code has plain words in both languages, and the Chinese never shows English', () => {
  for (const code of publicCodes()) {
    const raw = 'raw ' + code + ' from ffmpeg: Unknown encoder';
    const zh = V.errorText('zh-CN', { code, params: PARAMS, message: raw }), en = V.errorText('en', { code, params: PARAMS, message: raw });
    a.equal(zh.code, code, code + ' is known');
    a.ok(zh.text && en.text, code);
    a.equal(englishIn(zh.text), null, code + ' zh: ' + zh.text);
    a.ok(!CJK.test(en.text), code + ' en: ' + en.text);
    a.equal(zh.detail, '', code + ': a known code never brings back the raw error');
    a.ok(!zh.text.includes(raw) && !en.text.includes(raw), code);
  }
});

test('an error without a code: plain words first, the raw text only as small print; a full disk is recognized', () => {
  const raw = "ffmpeg encode failed: Unknown encoder 'libx264'";
  for (const err of [new Error(raw), raw, { error: raw }]) {
    const r = V.errorText('zh-CN', err);
    a.equal(englishIn(r.text), null, r.text);
    a.equal(r.detail, raw);
    a.ok(V.errorText('zh-CN', err).label, 'the small print has a label in the interface language');
  }
  const disk = V.errorText('zh-CN', new Error('ffmpeg exited: No space left on device'));
  a.equal(disk.code, 'DISK_FULL'); a.equal(disk.detail, '');
  // an unknown code is not shown as if it were a sentence
  const odd = V.errorText('zh-CN', { code: 'SOMETHING_NEW', message: 'boom' });
  a.equal(englishIn(odd.text), null); a.equal(odd.detail, 'boom');
  a.equal(V.errorText('en', null).detail, '');
  // what was being done, when the error has no sentence: that sentence, with the raw error as small print
  const ex = V.errorText('zh-CN', new Error(raw), 'EXPORT_FAILED');
  a.equal(ex.text, V.errorText('zh-CN', { code: 'EXPORT_FAILED' }).text); a.equal(ex.detail, raw);
  a.equal(V.errorText('zh-CN', { code: 'DISK_FULL' }, 'EXPORT_FAILED').detail, '', 'a code with a sentence wins over the fallback');
});

test('export results: never 「导出好了」 when nothing was exported; numbers for both kinds; a reason when given', () => {
  const s = (o, l = 'zh-CN') => V.exportResult(l, o);
  a.ok(!/导出好了/.test(s({ done: 0, failed: 3 })), s({ done: 0, failed: 3 }));
  a.match(s({ done: 0, failed: 3 }), /3/);
  a.match(s({ done: 2, failed: 1 }), /2[^]*1/);
  a.match(s({ done: 3, failed: 0 }), /3/);
  a.ok(!/没/.test(s({ done: 3, failed: 0 })));
  const why = V.errorText('zh-CN', { code: 'DISK_FULL' }).text;
  a.ok(s({ done: 0, failed: 3, why }).includes(why), 'the reason is said with the result');
  for (const o of [{ done: 0, failed: 1 }, { done: 0, failed: 3 }, { done: 2, failed: 1 }, { done: 1, failed: 0 }, { done: 4, failed: 0, warned: 1 }]) {
    a.equal(englishIn(s(o)), null, s(o));
    a.ok(!CJK.test(s(o, 'en')), s(o, 'en'));
    a.notEqual(s(o, 'en'), '');
  }
  a.notEqual(s({ done: 0, failed: 1 }, 'en'), s({ done: 0, failed: 3 }, 'en'));
});

test('the page says failures through errorText: no English status, toast or raw error in the export queue', () => {
  a.match(fnBody(app, 'function sayError('), /MontClipView\.errorText\(/);
  a.match(fnBody(app, 'function alertExportFailure('), /sayError\(/, 'a failed export is said in plain words');
  a.ok(!/alert\(uiText\("own\.export-failed-prefix"\) \+ msg\)/.test(app), 'never the raw message after 导出失败：');
  const queue = fnBody(app, 'function renderQueue(');
  a.ok(!/`Failed: /.test(queue), 'no English "Failed:"');
  a.match(queue, /errorText\(/);
  a.match(queue, /xq-detail/, 'a raw error, when there is one, is small print');
  const run = fnBody(app, 'async function runQueue(');
  a.ok(!/Export queue: /.test(run), 'no English summary toast');
  a.match(run, /MontClipView\.exportResult\(/);
  a.match(run, /code: "EXPORT_TIMELINE_CHANGED"/);
  const done = fnBody(app, 'function autoDoneHtml(');
  a.match(done, /MontClipView\.exportResult\(/);
  a.ok(!/"as-done-title"/.test(done), 'the old 「导出好了，{n} 条」 title is gone');
  // the raw error goes to the log
  a.match(fnBody(app, 'function sayError('), /console\.warn\(/);
});

test('the auto-slices page keeps its state when the project only now gets an id (VV: 「导出好了，0 条」 after a failed export)', () => {
  const src = fnBody(app, 'function autoState(');
  const AUTO = { st: null }, runtime = { projectId: null };
  const autoState = new Function('AUTO', 'runtime', 'MontClipAutoSlices', src + '; return autoState;')(AUTO, runtime, { DEFAULTS: { count: 5, len: 'song' } });
  const st = autoState(); st.exportIds = ['q1'];
  runtime.projectId = 'p_1';          // placing the slices saved a version: the same project now has an id
  a.deepEqual(autoState().exportIds, ['q1']);
  a.equal(autoState().projectId, 'p_1');
  runtime.projectId = 'p_2';          // another project: a fresh page
  a.equal(autoState().exportIds, null);
});
