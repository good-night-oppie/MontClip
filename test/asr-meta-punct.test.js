'use strict';
// The punctuation model MontClip ships is Chinese (CT-Transformer zh-en). On Meta's model it runs only when a segment is
// mostly Chinese characters, so English and other languages get no 「。」; Paraformer's words are punctuated as before
// (Deja, 2026-11-04). Stand-in recognizer and punctuation model.
const { test } = require('node:test'), a = require('node:assert/strict');
const L = require('../asr-local'), W = require('../asr-words');
const RATE = 16000;

/** A recognizer that answers one segment with the given characters, one token each, 0.1 s apart. */
const rec = (chars) => ({ createStream: () => ({ acceptWaveform() {} }),
  async decodeAsync() { const tokens = [...chars]; return { tokens, timestamps: tokens.map((_, i) => L.META_PAD + i * 0.1) }; } });
/** The punctuation model as a stand-in: a full stop at the end, Chinese style. */
const punct = { addPunct: (t) => t + '。' };
const audio = new Float32Array(2 * RATE);

test('Meta\'s English gets no 「。」: the Chinese punctuation model runs only on mostly-Chinese segments', async () => {
  const en = await L.segmentWords(rec('ask not what your country can do'), audio, 0, punct, W.letterWords, L.META_PAD, L.mostlyChinese);
  a.deepEqual(en.words.map((w) => w[0]), ['ask', 'not', 'what', 'your', 'country', 'can', 'do']);
  a.ok(!en.words.some((w) => /。/.test(w[0])), 'no Chinese full stop on English');
  const zh = await L.segmentWords(rec('大家如果对我的研究感兴趣'), audio, 0, punct, W.letterWords, L.META_PAD, L.mostlyChinese);
  a.equal(zh.words[zh.words.length - 1][0], '趣。', 'Chinese from Meta is still punctuated');
  // Paraformer's words go to the punctuation model as before (no filter)
  const para = { createStream: () => ({ acceptWaveform() {} }), async decodeAsync() { return { tokens: ['he@@', 'llo', 'world'], timestamps: [0, 0.1, 0.3] }; } };
  const p = await L.segmentWords(para, audio, 0, punct);
  a.equal(p.words[p.words.length - 1][0], 'world。');
  a.equal(L.mostlyChinese([['ok', 0, 1], ['对', 1, 2], ['我', 2, 3]]), true, 'half Chinese (2 of 4 characters) counts as Chinese');
  a.equal(L.mostlyChinese([['bonjour', 0, 1], ['对', 1, 2]]), false);
});
