'use strict';
// JJ's final copy for #36 (documents/2026-11-03-MontClip-PR36-按句选段与报错文案-JJ.md, sha256 50d0bced…): the sentence dialog,
// its refusals and the server error codes. sd-busy / sd-busy-save from the file's last section. English passes as it was,
// except the title, which takes the button's name (Select sentences).
const test = require('node:test'), a = require('node:assert/strict');
const V = require('../ui-preferences');
const zh = (k) => V.text['zh-CN']['own.' + k], en = (k) => V.text.en['own.' + k];

test("JJ's final Chinese for the sentence dialog", () => {
  a.equal(zh('sd-title'), '按句选段'); a.equal(en('sd-title'), 'Select sentences', 'the title is the button\'s name');
  a.equal(zh('sd-intro'), '只把勾选的句子接起来，其余部分从剪辑里去掉。原录像不会被改动，点一次撤销就能恢复。');
  a.equal(zh('sd-ranges'), '或者按先后顺序填时间段（单位：秒，每行一段，写成 起点,终点）。填了就不看勾选。');
  a.equal(zh('sd-range-line'), '每行写一段：起点,终点（单位：秒）。');
  a.equal(zh('rp-invalid'), '时间段不对：请按先后顺序填写，每段的起点要小于终点。');
  a.equal(zh('sd-no-captions'), '按句选段要用到字幕：先导入 SRT 字幕文件，或者先加字幕。');
  a.equal(zh('sd-summary'), '{ranges} → 成片大约 {duration}，按勾选的顺序接起来。');
  a.equal(zh('sd-partial'), '这一句只保留了一部分声音，请检查这一句的字幕和开头结尾。', 'one sentence: 这一句');
  a.equal(zh('sd-partial-many'), '{n} 句只保留了一部分声音，请检查这几句的字幕和开头结尾。');
  a.equal(zh('sd-changed'), '项目刚改过。请关掉这个窗口，重新选一次。');
  a.equal(zh('sd-done'), '已经接好了。不满意可以撤销。');
});

test("JJ's final busy messages (both languages)", () => {
  a.equal(zh('sd-busy'), '软件正在忙别的事，比如导出、导入、听写或保存。等它做完，再点一次「按句选段」。如果刚才保存没成功，先处理那条提示。');
  a.equal(en('sd-busy'), "MontClip is busy with something else, such as exporting, importing, transcribing or saving. When it's done, click Select sentences again. If a save just failed, deal with that message first.");
  a.equal(zh('sd-busy-save'), '现在还不能照 AI 的建议选段：软件正在忙别的事，比如导出、导入、听写或保存。等它做完，再点一次这条建议。如果刚才保存没成功，先处理那条提示。');
  a.equal(en('sd-busy-save'), "Can't select sentences as the AI suggested yet: MontClip is busy with something else, such as exporting, importing, transcribing or saving. When it's done, click this suggestion again. If a save just failed, deal with that message first.");
});

test("JJ's final range-engine refusals and server error codes", () => {
  a.equal(zh('rp-exceeds'), '选的时间超出了时间线的结尾。');
  a.equal(zh('rp-locked'), '有片段或轨道锁住了，先解锁再试。');
  a.equal(zh('rp-nested'), '这里有嵌套片段、绑定关系或变速，按句选段处理不了，请手动剪。');
  a.equal(zh('rp-source-loop'), '有片段比它的原文件还长，按句选段暂时处理不了。');
  a.equal(zh('err-offline'), '这一版不联网，不能从网址下载。请导入电脑里的文件。');
  a.equal(zh('err-headless-disabled'), '桌面版不能在后台打开浏览器做这件事。');
  a.equal(zh('err-editor-not-ready'), '编辑窗口还没准备好。先打开 MontClip 的编辑窗口，再试一次。');
  a.equal(zh('err-editor-no-accept'), '编辑窗口没接到这个任务。等它准备好，再试一次。');
});

test('passed as they were: preview / apply / cancel and the four other refusals', () => {
  a.equal(zh('sd-preview'), '试听选段'); a.equal(zh('sd-apply'), '保留选段'); a.equal(zh('sd-cancel'), '取消');
  a.equal(zh('rp-short-media'), '选中的片段太短，剪不出来。请把起点和终点拉开一点。');
});
