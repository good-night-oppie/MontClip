'use strict';
// 中文第五批 (Deja, 2026-11-03): the ripple-delete button's tooltip was still English in the Chinese interface (it had no
// data-i18n-title). It now has its own term row; simple mode still strips its (⇧Del) the way #55 does, in both languages.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../shared/ui-preferences');
const html = fs.readFileSync(path.join(__dirname, '..', 'app/index.html'), 'utf8');
const EN = 'Ripple delete (⇧Del): delete the selected clips; later clips on the same track move up to close the gap.';
const ZH = '波纹删除（⇧Del）：删掉选中的片段，同一条轨道上后面的片段自动往前挪，不留空隙。';

test('btnRippleDelete has a translated tooltip, both languages', () => {
  const tag = /<button[^>]*id="btnRippleDelete"[^>]*>/.exec(html)[0];
  a.match(tag, /\stitle="Ripple delete \(⇧Del\): delete the selected clips; later clips on the same track move up to close the gap\."/, 'the English title stays');
  a.match(tag, /\sdata-i18n-title="term\.ripple-delete-selection-del"/);
  a.equal(V.t('en', 'term.ripple-delete-selection-del'), EN);
  a.equal(V.t('zh-CN', 'term.ripple-delete-selection-del'), ZH);
});

test('simple mode drops the held-back (⇧Del) from it in both languages, and keeps the rest', () => {
  a.equal(V.stripBlockedHints(EN), 'Ripple delete: delete the selected clips; later clips on the same track move up to close the gap.');
  a.equal(V.stripBlockedHints(ZH), '波纹删除：删掉选中的片段，同一条轨道上后面的片段自动往前挪，不留空隙。');
});

test('no button with a title is left without its Chinese', () => {
  // every <button … title="…"> in the page's static markup carries data-i18n-title (or is a known exception)
  const missing = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((t) => /\stitle="/.test(t) && !/data-i18n-title=/.test(t))
    .map((t) => (/id="([^"]+)"/.exec(t) || [, t.slice(0, 60)])[1]);
  a.ok(!missing.includes('btnRippleDelete'), 'btnRippleDelete');
});
