'use strict';
// Event boundaries (prototype, docs/decisions/2026-11-03-event-boundaries.md; Deja 2026-11-03): each end of a card moves
// at most ±5 s, after the habit shift, to a natural edge — a long pause or a scene change first, else a sentence edge —
// and never into a sentence; an end the streamer moved is left alone; with nothing in reach an end stays and says so.
// magnet() is VV's drag-time pull (±0.6 s). Pure; nothing is wired into the app.
const test = require('node:test'), a = require('node:assert/strict');
const B = require('../event-bounds');
const H = require('../app/highlight-candidates');

// A synthetic 6-minute chat stream: background music keeps the sound at −32 dBFS throughout (never silent), a joke whose
// setup starts at 118.0 s and whose punchline ends at 149.2 s; louder 130–148 s; danmaku burst 140–160 s.
const SENT = [[96, 104], [104.3, 110], [110.2, 116.5], [118, 125], [125.3, 131], [131.2, 140], [140.3, 149.2], [151, 156], [156.2, 170]]
  .map(([start, end], i) => ({ id: 's' + i, start, end, text: '句子' + i }));
function stream(sentences = []) {
  const values = []; for (let t = 0; t < 360; t += 0.5) values.push(t >= 130 && t < 148 ? -18 : -32);
  const danmaku = []; for (let t = 0; t < 360; t += 6) danmaku.push(t); for (let t = 140; t < 160; t += 0.4) danmaku.push(t);
  return { duration: 360, sentences, loudness: { step: 0.5, values }, danmaku: danmaku.map((t) => ({ t })) };
}

test('today, without sentences, a stream with music under it is cut on the 45 s grid and the joke is split (the blind cut)', () => {
  const top = H.candidates(stream())[0];
  a.deepEqual([top.from, top.to], [135, 180]);
});

test('±5 s cannot rescue a grid card far off: an end with no edge in reach stays and says why', () => {
  const out = B.snap({ s: 135, e: 180 }, { sentences: SENT, duration: 360 });
  a.ok(Math.abs(out.start.moved) <= 5 && Math.abs(out.end.moved) <= 5, JSON.stringify(out));
  a.deepEqual([out.e, out.end.why], [180, 'no-pause']);   // the last sentence ends at 170
});

test('a card near the event lands on its sentences: start 0.3 s before the first word, end 0.4 s after the last', () => {
  const out = B.snap({ s: 120, e: 147 }, { sentences: SENT, duration: 360 });
  a.deepEqual([out.s, out.e], [117.7, 149.6]);
  a.equal(out.start.how, 'pause'); a.equal(out.end.how, 'pause');
  a.equal(B.edgeErrors([{ from: out.s, to: out.e }], [{ from: 118, to: 149.2 }]).within1, 1);
});

test('an end the streamer moved (「你调过」) is never touched', () => {
  const out = B.snap({ s: 120, e: 147, s0: 121, e0: 147 }, { sentences: SENT, duration: 360 });
  a.deepEqual([out.s, out.start.why], [120, 'adjusted']);
  a.equal(out.e, 149.6);
});

test('no edge within ±5 s: the end stays, why no-pause (附近没有停顿，没动)', () => {
  const out = B.snap({ s: 20, e: 60 }, { sentences: SENT, duration: 360 });
  a.deepEqual([out.s, out.e, out.start.why, out.end.why], [20, 60, 'no-pause', 'no-pause']);
});

test('a moved end never falls inside a sentence, and never moves more than 5 s', () => {
  for (let f = 90; f < 170; f += 0.7) {
    const out = B.snap({ s: f, e: f + 15 }, { sentences: SENT, duration: 360 });
    for (const [t, x] of [[out.s, out.start], [out.e, out.end]]) if (x.moved) a.ok(!B.insideSentence(t, SENT), `${f}: ${t}`);
    a.ok(Math.abs(out.start.moved) <= 5 + 1e-9 && Math.abs(out.end.moved) <= 5 + 1e-9);
  }
});

test('a long pause is preferred to a nearer short one; a scene change confirms a short one', () => {
  // start at 114: the edge before 118 (a 1.5 s pause) is 3.7 s on, the one before 110.2 (0.2 s) 3.8 s back — pause wins;
  // at 112 the short-pause edge is nearer (2.1 s) but the long pause (5.7 s) is out of reach, so the sentence edge it is
  a.equal(B.snap({ s: 114, e: 140 }, { sentences: SENT, duration: 360 }).s, 117.7);
  const near = B.snap({ s: 112, e: 140 }, { sentences: SENT, duration: 360 });
  a.deepEqual([near.s, near.start.how], [110, 'sentence']);
  const sc = B.snap({ s: 106, e: 140 }, { sentences: SENT, cuts: [104.2], duration: 360 });
  a.deepEqual([sc.s, sc.start.how], [104, 'scene']);
});

test('the picture alone gives the edges when nobody speaks; a card never becomes shorter than minLen', () => {
  const out = B.snap({ s: 50, e: 60 }, { sentences: [], cuts: [47.5, 63], duration: 360 });
  a.deepEqual([out.s, out.e], [47.5, 63]);
  a.equal(B.snap({ s: 117, e: 119 }, { sentences: SENT, duration: 360 }).start.why, 'too-short');
});

test('sentences come from transcript words: an end mark or a gap ends one', () => {
  const w = [['今', 0, 0.2], ['天', 0.2, 0.4], ['好。', 0.4, 0.6], ['我', 0.7, 0.9], ['们', 0.9, 1.1], ['走', 2.5, 2.7]];
  a.deepEqual(B.sentences(w), [{ start: 0, end: 0.6 }, { start: 0.7, end: 1.1 }, { start: 2.5, end: 2.7 }]);
});

test('edge errors: mean seconds and the share within ±1 s and ±3 s', () => {
  a.deepEqual(B.edgeErrors([{ from: 10, to: 20 }, { from: 0, to: 9 }], [{ from: 10.5, to: 24 }, { from: 0, to: 10 }]),
    { n: 2, start: 0.25, end: 2.5, within1: 0.75, within3: 0.75 });
});

// VV's drag-time magnet: ±0.6 s, an end lands 0.4 s after the last word, a start 0.3 s before the first; unsure edges
// (a short gap, no end mark) are ticks only.
const WORDS = [['今', 10, 10.2], ['天', 10.2, 10.4], ['好。', 10.4, 10.6], ['我', 12, 12.2], ['们', 12.2, 12.4], ['走', 13.2, 13.4], ['吧', 13.4, 13.6]];
test('dragging an end near a finished sentence pulls it to the last word + 0.4 s', () => {
  const r = B.magnet(11.3, 'e', WORDS);
  a.deepEqual([r.t, r.snapped, r.why], [11, true, 'sentence-end']);
  a.equal(B.magnet(11.7, 'e', WORDS).snapped, false);
});
test('dragging a start pulls it to 0.3 s before the first word, never into the sentence before', () => {
  const r = B.magnet(11.5, 's', WORDS);
  a.equal(r.t, 11.7); a.equal(r.snapped, true);
});
test('an unsure edge (0.8 s gap, no end mark) is shown as a tick but does not pull', () => {
  const r = B.magnet(12.6, 'e', WORDS);
  a.equal(r.snapped, false); a.ok(r.ticks.includes(12.8), JSON.stringify(r));
});
