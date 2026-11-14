'use strict';
/* Test first (red on #148's f2eedb3b), then implementation. 插件试用 P7, JJ's wording, Deja's rules (2026-11-05): Chinese
   left in the English interface.
   1. The default project name: stored names stay as they are; a stored default (未命名项目, or "Untitled Project" from an
      older project) reads 未命名项目 in Chinese and "Untitled project" in English; a new English project is stored as
      "Untitled project". An export never takes a default name: first media name → MontClip, then the date.
   2. The empty Inspector, in English: "Select a clip to edit its picture, effects and audio." (Chinese unchanged).
   The page itself is rendered in desktop/zh-batch7-smoke.cjs. */
const test = require('node:test'), a = require('node:assert/strict');
const V = require('../shared/ui-preferences'), D = require('../shared/delivery');

test('the default names: Untitled project (lower-case p) for a new English project; all three read as defaults', () => {
  a.equal(V.defaultProjectName('en'), 'Untitled project');
  a.equal(V.defaultProjectName('zh-CN'), '未命名项目');
  for (const n of ['未命名项目', 'Untitled Project', 'Untitled project']) a.ok(V.isDefaultProjectName(n), n);
  for (const n of ['未命名项目 2', 'untitled project', 'My stream', '', null]) a.ok(!V.isDefaultProjectName(n), String(n));
});

test('a stored default name is shown in the interface language; any other name as it is', () => {
  a.equal(typeof V.projectName, 'function');
  for (const n of ['未命名项目', 'Untitled Project', 'Untitled project']) {
    a.equal(V.projectName('zh-CN', n), '未命名项目', n + ' zh');
    a.equal(V.projectName('en', n), 'Untitled project', n + ' en');
  }
  for (const n of ['直播回放 11-05', 'Untitled Project copy', 'My stream']) for (const l of ['zh-CN', 'en']) a.equal(V.projectName(l, n), n);
});

test('an export never takes a default project name: first media name, else MontClip, then the date', () => {
  a.equal(typeof V.exportProjectName, 'function');
  const day = new Date(2026, 10, 5);
  for (const n of ['未命名项目', 'Untitled Project', 'Untitled project', '', null]) {
    a.equal(V.exportProjectName(n, ['回放 0105.mp4', 'b.wav'], day), '回放 0105 11-05', JSON.stringify(n) + ': the first media');
    a.equal(V.exportProjectName(n, [], day), 'MontClip 11-05', JSON.stringify(n) + ': no media');
    a.equal(V.exportProjectName(n, ['', '  '], day), 'MontClip 11-05', JSON.stringify(n) + ': media without a name');
    for (const l of ['zh-CN', 'en']) {
      const file = D.fileSafeName(V.exportProjectName(n, ['回放.mp4'], day), V.exportFallback(l, 'export', day));
      a.ok(!/未命名项目|Untitled/i.test(file), l + ': ' + file);
    }
  }
  // a project of its own name keeps it, with no date added
  a.equal(V.exportProjectName('直播回放', ['a.mp4'], day), '直播回放');
  a.equal(V.exportProjectName('Untitled Project copy', ['a.mp4'], day), 'Untitled Project copy');
});

test('the empty Inspector says JJ\'s English; the Chinese stays', () => {
  a.equal(V.t('en', 'own.inspector-empty'), 'Select a clip to edit its picture, effects and audio.');
  a.equal(V.t('zh-CN', 'own.inspector-empty'), '选中一个片段以编辑它的画面、特效与音频。');
});
