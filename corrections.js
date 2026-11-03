/* The streamer's corrections to the 「自动出切片」 cards, kept on this computer to make the next search closer (the owner:
   「主播的修改记在本机用来让下次更准（不外发）」; Deja, 2026-11-03). Pure: what a record may hold, the numbers about a part's
   sound, and the fixed rules worked out from the records. desktop/corrections-store.js keeps them under userData.
   A record holds numbers and its fixed words only — a card's kind changed, a part added, how far a start and end were
   moved, a card taken out, the recording's length, and the part's length, usual level and how often it pauses. Never
   the recording, its sound, subtitle text or a file name: anything else is refused, not trimmed.
   The rules are fixed (no model is trained):
     shift   — per kind, the mean start / end shift of three or more trims of that kind, each at most ±MAX_SHIFT s;
     songBar — three or more parts marked 「不是唱歌」 (a song changed to another kind): a song that pauses at least as often
               as the upper quartile of them is called a 普通高光 instead (the least, or the median, cost recall on the
               golden set's held-out part; the upper quartile did not).
   Each card lists the rules that changed it (card.rules). With no rules (off, or nothing kept) the cards are returned
   exactly as given. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipCorrections = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KINDS = Object.freeze(["song", "moment", "other"]), TYPES = Object.freeze(["kind", "add", "trim", "remove"]);
  const MAX_SHIFT = 10, MIN_SAMPLES = 3, PAUSE_DB = 14, MIN_LEN = 5, MIN_BAR = 0.02;
  const FIELDS = { kind: ["from", "to", "features"], add: ["kind", "features"], trim: ["kind", "startShift", "endShift"], remove: ["kind", "features"] };
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
  const fail = () => { throw new Error("CORRECTION_INVALID"); };

  /** A record to keep: {type, …} → {v:1, at, type, …} with only its own fields; anything else throws CORRECTION_INVALID. */
  function record(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || !TYPES.includes(input.type)) fail();
    const own = FIELDS[input.type], extra = ["type", "duration", "at", "v"];
    for (const k of Object.keys(input)) if (!own.includes(k) && !extra.includes(k)) fail();
    if (!num(input.duration, 0, 86400 * 7)) fail();
    const out = { v: 1, at: num(input.at, 0, 1e15) ? Math.round(input.at) : Date.now(), type: input.type, duration: r2(input.duration) };
    for (const k of own) {
      const v = input[k];
      if (k === "features") { if (v != null) out.features = features0(v); continue; }
      if (k === "startShift" || k === "endShift") { if (!num(v, -86400, 86400)) fail(); out[k] = r2(v); continue; }
      if (!KINDS.includes(v)) fail();
      out[k] = v;
    }
    if (input.type === "kind" && out.from === out.to) fail();
    return out;
  }
  function features0(f) {
    if (!f || typeof f !== "object" || Array.isArray(f)) fail();
    for (const k of Object.keys(f)) if (!["len", "level", "pause"].includes(k)) fail();
    if (!num(f.len, 0, 86400 * 7) || !num(f.level, -200, 50) || !num(f.pause, 0, 1)) fail();
    return { len: r2(f.len), level: r2(f.level), pause: r3(f.pause) };
  }

  /** A part's sound in numbers: its length, its usual (median) level and how often it drops PAUSE_DB below that. */
  function features(part, loudness) {
    if (!loudness || !Array.isArray(loudness.values) || !(loudness.step > 0)) return null;
    const st = loudness.step, xs = loudness.values.slice(Math.max(0, Math.floor(part.s / st)), Math.max(0, Math.ceil(part.e / st))).filter(Number.isFinite);
    if (!xs.length) return null;
    const sorted = xs.slice().sort((x, y) => x - y), med = sorted[sorted.length >> 1];
    return { len: r2(part.e - part.s), level: r2(med), pause: r3(xs.filter((x) => x < med - PAUSE_DB).length / xs.length) };
  }

  const clamp = (x) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, x));
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  /** The fixed rules from the records: {shift: {kind: {start, end, n}}, songBar?: {pause, n}}. */
  function rules(records) {
    const list = Array.isArray(records) ? records : [], out = { shift: {} };
    for (const k of KINDS) {
      const t = list.filter((r) => r.type === "trim" && r.kind === k);
      if (t.length >= MIN_SAMPLES) out.shift[k] = { start: r2(clamp(mean(t.map((r) => r.startShift)))), end: r2(clamp(mean(t.map((r) => r.endShift)))), n: t.length };
    }
    const notSong = list.filter((r) => r.type === "kind" && r.from === "song" && r.to !== "song" && r.features);
    if (notSong.length >= MIN_SAMPLES) {
      // the upper quartile, not the least: one quiet rejected part must not make every song look like talk
      const p = notSong.map((r) => r.features.pause).sort((x, y) => x - y);
      out.songBar = { pause: Math.max(MIN_BAR, p[Math.min(p.length - 1, Math.floor(0.75 * p.length))]), n: notSong.length };
    }
    return out;
  }
  const none = (r) => !r || (!Object.keys(r.shift || {}).length && !r.songBar);

  /** The cards with the rules applied; opts: {duration: {mediaId: s}, loudness: {mediaId: {step, values}}}. With no
   *  rules the very same cards (a copy) come back, without a rules field. */
  function apply(cards, r, opts = {}) {
    const list = JSON.parse(JSON.stringify(Array.isArray(cards) ? cards : []));
    if (none(r)) return list;
    return list.map((c) => {
      const used = [];
      let kind = c.kind, s = c.s, e = c.e;
      if (kind === "song" && r.songBar) {
        const f = features(c, opts.loudness && opts.loudness[c.mediaId]);
        if (f && f.pause >= r.songBar.pause) { kind = "moment"; used.push("song-bar"); }
      }
      const sh = r.shift[kind], max = opts.duration && Number.isFinite(opts.duration[c.mediaId]) ? opts.duration[c.mediaId] : Infinity;
      if (sh) {
        const ns = r3(Math.max(0, s + sh.start)), ne = r3(Math.min(max, e + sh.end));
        if (sh.start && ns !== s && ne - ns >= MIN_LEN) { s = ns; used.push("shift-start:" + kind); }
        if (sh.end && ne !== e && ne - s >= MIN_LEN) { e = ne; used.push("shift-end:" + kind); }
      }
      return { ...c, kind, s, e, rules: used };
    });
  }

  /** Numbers only, for the assistant — sent only when the streamer opens it and agrees (not wired yet). */
  function summary(records) {
    const list = Array.isArray(records) ? records : [], r = rules(list), byType = {};
    for (const t of TYPES) byType[t] = list.filter((x) => x.type === t).length;
    return { count: list.length, byType, shift: r.shift, songBar: r.songBar || null };
  }
  return Object.freeze({ KINDS, TYPES, MAX_SHIFT, MIN_SAMPLES, record, features, rules, apply, summary });
});
