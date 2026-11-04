'use strict';
// N3d (VV, offscreen review of #104; Deja, 2026-11-04): 〔加字幕〕 said 「4 captions on V3」 in English in the Chinese interface.
// Now 「已在 {track} 加了 {n} 句字幕」 / 「Added {n} captions on {track}」, the track and the count from variables; when it replaces
// captions already there it says how many (wording for JJ).
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const View = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the words, in both languages, with the track and the count filled in', () => {
  a.equal(View.t('zh-CN', 'own.cap-added', { n: 4, track: 'V3' }), '已在 V3 加了 4 句字幕');
  a.equal(View.t('en', 'own.cap-added', { n: 4, track: 'V3' }), 'Added 4 captions on V3');
  a.equal(View.t('zh-CN', 'own.cap-added', { n: 12, track: 'V5' }), '已在 V5 加了 12 句字幕');
  a.equal(View.t('zh-CN', 'own.cap-added-replaced', { n: 4, track: 'V3', m: 3 }), '已在 V3 加了 4 句字幕，换掉了原来的 3 句');
  a.equal(View.t('en', 'own.cap-added-replaced', { n: 4, track: 'V3', m: 3 }), 'Added 4 captions on V3, replacing 3');
});

test('〔加字幕〕 says it through those strings: the track and the count are the real ones, nothing written in', () => {
  const app = read('app.js'), place = app.slice(app.indexOf('function placeCaptions('), app.indexOf('\n}\n', app.indexOf('function placeCaptions(')));
  a.match(place, /uiText\(old\.length \? "own\.cap-added-replaced" : "own\.cap-added", \{ n: list\.length, track, m: old\.length \}\)/);
  // the old English sentence is left only for an imported file (it names the file; not part of N3d)
  const english = place.split('\n').filter((l) => /caption\$\{list\.length === 1/.test(l));
  a.equal(english.length, 1);
  a.match(english[0], /^\s*if \(from\) toast\(/);
});
