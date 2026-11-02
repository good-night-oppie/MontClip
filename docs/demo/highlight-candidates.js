/* MontClip P2 — highlight candidates from local signals (no model, nothing leaves the computer).
 *
 * Input (all in timeline seconds): the timeline's length, its sentences (caption clips), a loudness curve of the
 * timeline's own sound mix ({step, values: dBFS}), and, when there are any, beat times and danmaku times. Output:
 * candidate ranges, each with a score and the reasons it was picked; a reason names its signal, the measured value,
 * what it was compared with and the window it was measured over, so every claim on a card can be checked.
 *
 * Ideas taken (look, don't copy — docs/decisions/2026-11-02-p2-highlight-cards.md, clean-room exception):
 * candidates follow whole sentences (FunClip's subtitle-based ranges); a burst of danmaku marks a highlight
 * (Bili Shadow Replay's danmaku-density chart); loudness against the whole timeline. No code was copied.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipHighlights = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DEFAULTS = Object.freeze({
    pause: 1.2,          // a gap between sentences at least this long starts a new candidate
    minLen: 4,           // shorter groups are dropped
    maxLen: 45,          // longer runs are split at a sentence boundary
    silenceDb: -45,      // quieter than this counts as silence (sound-only candidates)
    silenceMin: 1,       // seconds of silence that separate two sound-only candidates
    loudMinDb: 4,        // louder than the timeline's median by at least this → a loudness reason
    danmakuMinRatio: 1.8, // this many times the average danmaku rate → a danmaku reason
    speechMinRatio: 1.35, // characters per second against the median sentence → a speech reason
    beatMinRate: 1.2,    // beats per second inside the window → a beat reason (only adds, never alone)
    max: 12,             // at most this many cards
  });
  const r1 = (x) => Math.round(x * 10) / 10, r3 = (x) => Math.round(x * 1000) / 1000;
  const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const chars = (text) => String(text || "").replace(/[\s\p{P}]/gu, "").length;

  /** Sentence groups (or, without sentences, spans of sound between silences) — the candidate windows. */
  function segments(sig, opts = DEFAULTS) {
    const o = { ...DEFAULTS, ...opts }, out = [];
    const list = (sig.sentences || []).filter((s) => s.end > s.start).slice().sort((a, b) => a.start - b.start);
    if (list.length) {
      let cur = null;
      const close = () => { if (cur && cur.to - cur.from >= o.minLen) out.push(cur); cur = null; };
      for (const s of list) {
        if (cur && (s.start - cur.to >= o.pause || s.end - cur.from > o.maxLen)) close();
        if (!cur) cur = { from: s.start, to: s.end, sentenceIds: [s.id], text: [s.text] };
        else { cur.to = Math.max(cur.to, s.end); cur.sentenceIds.push(s.id); cur.text.push(s.text); }
      }
      close();
      return out.map((g) => ({ from: r3(g.from), to: r3(g.to), sentenceIds: g.sentenceIds, text: g.text.join(" ") }));
    }
    const L = sig.loudness;
    if (!L || !L.values || !L.values.length) return out;
    // spans of sound: runs of bins above the silence level, joined across silences shorter than silenceMin
    const loud = L.values.map((v) => v > o.silenceDb), spans = [];
    let start = -1, quiet = 0;
    for (let i = 0; i <= loud.length; i++) {
      const on = i < loud.length && loud[i];
      if (on) { if (start < 0) start = i; quiet = 0; }
      else if (start >= 0) {
        quiet++;
        if (i === loud.length || quiet * L.step >= o.silenceMin) { spans.push([start * L.step, (i - quiet + 1) * L.step]); start = -1; quiet = 0; }
      }
    }
    for (let [f, t] of spans) {
      t = Math.min(t, sig.duration || t);
      while (t - f > o.maxLen) { out.push({ from: r3(f), to: r3(f + o.maxLen), sentenceIds: [], text: "" }); f += o.maxLen; }
      if (t - f >= o.minLen) out.push({ from: r3(f), to: r3(t), sentenceIds: [], text: "" });
    }
    return out;
  }

  function windowDb(L, from, to) {
    const i0 = Math.max(0, Math.floor(from / L.step)), i1 = Math.min(L.values.length, Math.ceil(to / L.step));
    const xs = L.values.slice(i0, i1);
    if (!xs.length) return null;
    // the mean of power, not of decibels
    const mean = 10 * Math.log10(xs.reduce((s, v) => s + Math.pow(10, v / 10), 0) / xs.length);
    return { mean, peak: Math.max(...xs) };
  }

  /** Candidates, best first. Every reason: {signal, value, baseline, window, …}. */
  function candidates(sig, opts = DEFAULTS) {
    const o = { ...DEFAULTS, ...opts };
    if (!(sig && sig.duration > 0)) return [];
    const segs = segments(sig, o);
    if (!segs.length) return [];
    const L = sig.loudness && sig.loudness.values && sig.loudness.values.length ? sig.loudness : null;
    const heard = L ? L.values.filter((v) => v > o.silenceDb) : [];
    const loudBase = heard.length ? median(heard) : null;
    const dm = Array.isArray(sig.danmaku) ? sig.danmaku.map((d) => (typeof d === "number" ? d : d && d.t)).filter((t) => Number.isFinite(t)) : [];
    const dmRate = dm.length ? dm.length / sig.duration : 0;
    const sentences = sig.sentences || [];
    const rates = sentences.filter((s) => s.end > s.start).map((s) => chars(s.text) / (s.end - s.start)).filter((x) => x > 0);
    const speechBase = rates.length ? median(rates) : null;
    const beats = Array.isArray(sig.beats) ? sig.beats : [];
    const out = [];
    for (const g of segs) {
      const win = [g.from, g.to], len = g.to - g.from, reasons = [];
      let score = 0;
      if (L && loudBase != null) {
        const w = windowDb(L, g.from, g.to);
        if (w) {
          const above = w.mean - loudBase, peakAbove = w.peak - loudBase;
          if (above >= o.loudMinDb || peakAbove >= o.loudMinDb + 4) {
            reasons.push({ signal: "loudness", value: r1(Math.max(above, 0)), peak: r1(peakAbove), baseline: r1(loudBase), unit: "dB", window: win });
            score += Math.min(1, Math.max(above, peakAbove / 2) / 12) * 0.55;
          }
        }
      }
      if (dmRate > 0) {
        const count = dm.filter((t) => t >= g.from && t < g.to).length, ratio = count / len / dmRate;
        if (ratio >= o.danmakuMinRatio && count >= 3) {
          reasons.push({ signal: "danmaku", value: r1(ratio), count, perMinute: r1(count / len * 60), baseline: r1(dmRate * 60), window: win });
          score += Math.min(1, (ratio - 1) / 4) * 0.45;
        }
      }
      if (speechBase && g.sentenceIds.length) {
        const own = sentences.filter((s) => g.sentenceIds.includes(s.id));
        const spoken = own.reduce((s, x) => s + (x.end - x.start), 0), n = own.reduce((s, x) => s + chars(x.text), 0);
        const rate = spoken > 0 ? n / spoken : 0, ratio = rate / speechBase;
        if (ratio >= o.speechMinRatio) {
          reasons.push({ signal: "speech", value: r1(ratio), perSecond: r1(rate), baseline: r1(speechBase), window: win });
          score += Math.min(1, (ratio - 1) / 1.5) * 0.15;
        }
      }
      // a beat only adds to a window that already stands out (a music bed alone is not a highlight)
      if (score > 0 && beats.length) {
        const n = beats.filter((t) => t >= g.from && t < g.to).length, rate = n / len;
        if (rate >= o.beatMinRate) { reasons.push({ signal: "beat", value: r1(rate * 60), count: n, window: win }); score += 0.05; }
      }
      if (score > 0) out.push({ from: g.from, to: g.to, score: Math.round(score * 1000) / 1000, reasons, sentenceIds: g.sentenceIds, text: g.text });
    }
    out.sort((a, b) => b.score - a.score || a.from - b.from);
    return out.slice(0, o.max).map((c, i) => ({ ...c, rank: i + 1 }));
  }

  /** Why there are no cards: no-media (nothing on the timeline), no-signals (no sentences and no sound to read),
   *  nothing-stands-out (signals read, nothing above the ordinary). */
  function emptyReason(sig) {
    if (!(sig && sig.duration > 0)) return "no-media";
    const hasSound = sig.loudness && sig.loudness.values && sig.loudness.values.length;
    if (!(sig.sentences && sig.sentences.length) && !hasSound) return "no-signals";
    return "nothing-stands-out";
  }

  return { DEFAULTS, segments, candidates, emptyReason, windowDb };
});
