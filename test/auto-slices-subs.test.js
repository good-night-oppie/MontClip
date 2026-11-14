'use strict';
// v10 (Deja, 2026-11-03; frozen 交互说明-v10.md sha256 a4c4e3d8…, 原型-v10.html 6cd20e5c…; JJ 听写文案定稿 v2 72479a4b…, section two):
// subtitles in 「✨ 自动出切片」.
// - 更多设置 › 字幕 shows the state only (本机已装 / 还没装〔去装〕; cloud does not exist yet); the way of transcribing is
//   chosen on the setup page and in Settings › 听写 (#70), not here.
// - 正在找 · 第 2 步 has 「听写成文字」 in three wordings; the export confirmation says when there will be no subtitles;
//   a song card says how many sentences were transcribed.
// - With subtitles on and the model installed, the recordings are transcribed in step 2 and placing (or exporting) adds
//   caption clips over the placed slices only, in the same undo step. Behaviour: desktop/auto-slices-smoke.cjs.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const V = require('../shared/ui-preferences'), zh = (k, v) => V.t('zh-CN', 'own.' + k, v);

test('JJ v2 section two, word for word', () => {
  a.equal(zh('as-subs'), '字幕');
  a.equal(zh('as-sub-local'), '加字幕（在这台电脑上听写，声音不发出去）');
  a.equal(zh('as-sub-none'), '加字幕（还没装听写）');
  a.equal(zh('as-sub-go'), '去装');
  a.equal(zh('as-sub-none-hint'), '找高光照样能用，只是这次不出字幕。');
  a.equal(zh('as-run-listen'), '听写成文字（字幕要用）：1 小时录像通常要几分钟');
  a.equal(zh('as-run-listen-none'), '听写成文字：这台电脑还没装听写，先跳过，不影响找高光');
  a.equal(zh('as-run-listen-off'), '听写成文字：你选了不加字幕，跳过');
  a.equal(zh('as-ex-nosub'), '这次没有字幕：这台电脑还没装听写。成片照样能导出。要字幕的话，到「设置 › 听写」装上（要联网下载一次，约 230 MB），再回来导出。');
  a.equal(zh('as-sub-line', { n: 23 }), '字幕：23 句，是听写出来的，唱歌部分可能有错字');
});
test('the state comes from #70 (asrReady / openAsrSetup) where it is there; without it: not installed, no 〔去装〕', () => {
  const app = read('app/app.js');
  a.match(app, /function autoSubMode\(\) \{ return typeof asrReady === "function" && asrReady\(\) \? "local" : "none"; \}/);
  a.match(app, /typeof openAsrSetup === "function"/);
  a.match(app, /data-as-subs/);
  a.ok(!/as-sub-cloud/.test(app), 'no cloud state until cloud transcription exists');
});
test('step 2 lists 「听写成文字」 second, in the wording for the state', () => {
  const app = read('app/app.js'), fn = app.slice(app.indexOf('function autoRunHtml('), app.indexOf('async function autoRun('));
  a.match(fn, /const steps = \["read", "listen", "hot", "songs", "pick"\];/);
  a.match(fn, /as-run-listen-off/); a.match(fn, /as-run-listen-none/);
});
test('the export confirmation says there will be no subtitles when they are wanted and the model is not installed', () => {
  const app = read('app/app.js'), fn = app.slice(app.indexOf('function autoExportConfirm('), app.indexOf('function autoExport('));
  a.match(fn, /st\.subs && autoSubMode\(\) === "none"/); a.match(fn, /as-ex-nosub/);
});
test('placing adds captions over the placed slices only, in the same undo step, never replacing captions elsewhere', () => {
  const app = read('app/app.js'), fn = app.slice(app.indexOf('function placeAutoSlices('), app.indexOf('function undoAutoSlices('));
  a.ok(fn.indexOf('autoPlaceCaptions(') > fn.indexOf('pushUndo('), 'after the one undo snapshot');
  const cap = app.slice(app.indexOf('function autoPlaceCaptions('), app.indexOf('\n}\n', app.indexOf('function autoPlaceCaptions(')));
  a.ok(cap.length > 0 && !/pushUndo\(/.test(cap), 'no undo step of its own');
  a.ok(!/project\.clips\s*=\s*project\.clips\.filter/.test(cap), 'captions already there stay');
});
