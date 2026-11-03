/* Paraformer (sherpa-onnx) results → transcript words (#70, Deja 2026-11-03).
   The model gives one token per Chinese character and pieces of English words ("hel@@" + "lo"), each with the time it
   starts inside a VAD segment. words() turns them into [text, start, end] in file seconds; punctuate() puts the
   punctuation model's marks onto the words they follow; join() reads words as text: no space between Chinese
   characters (or next to Chinese punctuation), a space between English words (transcribe.js join, which the
   Transcript tab uses too). Pure; the server uses it. */
"use strict";
const { join } = require("./transcribe");

const r3 = (x) => Math.round(x * 1000) / 1000 || 0;
/** The marks the punctuation model writes. */
const MARKS = /[，。？！、；：,.?!;:]/;

/** One VAD segment's result → words. `offset` is the segment's start in the file, `end` its end; a word ends where the
 *  next starts, at most `maxChar` seconds after its own start, and never after the segment. */
function words(result, { offset = 0, end = Infinity, maxChar = 0.5 } = {}) {
  const tokens = (result && result.tokens) || [], ts = (result && result.timestamps) || [];
  if (!tokens.length || ts.length !== tokens.length) return [];
  const pieces = [];
  let cur = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = String(tokens[i]);
    if (!t.trim() || /^<.*>$/.test(t)) { if (cur) { pieces.push(cur); cur = null; } continue; }
    const glue = t.endsWith("@@"), text = glue ? t.slice(0, -2) : t;
    if (cur) cur.text += text; else cur = { text, s: ts[i], last: ts[i] };
    cur.last = ts[i];
    if (!glue) { pieces.push(cur); cur = null; }
  }
  if (cur) pieces.push(cur);
  return pieces.map((p, k) => {
    const s = offset + p.s, nx = pieces[k + 1];
    const e = Math.min(nx ? offset + nx.s : end, offset + p.last + maxChar, end);
    return [p.text, r3(s), r3(Math.max(s, e))];
  });
}

/** The text the punctuation model reads. */
const plain = (ws) => join(ws.map((w) => w[0]));

/** Put the punctuation model's marks onto the words before them. The punctuated text has to be the same words in the
 *  same order (case and spaces aside); if it is not, the words are returned as they were. */
function punctuate(ws, punctuated) {
  const out = ws.map((w) => w.slice());
  const want = ws.map((w) => [...String(w[0]).toLowerCase()]);
  let i = 0, k = 0;
  for (const ch of String(punctuated || "")) {
    if (/\s/.test(ch)) continue;
    if (MARKS.test(ch)) {
      const last = k === 0 ? i - 1 : -1;            // a mark only after a whole word
      if (last >= 0 && !MARKS.test(out[last][0].slice(-1))) out[last][0] += ch;
      continue;
    }
    if (i >= want.length || want[i][k] !== ch.toLowerCase()) return ws;
    if (++k === want[i].length) { i++; k = 0; }
  }
  return i === want.length ? out : ws;
}

module.exports = { words, join, plain, punctuate };
