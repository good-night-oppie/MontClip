'use strict';
// The card's 〔按歌词校准字幕〕 (Deja 2026-11-03, the approved plan; ADR 2026-11-03-card-lyrics.md). A card has no captions
// until it is placed, so it is calibrated on the card: the transcript's words whose middle is inside the card (recording
// seconds) are aligned to the pasted lyrics (lyrics-align.js, #85), the result is kept on the card as lyricCues, and when the
// card is placed its captions are those lines, moved onto the timeline and kept inside the card's part. Other cards and
// other captions are not touched.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const S = require('../auto-slices'), L = require('../lyrics-align'), V = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// a recording's transcript (file seconds): talk, a song with two misheard characters, talk
const WORDS = [['大家', 10, 10.6], ['好', 10.6, 11], ['天控', 100, 101], ['好蓝', 101, 102], ['我想', 103, 104], ['飞香', 104, 105], ['谢谢', 200, 201]];

test('the card\'s scope: one part, the card itself; the words whose middle is inside it', () => {
  const s = S.lyricScope(WORDS, { id: 'k1', s: 99.5, e: 105.2 });
  a.deepEqual(s.caps, [{ id: 'k1', start: 99.5, end: 105.2 }]);
  a.deepEqual(s.words.map((w) => w[0]), ['天控', '好蓝', '我想', '飞香']);
  // a word half in: by its middle
  a.deepEqual(S.lyricScope(WORDS, { id: 'k', s: 100.6, e: 103.4 }).words.map((w) => w[0]), ['好蓝']);
  a.equal(S.lyricScope([], { id: 'k', s: 0, e: 10 }).words.length, 0);
  a.equal(S.lyricScope(null, { id: 'k', s: 0, e: 10 }).words.length, 0);
});

test('aligned on the card: every line inside the card, the misheard characters as the lyrics', () => {
  const s = S.lyricScope(WORDS, { id: 'k1', s: 99.5, e: 105.2 });
  const r = L.align(s.words, '天空好蓝\n我想飞翔');
  a.equal(r.ok, true);
  const p = L.plan(r, r.lines.map((l, i) => (l.sure ? i : -1)).filter((i) => i >= 0), s.caps);
  a.deepEqual(p.cues.map((q) => q.text), ['天空好蓝', '我想飞翔']);
  a.deepEqual(p.replace, ['k1']);
  a.ok(p.cues.every((q) => q.start >= 99.5 && q.end <= 105.2));
});

test('placed: the card\'s lines move onto the timeline with its clip, cut to the clip\'s part', () => {
  const cues = [{ start: 100, end: 102, text: '天空好蓝', lyrics: true, words: [{ w: '天空', s: 100, e: 101 }, { w: '好蓝', s: 101, e: 102 }] },
    { start: 103, end: 105, text: '我想飞翔', lyrics: true, words: [{ w: '我想', s: 103, e: 104 }, { w: '飞翔', s: 104, e: 105 }] }];
  // the clip shows the recording from 99.5 for 5.7 s, placed at 480 on the timeline
  const on = S.lyricCuesOn(cues, { start: 480, in: 99.5, duration: 5.7 });
  a.deepEqual(on.map((q) => [q.start, q.end, q.text]), [[480.5, 482.5, '天空好蓝'], [483.5, 485.5, '我想飞翔']]);
  a.deepEqual(on[1].words, [{ w: '我想', s: 483.5, e: 484.5 }, { w: '飞翔', s: 484.5, e: 485.5 }]);
  // the card made shorter after calibrating (its end nudged to 104.5): the second line ends with the clip; a line wholly
  // outside goes, and so do its words
  const cut = S.lyricCuesOn(cues, { start: 0, in: 99.5, duration: 5 });
  a.deepEqual(cut.map((q) => [q.start, q.end]), [[0.5, 2.5], [3.5, 5]]);
  a.deepEqual(cut[1].words.map((w) => w.w), ['我想', '飞翔']);
  a.deepEqual(cut[1].words[1], { w: '飞翔', s: 4.5, e: 5 });
  a.deepEqual(S.lyricCuesOn(cues, { start: 0, in: 106, duration: 3 }), []);
  a.deepEqual(S.lyricCuesOn(null, { start: 0, in: 0, duration: 3 }), []);
});

test('the card\'s button: on a song card with words in its part; after calibrating, the placeholder 再对一遍 (JJ to word)', () => {
  const app = read('app.js');
  a.ok(!/function autoLyricsAvailable\(\) \{\s*return false;/.test(app), 'no longer always off');
  a.match(app, /function autoLyricsAvailable\(c\) \{/);
  a.match(app, /data-as-act="lyrics"/);
  // the placeholder key, with how many lines were changed
  a.equal(V.t('zh-CN', 'own.as-lyrics-again', { n: 3 }), '再对一遍歌词（已改 3 句）');
  a.ok(V.t('en', 'own.as-lyrics-again', { n: 3 }).includes('3') && !/[一-鿿]/.test(V.t('en', 'own.as-lyrics-again', { n: 3 })));
  // the timeline's own entry is the same dialog as before
  a.match(app, /function openLyricsAlign\(\) \{/);
  a.match(app, /function lyricsDialog\(/);
  // placed: the card's lines (lyricCuesOn), the others from the transcript as before
  a.match(app, /MontClipAutoSlices\.lyricCuesOn\(/);
});

// JJ's final words for the toast after calibrating a card (Deja, on #100), and its 〔撤销〕 under #92's rule: 8 s, held while
// the pointer is on it or the focus is inside it
test('the toast after calibrating: JJ\'s words, with 〔撤销〕 that stays 8 s and holds while hovered or focused', () => {
  a.equal(V.t('zh-CN', 'own.as-lyrics-done', { n: 2 }), "已按歌词改好 2 句。放到时间线上以后，用的就是改好的字幕。");
  a.equal(V.t('en', 'own.as-lyrics-done', { n: 2 }), "Corrected 2 lines from the lyrics. Once this part is on the timeline, these subtitles are used.");
  a.equal(V.t('zh-CN', 'own.as-lyrics-again', { n: 2 }), '再对一遍歌词（已改 2 句）', 'as-lyrics-again as it was');
  const app = read('app.js');
  a.match(app, /autoToast\(uiText\("own\.as-lyrics-done", \{ n: card\.lyricN \}\)\);/, 'with 〔撤销〕 (undoable, the default)');
  a.match(app, /const UNDO_TOAST_MS = 8000;/);
  const at = app.slice(app.indexOf('function autoToast('), app.indexOf('function autoToast(') + 900);
  a.match(at, /if \(undoable\) t\.holdToast\.start\(\); else autoToastTimer = setTimeout\(\(\) => \{ t\.hidden = true; \}, 5000\);/);
  const ht = app.slice(app.indexOf('function holdToast('), app.indexOf('function holdToast(') + 900);
  a.match(ht, /if \(hover \|\| el\.contains\(document\.activeElement\)\) since = Date\.now\(\);/);
});
