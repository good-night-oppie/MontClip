'use strict';
// #70 (Deja, 2026-11-03): Paraformer (sherpa-onnx) gives one token per Chinese character and pieces of English words
// ("hel@@" + "lo"), each with its start time inside a VAD segment. asr-words.js turns that into transcript words
// [text, start, end] in file seconds, adds the punctuation model's marks to the words they follow, and joins words for
// reading: no space between Chinese characters, a space between English words.
const { test } = require('node:test'), a = require('node:assert/strict');
const W = require('../asr-words'), T = require('../transcribe'), C = require('../captions');

test('Chinese characters become words in file seconds, each ending where the next starts (at most half a second)', () => {
  const r = { text: '今天天气不错', tokens: ['今', '天', '天', '气', '不', '错'], timestamps: [0.1, 0.3, 0.5, 0.7, 2.0, 2.2] };
  a.deepEqual(W.words(r, { offset: 100, end: 102.6 }), [
    ['今', 100.1, 100.3], ['天', 100.3, 100.5], ['天', 100.5, 100.7], ['气', 100.7, 101.2], ['不', 102, 102.2], ['错', 102.2, 102.6]]);
});
test('English pieces ending in @@ join the next piece; special tokens are dropped', () => {
  const r = { tokens: ['我', '用', 'i@@', 'pho@@', 'ne', '<unk>', '拍', 'ok'], timestamps: [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0] };
  a.deepEqual(W.words(r, { offset: 0, end: 1.3 }).map((w) => w[0]), ['我', '用', 'iphone', '拍', 'ok']);
  a.deepEqual(W.words(r, { offset: 0, end: 1.3 })[2], ['iphone', 0.4, 0.8]);
});
test('a result without timestamps for every token gives no words rather than made-up times', () => {
  a.deepEqual(W.words({ tokens: ['你', '好'], timestamps: [0.1] }, { offset: 0, end: 1 }), []);
  a.deepEqual(W.words({ tokens: [], timestamps: [] }, { offset: 0, end: 1 }), []);
});
test('punctuation marks go onto the word before them; a punctuated text that does not line up changes nothing', () => {
  const ws = [['今', 0, 0.2], ['天', 0.2, 0.4], ['好', 0.4, 0.6], ['吗', 0.6, 0.8], ['ok', 1, 1.3], ['走', 1.4, 1.6]];
  a.deepEqual(W.punctuate(ws, '今天好吗？OK，走。').map((w) => w[0]), ['今', '天', '好', '吗？', 'ok，', '走。']);
  a.deepEqual(W.punctuate(ws, '明天好吗？OK，走。'), ws, 'different words: left as they were');
  a.deepEqual(W.punctuate(ws, '今天好吗'), ws, 'too short: left as they were');
  a.equal(W.plain(ws), '今天好吗ok走', 'the text the punctuation model reads');
});
test('reading text: no space between Chinese characters (or Chinese punctuation), a space between English words', () => {
  const join = (list) => W.join(list);
  a.equal(join(['今', '天', '好', '吗？']), '今天好吗？');
  a.equal(join(['我', '用', 'iphone', '拍']), '我用iphone拍');
  a.equal(join(['hello', 'world.']), 'hello world.');
  a.equal(join(['好，', 'ok']), '好，ok');
  // the transcript tab and the captions read the same way
  a.equal(T.text([['今', 0, 0.2], ['天', 0.2, 0.4], ['好。', 0.4, 0.6]]), '今天好。');
  a.equal(T.text([['hello', 0, 0.2], ['world', 0.2, 0.4]]), 'hello world');
  a.equal(C.join(['今', '天', 'ok', 'go']), W.join(['今', '天', 'ok', 'go']));
});
test('captions from Chinese words read without spaces, break at full stops, and carry no per-word times (one word per space)', () => {
  const words = [...'大家好今天我们聊一聊直播'].map((ch, i) => ({ w: ch + (i === 2 ? '。' : ''), s: i * 0.3, e: i * 0.3 + 0.28 }));
  const cues = C.cues(words, { style: 'subtitle', width: 1920, height: 1080 });
  a.ok(cues.length >= 1);
  for (const c of cues) a.ok(!/[一-鿿] [一-鿿]/.test(c.text), 'no space between characters: ' + c.text);
  a.ok(cues[0].text.startsWith('大家好。'), cues[0].text);
  const clip = C.clip(cues[0], { style: 'subtitle', width: 1920, height: 1080 });
  a.equal(clip.props.wordTimes, undefined, 'sentence timing only, like imported subtitles (#34)');
});
test('segments read Chinese full stops as sentence ends', () => {
  const ws = [...'你好。我走了。'].reduce((out, ch) => { if ('。'.includes(ch)) out[out.length - 1][0] += ch; else out.push([ch, out.length * 0.6, out.length * 0.6 + 0.5]); return out; }, []);
  const segs = T.segments(ws, { min: 0.5 });
  a.deepEqual(segs.map((s) => s.text), ['你好。', '我走了。']);
});
