'use strict';
// P2 (owner, 2026-11-02): highlight candidates from local signals only — no model. Each candidate's reasons can be
// traced to a signal (its name, the measured value and the window it was measured over); with nothing to go on the
// list is empty, and the editor says why.
const test = require('node:test'), a = require('node:assert/strict');
const H = require('../highlight-candidates');

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
      a.ok(['loudness', 'danmaku', 'speech', 'beat'].includes(r.signal), r.signal);
      a.equal(typeof r.value, 'number');
      a.ok(Array.isArray(r.window) && r.window.length === 2);
    }
});
