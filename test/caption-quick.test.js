'use strict';
// P5 (frozen design v10 ④; v7.2 numbers, v7.4 JJ's words, v7.5 two entries; Deja 11-03): caption size and position in
// one go. 中 = round(0.042 × the short side), 大 = 中 × 1.3, 小 = 中 × 0.8; 上面 / 下面 = ∓0.38 × the height. The
// existing clips' fontSize and y change, nothing is generated again, one undo step. The window check, both shapes and
// the undo compared clip by clip, is desktop/caption-quick-smoke.cjs.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const Q = require('../caption-quick'), V = require('../ui-preferences');
const zh = (k, v) => V.t('zh-CN', 'own.' + k, v), en = (k, v) => V.t('en', 'own.' + k, v);
const cap = (id, fontSize, y, extra = {}) => ({ id, kind: 'text', track: 'V3', start: 0, duration: 2, mediaId: null,
  props: { caption: true, text: '合成 ' + id, fontSize, y, x: 0, wordTimes: [[0, 1]], ...extra } });

test('the numbers: landscape and portrait both from the short side; positions from the height', () => {
  a.deepEqual(Q.sizes(1920, 1080), { small: 36, mid: 45, big: 59 });
  a.deepEqual(Q.positions(1920, 1080), { top: -410, bottom: 410 });
  a.deepEqual(Q.sizes(1080, 1920), { small: 36, mid: 45, big: 59 }, 'portrait: the short side is the width');
  a.deepEqual(Q.positions(1080, 1920), { top: -730, bottom: 730 });
  a.deepEqual(Q.sizes(1280, 720), { small: 24, mid: 30, big: 39 });
  a.deepEqual(Q.positions(1280, 720), { top: -274, bottom: 274 });
});

test('what the buttons show: one level when all match it, none (and "mixed") when they differ', () => {
  const s = Q.sizes(1920, 1080), p = Q.positions(1920, 1080);
  a.deepEqual(Q.current([cap('a', s.mid, p.bottom), cap('b', s.mid, p.bottom)], 1920, 1080), { size: 'mid', mixedSize: false, pos: 'bottom', mixedPos: false });
  a.deepEqual(Q.current([cap('a', s.big, p.top), cap('b', s.small, p.top)], 1920, 1080), { size: null, mixedSize: true, pos: 'top', mixedPos: false });
  a.deepEqual(Q.current([cap('a', 50, 300), cap('b', 50, 200)], 1920, 1080), { size: null, mixedSize: false, pos: null, mixedPos: true },
    'all the same but no level: nothing on, nothing mixed');
  a.deepEqual(Q.current([{ id: 'c', kind: 'text', props: { caption: true } }], 1920, 1080).mixedSize, false, 'missing props read as the defaults');
});

test('apply: every clip gets the size (or the position), the ones adjusted one by one too; nothing else changes', () => {
  const clips = [cap('a', 45, 410), cap('b', 80, -100, { color: '#ff0' }), cap('c', 30, 410)];
  const before = JSON.parse(JSON.stringify(clips));
  a.deepEqual(Q.apply(clips, 'size', 'big', 1920, 1080), { changed: 3, skipped: 0 });
  a.deepEqual(clips.map((c) => c.props.fontSize), [59, 59, 59]);
  a.deepEqual(Q.apply(clips, 'pos', 'top', 1920, 1080), { changed: 3, skipped: 0 });
  a.deepEqual(clips.map((c) => c.props.y), [-410, -410, -410]);
  for (let i = 0; i < clips.length; i++) {
    const { fontSize, y, ...rest } = clips[i].props, { fontSize: f0, y: y0, ...rest0 } = before[i].props;
    a.deepEqual(rest, rest0, 'other props of ' + clips[i].id);
    a.deepEqual({ ...clips[i], props: null }, { ...before[i], props: null }, 'the clip itself of ' + clips[i].id);
  }
  a.throws(() => Q.apply(clips, 'size', 'huge', 1920, 1080));
});

test("JJ's words; no px anywhere the streamer reads", () => {
  a.equal(zh('cq-open'), '字幕大小');
  a.equal(zh('cq-who-selected', { n: 23 }), '选中的 23 条字幕');
  a.equal(zh('cq-who-all', { n: 23 }), '全部 23 条字幕');
  a.equal(zh('cq-desc', { n: 23 }), '一次改掉这 23 条字幕的字号和位置，字幕的字不动。单独调过的也会改成一样，改完可以撤销。');
  a.deepEqual(['cq-size', 'cq-small', 'cq-mid', 'cq-big', 'cq-pos', 'cq-top', 'cq-bottom'].map((k) => zh(k)), ['字号', '小', '中', '大', '位置', '上面', '下面']);
  a.equal(zh('cq-mixed-size'), '现在大小不一样，点一下就统一');
  a.equal(zh('cq-mixed-pos'), '现在位置不一样，点一下就统一');
  a.equal(zh('cq-done-size', { n: 23, size: '大' }), '已把 23 条字幕的字号改成「大」。');
  a.equal(zh('cq-done-top', { n: 23 }), '已把 23 条字幕移到画面上面。');
  a.equal(zh('cq-done-bottom', { n: 23 }), '已把 23 条字幕移到画面下面。');
  for (const l of ['zh-CN', 'en']) for (const [k, s] of Object.entries(V.text[l])) if (k.startsWith('own.cq-')) {
    a.ok(!/px|像素/i.test(s), k + ': ' + s);
    if (l === 'en') a.ok(!/[一-鿿]/.test(s), k + ' (en): ' + s);
  }
});

test('two entries, one operation: 〔字幕大小〕 beside the style menu (all captions), the Inspector top (the selected ones)', () => {
  const app = read('app.js');
  a.match(app, /<select data-tr-cap-style[^>]*>[\s\S]{0,400}?<\/select>\n\s*<button type="button" class="btn tiny" data-tr-cap-quick/, 'right after the style menu');
  a.match(app, /q\("\[data-tr-cap-quick\]"\)\.addEventListener\("click", \(\) => openCaptionQuick\(\)\);/);
  a.match(app, /let html = captionQuickHtml\("selected"\) \+ \(state\.selIds\.size > 1/, 'the Inspector starts with it');
  const fn = app.slice(app.indexOf('function captionQuickApply('), app.indexOf('function captionQuickApply(') + 1500);
  a.ok(fn.indexOf('const snap = undoSnapshot();') >= 0 && (fn.match(/pushUndo\(/g) || []).length === 1, 'one undo step');
  a.ok(!/FableCutCaptions\.(cues|clip)\(|addCaptionsFromTranscript/.test(fn), 'nothing generated again');
  a.match(fn, /MontClipCaptionQuick\.apply\(/);
  a.match(app, /function captionQuickTargets\(scope\) \{[\s\S]{0,400}!isClipLocked\(c\)/, 'locked captions are left alone');
  a.match(read('index.html'), /<script src="caption-quick\.js"><\/script>/);
  a.match(read('docs/demo/sync.js'), /"caption-quick\.js"/);
});

// Deja (11-03, #81): a caption whose fontSize (or y) is keyframed would not show the new value — the keys win. Such a
// caption is skipped for that change and the toast says so; it still counts in 「选中的 / 全部 N 条」, but not in what
// the buttons show. Per property: animated on y only, its size still changes.
const kf = (c, k) => ({ ...c, keyframes: { [k]: [{ t: 0, v: 20 }, { t: 1, v: 60 }] } });
test('keyframed captions: skipped for that property, left out of what the buttons show, counted in N', () => {
  const s = Q.sizes(1920, 1080), p = Q.positions(1920, 1080);
  const clips = [cap('a', s.mid, p.bottom), kf(cap('b', 80, -100), 'fontSize'), kf(cap('c', s.mid, p.bottom), 'y')];
  // the animated ones do not make the buttons "mixed": a's and c's size agree (b's fontSize is keyed); a's and b's y differ
  a.deepEqual(Q.current(clips, 1920, 1080), { size: 'mid', mixedSize: false, pos: null, mixedPos: true });
  a.equal(Q.animated(clips[1], 'size'), true); a.equal(Q.animated(clips[1], 'pos'), false); a.equal(Q.animated(clips[2], 'pos'), true);
  const before = JSON.parse(JSON.stringify(clips));
  a.deepEqual(Q.apply(clips, 'size', 'big', 1920, 1080), { changed: 2, skipped: 1 });
  a.deepEqual(clips.map((c) => c.props.fontSize), [s.big, 80, s.big], 'b keeps its size (its fontSize is keyed)');
  a.deepEqual(Q.apply(clips, 'pos', 'top', 1920, 1080), { changed: 2, skipped: 1 });
  a.deepEqual(clips.map((c) => c.props.y), [p.top, p.top, p.bottom], 'c keeps its y (its y is keyed)');
  a.deepEqual(clips.map((c) => c.keyframes), before.map((c) => c.keyframes), 'keys untouched');
  a.equal(zh('cq-animated', { n: 2 }), '有 2 条字幕设了动画，没改');
  a.ok(en('cq-animated', { n: 2 }) && !/[一-鿿]/.test(en('cq-animated', { n: 2 })));
  // the page: N counts them; the toast adds the sentence; nothing changed → no undo step
  const app = read('app.js'), fn = app.slice(app.indexOf('function captionQuickApply('), app.indexOf('function captionQuickApply(') + 1800);
  a.match(fn, /const \{ changed, skipped \} = MontClipCaptionQuick\.apply\(/);
  a.match(fn, /"own\.cq-animated", \{ n: skipped \}/);
  a.match(fn, /if \(!changed\) \{[^}]*toast\(/, 'nothing to change: only the sentence, no undo step');
});
