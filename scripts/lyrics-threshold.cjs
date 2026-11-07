#!/usr/bin/env node
'use strict';
/* How many lyric lines match, on synthetic transcripts (test/lyrics-synth.js), to set MontClipLyricsTrack.THRESHOLD:
   the right lyrics with 0–40 % of the characters misheard, the right lyrics with 3 made-up lines mixed in, and another
   song's lyrics. Prints k/n for each case (min / mean / max over the seeds) and how many proposals came out OK, then the
   lowest share of the right ones and the highest of the wrong ones.
     node scripts/lyrics-threshold.cjs            (20 seeds per case; exit 1 when the threshold doesn't separate them) */
const T = require('../lyrics-track');
const { SONGS, sing, text } = require('../test/lyrics-synth');
const FAKE = ['这一句根本没有唱过', '风筝飞过了十二座山', '橙色的列车开往北极'];
const names = Object.keys(SONGS), seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const row = (label, ps) => {
  const xs = ps.map((p) => (p.ok ? p.k / p.n : 0)), lo = Math.min(...xs), hi = Math.max(...xs), mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ok = ps.filter((p) => p.code === 'OK').length;
  console.log(label.padEnd(36), 'k/n min', lo.toFixed(2), 'mean', mean.toFixed(2), 'max', hi.toFixed(2), ' placed', ok + '/' + ps.length);
  return { lo, hi };
};
let right = 1, wrong = 0;
for (const err of [0, 0.1, 0.2, 0.3, 0.4]) {
  const ps = [];
  for (const n of names) for (const seed of seeds) ps.push(T.propose(sing(SONGS[n], { err, seed }), text(SONGS[n])));
  right = Math.min(right, row(`right lyrics, ${err * 100}% misheard`, ps).lo);
}
for (const err of [0, 0.2, 0.3, 0.4]) {
  const ps = [];
  for (const n of names) for (const seed of seeds) {
    const lyrics = [...SONGS[n]]; lyrics.splice(2, 0, FAKE[0]); lyrics.splice(6, 0, FAKE[1]); lyrics.push(FAKE[2]);
    ps.push(T.propose(sing(SONGS[n], { err, seed }), text(lyrics)));
  }
  right = Math.min(right, row(`+3 made-up lines (13), ${err * 100}%`, ps).lo);
}
for (const err of [0, 0.2, 0.4]) {
  const ps = [];
  for (const a of names) for (const b of names) if (a !== b) for (const seed of seeds.slice(0, 5)) ps.push(T.propose(sing(SONGS[a], { err, seed }), text(SONGS[b])));
  wrong = Math.max(wrong, row(`another song's lyrics, ${err * 100}%`, ps).hi);
}
console.log(`lowest right ${right.toFixed(2)} · highest wrong ${wrong.toFixed(2)} · THRESHOLD ${T.THRESHOLD}`);
process.exitCode = right >= T.THRESHOLD && wrong < T.THRESHOLD ? 0 : 1;
