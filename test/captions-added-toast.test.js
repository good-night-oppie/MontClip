'use strict';
// N3d (VV, offscreen review of #104; Deja, 2026-11-04): 〔加字幕〕 said 「4 captions on V3」 in English in the Chinese interface.
// Now 「已在 {track} 加了 {n} 句字幕」 / 「Added {n} captions on {track}」, the track and the count from variables; when it replaces
// captions already there it says how many (wording for JJ).
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const View = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the words, in both languages, with the track and the count filled in; English by number (JJ, 2026-11-04)', () => {
  const added = (l, n, track = 'V3') => View.tp(l, 'own.cap-added', { n }, { n, track });
  const replaced = (l, n, m, track = 'V3') => View.tp(l, 'own.cap-added-replaced', { n, m }, { n, m, track });
  a.equal(added('en', 1), 'Added 1 caption on V3');
  a.equal(added('en', 4), 'Added 4 captions on V3');
  a.equal(added('en', 12, 'V5'), 'Added 12 captions on V5');
  a.equal(replaced('en', 4, 1), 'Added 4 captions on V3, replacing the one that was there');
  a.equal(replaced('en', 4, 3), 'Added 4 captions on V3, replacing the 3 that were there');
  a.equal(replaced('en', 1, 1), 'Added 1 caption on V3, replacing the one that was there');
  a.equal(replaced('en', 1, 3), 'Added 1 caption on V3, replacing the 3 that were there');
  // Chinese: the two sentences as they were, one form
  a.equal(added('zh-CN', 1), '已在 V3 加了 1 句字幕');
  a.equal(added('zh-CN', 12, 'V5'), '已在 V5 加了 12 句字幕');
  a.equal(replaced('zh-CN', 4, 3), '已在 V3 加了 4 句字幕，换掉了原来的 3 句');
  a.equal(replaced('zh-CN', 1, 1), '已在 V3 加了 1 句字幕，换掉了原来的 1 句');
});

test('〔加字幕〕 says it through those strings: the track and the count are the real ones, nothing written in', () => {
  const app = read('app.js'), place = app.slice(app.indexOf('function placeCaptions('), app.indexOf('\n}\n', app.indexOf('function placeCaptions(')));
  a.match(place, /MontClipView\.tp\(mcView\.get\(\)\.language, "own\.cap-added-replaced", \{ n: list\.length, m: old\.length \}, \{ n: list\.length, track, m: old\.length \}\)/);
  a.match(place, /MontClipView\.tp\(mcView\.get\(\)\.language, "own\.cap-added", \{ n: list\.length \}, \{ n: list\.length, track \}\)/);
  // the old English sentence is left only for an imported file (it names the file; not part of N3d)
  const english = place.split('\n').filter((l) => /caption\$\{list\.length === 1/.test(l));
  a.equal(english.length, 1);
  a.match(english[0], /^\s*if \(from\) toast\(/);
});
