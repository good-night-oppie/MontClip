'use strict';
// JJ, review of #36 9001f793 (2026-11-02): three lines to change before merging and one in passing; the
// summary shows the final length as mm:ss (h:mm:ss from an hour), the same as the Agent pane's durationText.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const zh = V.text['zh-CN'], en = V.text.en;

test("JJ's wording, verbatim", () => {
  a.equal(zh['own.rp-short-media'], '选中的片段太短，剪不出来。请把起点和终点拉开一点。');
  a.equal(en['own.rp-short-media'], 'The selected piece is too short to cut. Move the start and end further apart.');
  a.equal(zh['own.rp-source-changed'], '选好之后字幕的时间又变了。请关掉这个窗口，重新选一次。');
  a.equal(en['own.rp-source-changed'], 'The subtitle timing changed after you selected. Close this and select again.');
  a.equal(zh['own.sd-summary'], '{ranges} → 成片约 {duration}，按勾选顺序。');
  a.ok(/\{duration\}/.test(en['own.sd-summary']) && /\{ranges\}/.test(en['own.sd-summary']));
  a.equal(zh['own.map-no-media'], '这个项目里没有音视频，导不出时间对照表。');
  a.ok(en['own.map-no-media'] && !/[一-鿿]/.test(en['own.map-no-media']));
});

test('durationText: mm:ss under an hour, h:mm:ss from an hour (the Agent pane\'s cases)', () => {
  const d = V.durationText;
  a.equal(d(1), '00:01'); a.equal(d(83.4567), '01:23'); a.equal(d(0.2), '00:01'); a.equal(d(3725), '1:02:05');
  a.equal(d(59.6), '01:00'); a.equal(d(3599.4), '59:59'); a.equal(d(3600), '1:00:00');
  a.equal(d(0), ''); a.equal(d(NaN), '');
});

test('the dialog summary uses durationText for {duration}', () => {
  const at = app.indexOf('async function showSentenceSelection()'), body = app.slice(at, app.indexOf('\n}\n', at));
  a.match(body, /uiText\("own\.sd-summary", \{ ranges: [\s\S]*?, duration: MontClipView\.durationText\(plan\.duration\) \}\)/);
  a.equal(V.t('zh-CN', 'own.sd-summary', { ranges: '00:00:04–00:01:05', duration: V.durationText(83.4) }), '00:00:04–00:01:05 → 成片约 01:23，按勾选顺序。');
});
