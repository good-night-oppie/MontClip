'use strict';
// #212 (JJ's final words): the mode the streamer sees as 「Yolo」 is called 全自动 / Full auto. Only the words she sees change;
// the internal ids (mode 'yolo', modeYolo, yoloOn, ap-yolo-on, confirmYolo, mcYoloMark, .mc-yolo-mark) stay as they were.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const View = require('../ui-preferences'), P = require('../agent-policy'), { yoloText } = require('../desktop/agent-mode-text');
const own = require('../agent-ui/montclip-strings.json');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const T = (l, k) => View.text[l]['officialPane_' + k];

test('every line in #212, word for word, zh-CN and en', () => {
  a.equal(T('zh-CN', 'modeYolo'), '全自动');
  a.equal(T('en', 'modeYolo'), 'Full auto');
  a.equal(T('zh-CN', 'modeYoloTip'), '每一步都直接做，不问你；往外发的内容照样先给你看。打开前会再确认一次。');
  a.equal(T('en', 'modeYoloTip'), "Does every step without asking you; anything sent out is still shown to you first. You'll be asked once more before it turns on.");
  a.equal(T('zh-CN', 'yoloOn'), '全自动开着：AI 每一步都直接做，不问你；往外发的内容照样先给你看。');
  a.equal(T('en', 'yoloOn'), 'Full auto is on: the AI does every step without asking you; anything sent out is still shown to you first.');
  a.equal(T('zh-CN', 'modeDeclined'), '没有打开全自动。');
  a.equal(T('en', 'modeDeclined'), 'Full auto was not turned on.');
  a.equal(View.t('zh-CN', 'own.ap-yolo-on'), '全自动开着');
  a.equal(View.t('en', 'own.ap-yolo-on'), 'Full auto is on');
  a.equal(View.t('zh-CN', 'own.pl-plan-mode'), '计划模式只出计划。要执行的话，在助手顶部换成手动、自动或全自动。');
  a.equal(View.t('en', 'own.pl-plan-mode'), 'Plan mode only makes plans. To carry it out, switch to Manual, Auto or Full auto at the top of the assistant.');
  // the host's own box before it turns on
  const zh = yoloText('zh-CN'), en = yoloText('en');
  a.equal(zh.title, '打开全自动？');
  a.equal(en.title, 'Turn on Full auto?');
  a.equal(zh.message, '打开以后，AI 的每一步都直接做，不再问你。');
  a.equal(en.message, 'With Full auto on, the AI does every step straight away, without asking you.');
  a.deepEqual(zh.buttons, ['取消', '打开全自动']);
  a.deepEqual(en.buttons, ['Cancel', 'Turn on Full auto']);
  // Cindy's mode selector (montclip-strings.json, built into cindy-official.js)
  const label = (l) => own[l].newChat.permissionSelector.modes['claude-code'].bypassPermissions.label;
  a.equal(label('zh-CN'), '全自动');
  a.equal(label('en'), 'Full auto');
  a.match(read('cindy-official.js'), /bypassPermissions:\{label:"Full auto"/, 'the bundle was rebuilt');
  // the top bar's mark before the page fills in its words, and the playground copy
  for (const f of ['index.html', 'docs/demo/index.html'])
    a.match(read(f), /<span class="mc-yolo-mark" id="mcYoloMark" role="status" hidden data-i18n="own\.ap-yolo-on">全自动开着<\/span>/, f);
  // ap-applied's {mode} takes the mode's name: 「全自动模式」 / "Full auto mode"
  a.equal(P.modeLabel('yolo', 'zh-CN'), '全自动');
  a.equal(P.modeLabel('yolo', 'en'), 'Full auto');
  a.equal(View.t('zh-CN', 'own.ap-applied', { mode: P.modeLabel('yolo', 'zh-CN') }), '已按 AI 的建议改好，没有问你（全自动模式）。可以撤销。');
  a.equal(View.t('en', 'own.ap-applied', { mode: P.modeLabel('yolo', 'en') }), 'Done as the AI suggested, without asking (Full auto mode). Undo is available.');
});

test('no 「Yolo」, in any casing, in the words the streamer sees, zh-CN and en', () => {
  for (const l of ['zh-CN', 'en']) {
    for (const [k, v] of Object.entries(View.text[l])) a.doesNotMatch(String(v), /yolo/i, l + ' ' + k);
    a.doesNotMatch(JSON.stringify(own[l]), /yolo/i, 'montclip-strings.json ' + l);
    a.doesNotMatch(JSON.stringify(yoloText(l === 'en' ? 'en' : 'zh-CN')), /yolo/i, 'agent-mode-text.js ' + l);
    for (const m of P.MODES) a.doesNotMatch(P.modeLabel(m, l), /yolo/i, 'agent-policy.js ' + l + ' ' + m);
  }
  const shown = read('index.html').replace(/<[^>]*>/g, ' ');
  a.doesNotMatch(shown, /yolo/i, 'index.html text');
});

test('「往外发的内容照样先给你看」 stays in the mode tip and the bar', () => {
  for (const k of ['modeYoloTip', 'yoloOn']) {
    a.ok(T('zh-CN', k).includes('往外发的内容照样先给你看'), 'zh-CN ' + k);
    a.ok(T('en', k).includes('anything sent out is still shown to you first'), 'en ' + k);
  }
});

test('the internal ids are untouched', () => {
  a.ok(P.MODES.includes('yolo'));
  for (const k of ['modeYolo', 'modeYoloTip', 'yoloOn']) for (const l of ['zh-CN', 'en']) a.ok(T(l, k), l + ' ' + k);
  a.ok(View.t('zh-CN', 'own.ap-yolo-on') !== 'own.ap-yolo-on');
  a.match(read('desktop/main.js'), /async confirmYolo\(\)/);
  a.match(read('agent-ui/pane.tsx'), /yolo:'Yolo'\}/, 'MODE_KEY still finds modeYoloTip');
});
