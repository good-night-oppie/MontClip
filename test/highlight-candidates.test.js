'use strict';
// P2 (owner, 2026-11-02): highlight candidates from local signals only — no model. Each candidate's reasons can be
// traced to a signal (its name, the measured value and the window it was measured over); with nothing to go on the
// list is empty, and the editor says why.
const test = require('node:test'), a = require('node:assert/strict');
const H = require('../app/highlight-candidates');

// loudness every 0.5 s: quiet speech at -30 dBFS, with a loud stretch
const curve = (duration, loud = [], base = -30, high = -14) => {
  const values = [];
  for (let t = 0; t < duration; t += 0.5) values.push(loud.some(([f, to]) => t >= f && t < to) ? high : base);
  return { step: 0.5, values };
};
const sentences = (list) => list.map(([start, end, text], i) => ({ id: 's' + i, start, end, text }));

test('sentences are grouped into candidates at pauses, and every candidate starts and ends on a sentence', () => {
  const s = sentences([[0, 4, '第一句话'], [4.2, 9, '第二句话'], [12, 16, '停顿之后的第三句'], [16.1, 22, '第四句']]);
  const segs = H.segments({ duration: 30, sentences: s }, H.DEFAULTS);
  a.deepEqual(segs.map((g) => [g.from, g.to, g.sentenceIds]), [[0, 9, ['s0', 's1']], [12, 22, ['s2', 's3']]]);
});

test('a long run of sentences is split so no candidate is longer than maxLen', () => {
  const list = []; for (let t = 0; t < 120; t += 5) list.push([t, t + 4.9, '句子' + t]);
  for (const g of H.segments({ duration: 120, sentences: sentences(list) }, H.DEFAULTS)) a.ok(g.to - g.from <= H.DEFAULTS.maxLen + 1e-9, `${g.from}–${g.to}`);
});

test('the loud stretch ranks first, with a loudness reason that names its value and window', () => {
  const s = sentences([[0, 8, '平静的开场'], [10, 18, '这里突然大喊起来'], [20, 28, '又平静下来']]);
  const out = H.candidates({ duration: 30, sentences: s, loudness: curve(30, [[11, 17]]) });
  a.ok(out.length >= 1);
  const top = out[0];
  a.deepEqual([top.from, top.to], [10, 18]);
  const r = top.reasons.find((x) => x.signal === 'loudness');
  a.ok(r, 'a loudness reason');
  a.ok(r.value >= 6, 'louder than the whole timeline by several dB: ' + r.value);
  a.deepEqual(r.window, [10, 18]);
  a.equal(typeof r.baseline, 'number');
  a.ok(out.every((c, i) => i === 0 || out[i - 1].score >= c.score), 'sorted by score');
});

test('danmaku density, when there is danmaku, is a reason of its own', () => {
  const s = sentences([[0, 8, 'a'], [10, 18, 'b'], [20, 28, 'c']]);
  const danmaku = []; for (let i = 0; i < 40; i++) danmaku.push({ t: 21 + i * 0.15 }); danmaku.push({ t: 2 }, { t: 12 });
  const out = H.candidates({ duration: 30, sentences: s, loudness: curve(30), danmaku });
  a.deepEqual([out[0].from, out[0].to], [20, 28]);
  const r = out[0].reasons.find((x) => x.signal === 'danmaku');
  a.ok(r && r.value >= 2, 'several times the average rate');
  a.equal(r.count, 40);
});

test('with no signal above the ordinary there are no candidates (the caller shows the empty state)', () => {
  const s = sentences([[0, 8, 'a'], [10, 18, 'b'], [20, 28, 'c']]);
  a.deepEqual(H.candidates({ duration: 30, sentences: s, loudness: curve(30) }), []);
  a.deepEqual(H.candidates({ duration: 0 }), []);
  a.equal(H.emptyReason({ duration: 0 }), 'no-media');
  a.equal(H.emptyReason({ duration: 30, sentences: [], loudness: null }), 'no-signals');
  a.equal(H.emptyReason({ duration: 30, sentences: s, loudness: curve(30) }), 'nothing-stands-out');
});

test('without captions, candidates follow the sound: spans between silences', () => {
  const loud = curve(60, [[20, 30]]);
  for (let i = 0; i < loud.values.length; i++) if (i * 0.5 >= 8 && i * 0.5 < 12) loud.values[i] = -70;   // a silence
  const out = H.candidates({ duration: 60, loudness: loud });
  a.ok(out.length >= 1);
  a.ok(out[0].from <= 20 && out[0].to >= 30, `${out[0].from}–${out[0].to}`);
  a.deepEqual(out[0].sentenceIds, []);
});

test('every reason is traceable: a signal name, a number and the window it was measured on', () => {
  const s = sentences([[0, 8, 'a'], [10, 18, '大喊'], [20, 28, 'c']]);
  for (const c of H.candidates({ duration: 30, sentences: s, loudness: curve(30, [[11, 17]]), beats: [10.5, 11, 11.5, 12, 12.5, 13, 13.5] }))
    for (const r of c.reasons) {
      a.ok(['loudness', 'danmaku', 'speech'].includes(r.signal), r.signal);
      a.equal(typeof r.value, 'number');
      a.ok(Array.isArray(r.window) && r.window.length === 2);
    }
});

// the editor: a button in the Transcript tab, Go to moves only the playhead, Keep goes through the range engine as one
// undo step; the page loads the module and the web demo carries it
test('the editor wires the cards to local signals, the playhead and the range engine', () => {
  const fs = require('node:fs'), path = require('node:path'), read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const app = read('app/app.js');
  a.match(read('index.html'), /<script src="app\/highlight-candidates\.js"><\/script>/);
  a.match(read('docs/demo/sync.js'), /"app\/highlight-candidates\.js"/);
  a.match(app, /q\("\[data-tr-highlights\]"\)\.addEventListener\("click", \(\) => showHighlightCandidates\(\)\);/);
  const at = app.indexOf('async function showHighlightCandidates('), body = app.slice(at, app.indexOf('\n}\n', at));
  a.ok(at > 0);
  a.match(body, /MontClipHighlightCandidates\.candidates\(sig\)/);
  a.match(body, /data-hl-jump[\s\S]*setTime\(c\.from\)/, 'Go to sets the playhead');
  a.match(app, /function keepHighlightRanges\(ranges\) \{[\s\S]*?MontClipRangePlan\.create\(doc, ranges\)[\s\S]*?pushUndo\(snap\)/, 'Keep: the range engine and one undo step');
  a.doesNotMatch(body, /montclipAgentService|fetch\(/, 'no model and no request from the cards');
});

// VV (#52, 5bfca2f7): two stretches both well over the old 12 dB cap scored the same and fell back to time order, so
// the loudest moment came second. The cap is 24 dB now, and a tie goes to the louder mean, then the louder peak.
test('the louder of two very loud stretches ranks first (VV\'s scenario: +17 dB and +23 dB)', () => {
  const s = sentences([[0, 7.5, '开场'], [9.2, 18, '来来来这次我换个打法 哈哈哈哈'], [20, 28, '平静'], [30, 38, '继续'], [44.8, 52, '啊啊啊啊 二阶段了'], [54, 60, '收尾']]);
  const values = [];
  for (let t = 0; t < 60; t += 0.5) values.push(t >= 9.2 && t < 18 ? -30 + 17 : t >= 44.8 && t < 52 ? -30 + 23 : -30);
  const out = H.candidates({ duration: 60, sentences: s, loudness: { step: 0.5, values } });
  a.deepEqual(out.slice(0, 2).map((c) => [c.from, c.to]), [[44.8, 52], [9.2, 18]], 'the louder one first');
  a.ok(out[0].score > out[1].score, 'and it scores higher, not only by the tie-break');
});

test('equal scores: the louder mean, then the louder peak, then the earlier one', () => {
  const card = (from, above, peak) => ({ from, to: from + 5, score: 0.55, reasons: [{ signal: 'loudness', value: above, peak }] });
  const sorted = [card(0, 30, 31), card(10, 30, 40), card(20, 35, 36), card(30, 30, 40)].sort(H.compare);
  a.deepEqual(sorted.map((c) => c.from), [20, 10, 30, 0]);
});

// VV (#52): 00:09:05 reads as nine minutes five seconds; cards say 0:09.2–0:18 (8.8 秒)
test('card times: minutes:seconds with a tenth when there is one, and the length', () => {
  a.equal(H.clock(9.2), '0:09.2');
  a.equal(H.clock(18), '0:18');
  a.equal(H.clock(44.8), '0:44.8');
  a.equal(H.clock(125.04), '2:05');
  a.equal(H.clock(3725.5), '1:02:05.5');
  a.equal(H.clock(59.96), '1:00');
  a.equal(H.seconds(18 - 9.2), '8.8');
  a.equal(H.seconds(7), '7');
});

// JJ (#52): a card's title is its time span only — no "#1" in front
test('card titles carry no rank number', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app/app.js'), 'utf8');
  const at = app.indexOf('async function showHighlightCandidates('), body = app.slice(at, app.indexOf('\n}\n', at));
  const title = body.match(/<strong>([^<]*)<\/strong>/);
  a.ok(title, 'the card title');
  a.doesNotMatch(title[1], /^#/, 'starts with the time, not #number: ' + title[1]);
  a.doesNotMatch(title[1], /c\.rank/);
});

// JJ (#52, c5b1f98): every point on a card needs a reason the streamer can see; a beat is not one (it added 0.05
// with nothing to show for it). Highlights of singing will be designed separately.
test('beats change nothing: no beat reason, the same scores and order', () => {
  const s = sentences([[0, 8, '开场'], [10, 18, '大喊'], [20, 28, '又平静'], [30, 38, '再喊一次']]);
  const loudness = curve(40, [[11, 17], [31, 37]], -30, -16);
  const beats = []; for (let t = 0; t < 40; t += 0.4) beats.push(Math.round(t * 10) / 10);
  const without = H.candidates({ duration: 40, sentences: s, loudness });
  const withBeats = H.candidates({ duration: 40, sentences: s, loudness, beats });
  a.ok(without.length >= 2);
  a.deepEqual(withBeats, without);
  a.ok(withBeats.every((c) => c.reasons.every((r) => r.signal !== 'beat')));
  a.equal('beatMinRate' in H.DEFAULTS, false);
});

// QQ (#52, c5b1f98): every value written into the card's markup is escaped, the reason's signal name too
test('the reason attribute is escaped', () => {
  const app = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app/app.js'), 'utf8');
  const at = app.indexOf('async function showHighlightCandidates('), body = app.slice(at, app.indexOf('\n}\n', at));
  a.match(body, /data-hl-reason="\$\{escapeHtml\(r\.signal\)\}"/);
  a.doesNotMatch(body, /data-hl-reason="\$\{r\.signal\}"/);
});
