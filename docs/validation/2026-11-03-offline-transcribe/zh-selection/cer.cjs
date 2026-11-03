'use strict';
// CER for Chinese: compare letters, digits and CJK characters only (punctuation and spaces dropped), case folded, NFKC.
// Optionally convert traditional to simplified first (opencc-js, evaluation only) — Whisper sometimes writes traditional.
function norm(s, t2s) {
  let x = String(s).normalize('NFKC').toLowerCase();
  if (t2s) x = t2s(x);
  return Array.from(x).filter((c) => /[\p{L}\p{N}]/u.test(c));
}
function cer(ref, hyp, t2s) {
  const r = norm(ref, null), h = norm(hyp, t2s);
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return { cer: Math.round(prev[h.length] / r.length * 10000) / 100, refChars: r.length, hypChars: h.length, edits: prev[h.length] };
}
module.exports = { cer, norm };
