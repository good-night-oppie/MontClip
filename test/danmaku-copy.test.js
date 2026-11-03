'use strict';
// JJ (8 PRs, documents/2026-11-03-MontClip-8个PR文案确认-JJ.md, sha256 3adc874a…) and Deja: three danmaku sentences in
// plain words, 录播 → 录像 like the rest of the interface (录播姬, the recorder's name, stays), and dm-bad says which file
// to pick.
const test = require('node:test'), a = require('node:assert/strict');
const V = require('../ui-preferences');
const zh = (k) => V.t('zh-CN', 'own.' + k), en = (k) => V.t('en', 'own.' + k);

test("JJ (8 PRs): the three danmaku sentences", () => {
  a.equal(zh('dm-import-title'), '给选中片段所在的那场录像导入弹幕（录播姬或 B 站的 .xml 文件）');
  a.equal(zh('dm-pick-clip'), '先在时间线上选中这场录像的片段，再导入弹幕。');
  a.equal(zh('dm-bad'), '这不是录播姬或 B 站的弹幕文件。录播姬的话，选录像旁边那个同名的 .xml 文件。');
  a.equal(en('dm-import-title'), "Import danmaku for the recording of the selected clip (a BililiveRecorder or Bilibili .xml file)");
  a.equal(en('dm-pick-clip'), "Select a clip of this recording on the timeline first, then import the danmaku.");
  a.equal(en('dm-bad'), "This is not a BililiveRecorder or Bilibili danmaku file. For BililiveRecorder, pick the .xml file with the same name next to the recording.");
});
test('no danmaku text says 录播 (only the recorder\'s name 录播姬)', () => {
  for (const [k, s] of Object.entries(V.text['zh-CN'])) if (k.startsWith('own.dm-'))
    a.ok(!/录播(?!姬)/.test(s), k + ': ' + s);
});
test('the English names the recorder in English (BililiveRecorder), never in Chinese', () => {
  for (const [k, s] of Object.entries(V.text.en)) if (k.startsWith('own.dm-')) a.ok(!/[一-鿿]/.test(s), k + ': ' + s);
});
