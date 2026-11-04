/* Event boundaries for a slice — PROTOTYPE, not wired into the app (docs/decisions/2026-11-03-event-boundaries.md).
 *
 * The highlight engine finds where a stream is hot; its card ends follow sentences or silences, and without sentences
 * they fall on a 45 s grid. Here each end of a card is moved — after the streamer's habit shift (corrections.js), at
 * most ±5 s — to a natural edge, using evidence already on the computer:
 *   - speech: sentences from the transcript's words (a punctuation mark or a gap ends one); a long pause between two
 *     sentences is a likely change of topic;
 *   - picture: scene-change times (ffmpeg's scene score, as analyze.js reads them), optional.
 * An edge where both agree is the strongest. An end the streamer moved is left alone; with no edge in reach an end
 * stays where it is and says so. magnet() is the separate drag-time pull (±0.6 s, VV).
 * Idea credited to openJiuwen AgentMemory 0.2.0, OmniMem-Lens (audio-visual dual-stream memory: cut long video at real
 * event edges, picture and speech checking each other; https://gitcode.com/openJiuwen/agent-memory, Apache-2.0), as
 * reported by 量子位 (https://mp.weixin.qq.com/s/uAe1SVHs8bHBalJiTbri3Q). No code was taken from it; this is MontClip's own.
 * Pure: no page, no server, no model. Times are seconds of one recording.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipEventBounds = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DEFAULTS = Object.freeze({
    sentenceGap: 0.6,  // words further apart than this are two sentences
    topicPause: 1.2,   // a pause this long between sentences is a likely event edge (the highlight engine's `pause`)
    agree: 1.0,        // a scene change this close to a sentence edge confirms it
    reach: 5,          // each end moves at most this far (Deja: the habit shift's own limit, corrections.js MAX_SHIFT)
    startBreath: 0.3,  // a start sits this long before the first word (VV)
    endBreath: 0.4,    // an end this long after the last word (VV)
    minLen: 5,
  });
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const END_MARK = /[。？！?!…]$/;

  /** Transcript words [[text, start, end], …] → sentences [{start, end}]. */
  function sentences(words, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, out = [];
    let cur = null;
    for (const w of words || []) {
      const [text, s, e] = w;
      if (!(e >= s)) continue;
      if (cur && s - cur.end > o.sentenceGap) { out.push(cur); cur = null; }
      if (!cur) cur = { start: s, end: e }; else cur.end = Math.max(cur.end, e);
      if (END_MARK.test(String(text))) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.map((x) => ({ start: r3(x.start), end: r3(x.end) }));
  }

  /** The edges between sentences, each with how sure it is: pause (topicPause or longer), scene (a scene change within
   *  `agree`), both. Without sentences the scene changes alone are the edges. */
  function edges({ sentences: list = [], cuts = [] } = {}, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, s = list.slice().sort((a, b) => a.start - b.start), out = [];
    const near = (t) => cuts.some((c) => Math.abs(c - t) <= o.agree);
    if (!s.length) return cuts.map((t) => ({ t, end: t, start: t, why: ["scene"], strong: true }));
    for (let i = 0; i <= s.length; i++) {
      const prev = s[i - 1], next = s[i];
      const end = prev ? prev.end : 0, start = next ? next.start : Infinity, gap = start - end;
      const why = [];
      if (!prev || !next || gap >= o.topicPause) why.push("pause");
      if ((prev && near(end)) || (next && near(start)) || cuts.some((c) => c >= end && c <= start)) why.push("scene");
      out.push({ end, start, t: next ? start : end, why, strong: why.length > 0, gap: Number.isFinite(gap) ? r3(gap) : null });
    }
    return out;
  }

  /** Snap a card's two ends to sentence edges (Deja, 2026-11-03): after the habit shift (corrections.js), each end
   *  moves at most ±reach (5 s, the habit shift's own limit) to the nearest strong edge (a pause of topicPause or more,
   *  a scene change, both), else to the nearest sentence edge; with neither in reach it stays (why "no-pause":
   *  附近没有停顿，没动). An end the streamer moved (its value differs from s0 / e0, 「你调过」) is never touched (why
   *  "adjusted"). A start lands startBreath before the sentence's first word, an end endBreath after its last, never
   *  into the sentence next to it, so a moved end is never inside a sentence.
   *  card {s, e, s0?, e0?}; ev {sentences, cuts?, duration?} → {s, e, start: {how, moved, why?}, end: {how, moved, why?}}
   *  how: both | pause | scene | sentence | kept. */
  function snap(card, ev = {}, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, list = (ev.sentences || []).filter((x) => x.end >= x.start).slice().sort((a, b) => a.start - b.start);
    const E = edges({ sentences: list, cuts: ev.cuts || [] }, o), dur = Number.isFinite(ev.duration) ? ev.duration : Infinity;
    const how = (e) => (e.why.length === 2 ? "both" : e.why[0] || "sentence");
    function one(t, side, was) {
      if (Number.isFinite(was) && Math.abs(t - was) > 1e-6) return { t, how: "kept", moved: 0, why: "adjusted" };
      // each edge between two sentences: a start target (before the next sentence) and an end target (after the last)
      const targets = [];
      for (const e of E) {
        if (side === "s" && Number.isFinite(e.start)) targets.push({ x: r3(Math.max(e.start - o.startBreath, e.end, 0)), e });
        if (side === "e" && e.end > 0) targets.push({ x: r3(Math.min(e.end + o.endBreath, e.start, dur)), e });
      }
      const near = targets.filter((g) => Math.abs(g.x - t) <= o.reach + 1e-9);
      const pick = (xs) => xs.reduce((b, g) => (b == null || Math.abs(g.x - t) < Math.abs(b.x - t) ? g : b), null);
      const g = pick(near.filter((g) => g.e.strong)) || pick(near);
      if (!g) return { t, how: "kept", moved: 0, why: "no-pause" };
      return { t: g.x, how: g.e.strong ? how(g.e) : "sentence", moved: r3(g.x - t) };
    }
    const a = one(card.s, "s", card.s0), b = one(card.e, "e", card.e0);
    // a card that would become too short keeps its ends
    if (b.t - a.t < o.minLen) return { s: card.s, e: card.e, start: { how: "kept", moved: 0, why: "too-short" }, end: { how: "kept", moved: 0, why: "too-short" } };
    const side = (x) => ({ how: x.how, moved: x.moved, ...(x.why ? { why: x.why } : {}) });
    return { s: a.t, e: b.t, start: side(a), end: side(b) };
  }

  /** Is t strictly inside one of the sentences (not in a gap, not on an edge)? */
  const insideSentence = (t, list, eps = 1e-6) => (list || []).some((x) => t > x.start + eps && t < x.end - eps);

  /** The drag-time magnet (VV's 剪辑手感清单 #1–2, numbers are VV's guesses until measured): while an end is dragged to
   *  t, it is pulled to a sentence edge plus breath — an end to the last word's end + 0.4 s, a start to the first word's
   *  start − 0.3 s — only when that target is within ±0.6 s and sure: the sentence ends in a mark (。？！) or a pause of
   *  topicPause or more follows (end) / comes before (start). Unsure edges come back as ticks, never pulled.
   *  words: transcript words [[text, start, end], …]. → {t, snapped, why?, ticks: [t…]} */
  function magnet(t, side, words, opts = {}) {
    const o = { ...DEFAULTS, reach: 0.6, ...opts };
    const w = (words || []).filter((x) => x && x[2] >= x[1]), sure = [], ticks = [];
    for (let i = 0; i < w.length; i++) {
      if (side === "e") {
        const next = w[i + 1], gap = next ? next[1] - w[i][2] : Infinity;
        if (!(END_MARK.test(String(w[i][0])) || gap > o.sentenceGap)) continue;
        const at = r3(Math.min(w[i][2] + o.endBreath, next ? next[1] : Infinity));
        (END_MARK.test(String(w[i][0])) || gap >= o.topicPause ? sure : ticks).push(at);
      } else {
        const prev = w[i - 1], gap = prev ? w[i][1] - prev[2] : Infinity;
        if (!((prev && END_MARK.test(String(prev[0]))) || gap > o.sentenceGap)) continue;
        const at = r3(Math.max(w[i][1] - o.startBreath, prev ? prev[2] : 0, 0));
        (gap >= o.topicPause || (prev && END_MARK.test(String(prev[0]))) ? sure : ticks).push(at);
      }
    }
    let best = null;
    for (const x of sure) if (Math.abs(x - t) <= o.reach + 1e-9 && (best == null || Math.abs(x - t) < Math.abs(best - t))) best = x;
    const near = (xs) => xs.filter((x) => Math.abs(x - t) <= 5);
    return best == null ? { t, snapped: false, ticks: near(sure.concat(ticks)).sort((a, b) => a - b) }
      : { t: best, snapped: true, why: side === "e" ? "sentence-end" : "sentence-start", ticks: near(ticks).sort((a, b) => a - b) };
  }

  /** How far predicted slices are from hand-marked ones (matched in order): mean |start| and |end| error in seconds,
   *  and the share of edges within ±1 s and ±3 s — the measure the ADR uses. */
  function edgeErrors(pred, gold) {
    const n = Math.min(pred.length, gold.length), es = [], ee = [];
    for (let i = 0; i < n; i++) { es.push(Math.abs(pred[i].from - gold[i].from)); ee.push(Math.abs(pred[i].to - gold[i].to)); }
    const all = es.concat(ee), share = (lim) => (all.length ? r3(all.filter((x) => x <= lim).length / all.length) : null);
    const mean = (xs) => (xs.length ? r3(xs.reduce((x, y) => x + y, 0) / xs.length) : null);
    return { n, start: mean(es), end: mean(ee), within1: share(1), within3: share(3) };
  }

  return { DEFAULTS, sentences, edges, snap, insideSentence, magnet, edgeErrors };
});
