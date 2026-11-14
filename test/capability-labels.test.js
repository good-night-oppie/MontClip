'use strict';
// JJ (2026-11-03, review of #74): the capability table's sentences are what a streamer reads in the approval box and the
// plan list, so they say it plainly, and an internal name (fablecut_xxx) never reaches the screen. The approval box and
// the plan list come later (docs/decisions/2026-11-03-unified-backend-architecture.md); Capabilities.label() is what
// they show, and it only ever gives the table's sentence.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Cap = require('../shared/capabilities'), View = require('../shared/ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const INTERNAL = /fablecut_|\b[a-z]+_[a-z_]+\b/;

test('JJ\'s plain sentences', () => {
  const zh = (n) => Cap.get(n).summary['zh-CN'];
  a.equal(zh('fablecut_reframe'), '做一份竖屏或方形的版本，画面跟着人走');
  a.equal(zh('fablecut_proxy'), '做或删掉预览用的小文件，让预览更流畅');
  a.equal(zh('fablecut_track'), '跟着画面里的人或物体动，让马赛克、贴纸也跟着它走');
  a.equal(zh('fablecut_beats'), '找出音乐的节拍，按拍子剪');
  a.equal(zh('fablecut_normalize_audio'), '把几段的音量调得一样大');
  a.equal(zh('fablecut_danmaku'), '给一场录像导入录播姬或 B 站的弹幕文件，也可以移除已经导入的弹幕');
});
test('label() gives the plain sentence in the interface language, never an internal name', () => {
  for (const c of Cap.list()) for (const language of ['zh-CN', 'en']) {
    const s = Cap.label(c.name, language);
    a.equal(s, c.summary[language], c.name + ' ' + language);
    a.ok(!INTERNAL.test(s), c.name + ' ' + language + ': ' + s);
  }
  a.equal(Cap.label('fablecut_reframe', 'fr'), Cap.get('fablecut_reframe').summary.en, 'another language falls back to English');
  for (const name of ['fablecut_not_a_tool', 'rm_rf', '__proto__', '', null, 42]) for (const language of ['zh-CN', 'en']) {
    const s = Cap.label(name, language);
    a.ok(s && !INTERNAL.test(s) && !(typeof name === 'string' && name && s.includes(name)), String(name) + ': ' + s);
  }
});
test("JJ's re-review: an unknown operation says the AI asked, it was blocked, nothing changed", () => {
  for (const name of ['fablecut_not_a_tool', null]) {
    a.equal(Cap.label(name, 'zh-CN'), 'AI 想做一件软件不认识的操作，已经拦下，什么都没改。');
    a.equal(Cap.label(name, 'en'), "The AI asked for an action MontClip doesn't know. It was blocked; nothing changed.");
  }
});
test('no interface text names a capability by its internal name', () => {
  for (const language of ['zh-CN', 'en']) for (const [k, s] of Object.entries(View.text[language]))
    a.ok(!/fablecut_/.test(s), k + ' (' + language + '): ' + s);
  for (const f of ['app/app.js', 'app/agent-pane.js', 'agent-ui/pane.tsx'])
    a.ok(!/\$\{[^}]*\.capability\}|textContent\s*=\s*[^;\n]*\.capability\b/.test(read(f)), f + ' shows an event\'s capability name');
});
test('the version kept before the AI\'s edits is named in the interface language only', () => {
  a.equal(View.t('zh-CN', 'own.before-ai'), 'AI 改之前');
  a.equal(View.t('en', 'own.before-ai'), 'Before AI changes');
  for (const f of ['app/app.js', 'docs/demo/app/app.js']) {
    const src = read(f);
    a.ok(!src.includes('AI 开始前 / Before the AI run'), f);
    a.match(src, /action:'before_agent',name:uiText\('own\.before-ai'\)/, f);
  }
  a.ok(read('server/history.js').includes('"Before AI changes"'), 'the server\'s own default (no language) reads the same in English');
});
