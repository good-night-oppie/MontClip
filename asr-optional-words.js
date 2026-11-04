/* Omnilingual ASR (Meta, CTC; sherpa-onnx `omnilingual`) results → transcript words (Deja, 2026-11-04).
   The model writes one token per character, lower case, no punctuation, and a token that is a single space between
   words; each token has the time it starts inside a VAD segment (docs/validation/2026-11-04-omnilingual-asr).
   Chinese and Japanese characters are each a word, as with Paraformer (asr-words.js: 「一个汉字一个词」); the characters
   of any other script are put back together into the word they spell, up to the next space. A word ends where the
   next one starts, at most `maxChar` seconds after its last character, and never after the segment. Pure. */
"use strict";

const r3 = (x) => Math.round(x * 1000) / 1000 || 0;
/** Characters that are words on their own: CJK ideographs, kana (transcribe.js TIGHT, without the punctuation). */
const OWN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

/** One VAD segment's result → words [text, start, end] in file seconds. */
function words(result, { offset = 0, end = Infinity, maxChar = 0.5 } = {}) {
  const tokens = (result && result.tokens) || [], ts = (result && result.timestamps) || [];
  if (!tokens.length || ts.length !== tokens.length) return [];
  const pieces = [];
  let cur = null;
  const close = () => { if (cur) { pieces.push(cur); cur = null; } };
  for (let i = 0; i < tokens.length; i++) {
    const t = String(tokens[i]);
    // a space, or a special token (<unk>, <s>…): the end of a word
    if (!t.trim() || /^<.*>$/.test(t)) { close(); continue; }
    for (const ch of t.trim()) {
      if (OWN.test(ch)) { close(); pieces.push({ text: ch, s: ts[i], last: ts[i] }); continue; }
      if (cur) { cur.text += ch; cur.last = ts[i]; } else cur = { text: ch, s: ts[i], last: ts[i] };
    }
  }
  close();
  return pieces.map((p, k) => {
    const s = offset + p.s, nx = pieces[k + 1];
    const e = Math.min(nx ? offset + nx.s : end, offset + p.last + maxChar, end);
    return [p.text, r3(s), r3(Math.max(s, e))];
  });
}

module.exports = { words };
