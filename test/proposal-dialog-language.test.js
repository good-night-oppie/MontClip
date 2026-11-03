'use strict';
// JJ (2026-11-03, review of #71): the selection / proposal dialog showed 「中文 / English」 side by side in its title, intro,
// range label, hints and errors. A streamer who picked Chinese should see Chinese only, and English only in English.
// Every sentence of the dialog (and the queue's refusal of a slice) is a uiText key now; the window check is in
// desktop/keep-ranges-smoke.cjs (the dialog opened in both languages).
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const View = require('../ui-preferences'), Plan = require('../range-plan');
const CJK = /[　-〿㐀-鿿＀-￯]/;
// English words in a Chinese string: anything but the placeholders, SRT and AI (main's own.sd-busy-save says 「AI 的建议」)
const latin = (s) => s.replace(/\{\w+\}/g, '').replace(/\b(SRT|AI)\b/g, '').match(/[A-Za-z]{2,}/g);
const body = (src, head) => { const at = src.indexOf(head); a.ok(at >= 0, head); let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; } return src.slice(at, i + 1); };
// main (#36) says the sentence dialog in own.sd-* and range-plan refusals in own.rp-*; #71 adds the by-time wording (own.ssel-*)
const KEYS = Object.keys(View.text.en).filter((k) => /^own\.(ssel|sd|rp)-/.test(k));

test('the dialog keys exist in both languages; the Chinese has no English words, the English no Chinese', () => {
  a.ok(KEYS.filter((k) => k.startsWith('own.ssel-')).length >= 10 && KEYS.length >= 30, 'dialog keys: ' + KEYS.length);
  for (const k of KEYS) {
    const zh = View.text['zh-CN'][k], en = View.text.en[k];
    a.ok(zh && en, k);
    a.equal(latin(zh), null, k + ' (zh): ' + zh);
    a.ok(!CJK.test(en), k + ' (en): ' + en);
  }
});
test('the dialog writes no sentence of its own: no Chinese literal, no 「 / 」 pairs, every text through uiText', () => {
  for (const f of ['app.js', 'docs/demo/app.js']) {
    const src = read(f), fn = body(src, 'async function showSentenceSelection(');
    a.ok(!CJK.test(fn.replace(/\/\/[^\n]*/g, '')), f + ': a Chinese literal is left in showSentenceSelection');
    a.ok(!/"[^"\n]* \/ [^"\n]*"|`[^`\n]* \/ [^`\n]*`/.test(fn), f + ': a 「中文 / English」 string is left');
    for (const k of ['sd-title', 'ssel-title-ranges', 'ssel-title-slices', 'ssel-label-time', 'ssel-sum-ranges', 'ssel-sum-cut', 'sd-changed', 'ssel-done-ranges'])
      a.ok(fn.includes('"own.' + k + '"'), f + ' uses ' + k);
    a.match(fn, /"own\.rp-" \+ error\.code/, f + ': refusals by their code');
    const queue = body(src, 'async function runQueue(');
    a.ok(!CJK.test(queue), f + ': the queue refusal is a key too');
    a.match(queue, /uiText\("own\.ssel-queue-changed"\)/, f);
  }
});
test('JJ\'s wording', () => {
  const zh = (k, v) => View.t('zh-CN', 'own.' + k, v), en = (k, v) => View.t('en', 'own.' + k, v);
  a.equal(zh('ssel-title-ranges'), '按时间保留几段，拼成一条');
  a.equal(zh('ssel-title-slices'), '按时间切成多条');
  a.equal(zh('ssel-label-time'), '要留下的时间段（秒）');
  a.equal(zh('ssel-sum-ranges', { ranges: '0:02–0:06 → 0:10–0:14', duration: '0:08' }), '0:02–0:06 → 0:10–0:14 拼起来一共 0:08，按你勾选的顺序。');
  a.equal(zh('ssel-sum-cut', { cut: 2 }), '有 2 句字幕只剪进去一半，请听一下开头和结尾。');
  a.match(en('ssel-sum-cut', { cut: 2 }), /^2 captions .*(start|beginning) and (the )?end/);
  a.ok(!/Boundary captions need checking/.test(en('ssel-sum-cut', { cut: 2 })));
  a.match(zh('ssel-queue-changed'), /这条切片没有导出。请让助手按现在的时间线再给一次剪辑建议。$/);
  a.ok(!zh('ssel-queue-changed').includes('请重新生成'));
  a.equal(zh('ssel-intro-slices', { n: 3 }), '每段单独成一条切片、一个文件。应用后时间线上只留下这些片段（可以撤销），再把 3 条切片加进导出队列，由你点「开始」。原片不变。');
});
// JJ's re-review (documents/2026-11-03-MontClip-PR71-74-75-77-复审-JJ.md): the by-time dialog's refusals in plain words.
// After main's #36 the sentence dialog says these with own.sd-* / own.rp-* (JJ's #36 final, which mentions 按句选段), so the
// by-time dialog has its own six; 按句选段 keeps #36's. Locked stays rp-locked (JJ: 可以保留).
const BY_TIME = {
  'ssel-err-ranges-line': '每行写一段：开始秒数,结束秒数，比如 12,30。',
  'ssel-err-ranges-invalid': '这几段的时间不对：每段的结束要比开始晚，段和段不能重叠。',
  'ssel-err-ranges-past-end': '有一段超过了时间线的结尾，请改短一点。',
  'ssel-err-ranges-nested': '这几段里有套在一起、绑在一起或调过速度的片段，自动剪不了，请先手动剪。',
  'ssel-err-ranges-too-short': '有一段太短，剪不出来，请把它拉长一点。',
  'ssel-changed': '项目刚改过，请关掉这个窗口，再选一次。',
};
test("JJ's re-review: the by-time dialog's six refusals", () => {
  for (const [k, zh] of Object.entries(BY_TIME)) {
    a.equal(View.t('zh-CN', 'own.' + k), zh, k);
    const en = View.t('en', 'own.' + k);
    a.ok(en && !CJK.test(en) && !/按句|Select sentences/i.test(en), k + ' (en): ' + en);
  }
  for (const f of ['app.js', 'docs/demo/app.js']) {
    const fn = body(read(f), 'async function showSentenceSelection(');
    for (const k of Object.keys(BY_TIME)) a.ok(fn.includes('"own.' + k + '"'), f + ' uses ' + k);
    // the sentence dialog keeps #36's keys
    for (const k of ['sd-range-line', 'sd-changed']) a.ok(fn.includes('"own.' + k + '"'), f + ' keeps ' + k);
  }
  // each code the by-time dialog can meet maps to its sentence; the rest (locked, source-loop …) to main's own.rp-*
  const fn = body(read('app.js'), 'async function showSentenceSelection(');
  for (const [code, k] of [['invalid', 'invalid'], ['exceeds', 'past-end'], ['nested', 'nested'], ['short-media', 'too-short']])
    a.match(fn, new RegExp('"?' + code + '"?: "own\\.ssel-err-ranges-' + k + '"'), code);
});

test('the joined length reads 0:32, not 12.34 s', () => {
  const fn = body(read('app.js'), 'async function showSentenceSelection(');
  a.ok(!/toFixed\(2\)\} s/.test(fn), 'no "12.34 s"');
  a.match(fn, /duration: clock\(Math\.round\(plan\.duration\)\)/);
});
test('range-plan refusals carry a code, and each code has its sentence in both languages', () => {
  const doc = { clips: [{ id: 'v', kind: 'video', mediaId: 'm', track: 'V1', start: 0, in: 0, duration: 10, props: {} }], media: [{ id: 'm', duration: 10 }] };
  const code = (d, r) => { try { Plan.create(d, r); } catch (e) { return e.code; } return null; };
  const seen = [
    code(doc, []),
    code(doc, [{ from: 0, to: 20 }]),
    code({ ...doc, lockedTracks: ['V1'] }, [{ from: 0, to: 2 }]),
    code({ ...doc, clips: [{ ...doc.clips[0], kind: 'comp' }] }, [{ from: 0, to: 2 }]),
  ];
  a.deepEqual(seen, ['invalid', 'exceeds', 'locked', 'nested'], "main's codes (#36)");
  for (const c of [...seen, 'short-media']) {
    const k = 'own.rp-' + c;
    a.ok(View.text.en[k] && View.text['zh-CN'][k], k);
  }
});
