/* The streamer's corrections to the 「自动出切片」 cards, kept on this computer to make the next search closer (the owner:
   「主播的修改记在本机用来让下次更准（不外发）」; Deja, 2026-11-03). Pure: what a record may hold, the numbers about a part's
   sound, and the fixed rules worked out from the records. desktop/corrections-store.js keeps them under userData.
   A record holds numbers and its fixed words only — a card's kind changed, a part added, how far a start and end were
   moved, a card taken out, the recording's length, and the part's length, usual level and how often it pauses. Never
   the recording, its sound, subtitle text or a file name: anything else is refused, not trimmed.
   互动 (interaction), 聊天 (chat) and 整活 (stunt) are kinds like the others: no rule finds them; only the streamer's own
   moves shift their start and end.
   They are never sent: the assistant, the song-name lookup and cloud transcription do not read them (Deja, ADR 补记
   fb2e6964; test/corrections-private.test.js).
   The rules are fixed (no model is trained), and each is a habit — the same kind, the same direction, HABIT_MIN of the
   last HABIT_WINDOW:
     shift — a kind's start (or end) moved the same way: cards of that kind move by the mean of those moves, at most
             ±MAX_SHIFT s;
     bar   — 「不是唱歌」 (a song made another kind) raises the singing bar, 「是唱歌」 (made a song) lowers it: songs.js
             PAUSE moves to the median pause of those parts, never past half of its first value either way (BAR_RANGE).
             OFF by default (BAR_ON; Deja, 2026-11-03, from the LOSO numbers: 0.19 of recall for 0.02 of precision); kept,
             with its tests, for when real corrections exist.
   One rule is not a habit: a part marked 「不是唱歌」 in a recording is not a song card again when that same recording is
   searched again (a song card more than half inside it): it comes back as the kind the streamer gave it, at the start and
   end they had (「不是唱歌」 says the part is not a song, not that it is unwanted; VV / Deja, 2026-11-03) — unless they also
   took it out (不要这条), then it stays away. A part the streamer added (补一段) comes back the same way, as its kind,
   where they put it, until they take it out. The recording is known by recordingKey — its length and a hash of its
   sound — never by its path.
   Each card lists the rules that touched it (card.rules). With no rules (off, or nothing kept) the cards come back exactly
   as given, and the search gets no options. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipCorrections = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KINDS = Object.freeze(["song", "interaction", "chat", "stunt", "moment", "other"]), TYPES = Object.freeze(["kind", "add", "trim", "remove"]);
  // Deja's numbers (ADR 补记 fb2e6964): a move of at most 5 s; a habit is 4 of the last 5
  const MAX_SHIFT = 5, HABIT_WINDOW = 5, HABIT_MIN = 4, PAUSE_DB = 14, MIN_LEN = 5;
  // the singing bar starts where songs.js has it (DEFAULTS.PAUSE) and moves at most half of that either way
  const BAR_BASE = 0.12, BAR_RANGE = Object.freeze([BAR_BASE / 2, BAR_BASE * 1.5]);
  // the singing bar is off: with it off the search keeps songs.js PAUSE (0.12)
  const BAR_ON = false;
  const FIELDS = { kind: ["from", "to", "features", "rec", "s", "e"], trim: ["kind", "startShift", "endShift"], remove: ["kind", "features", "rec", "s", "e"], add: ["kind", "features", "rec", "s", "e"] };
  const r2 = (x) => Math.round(x * 100) / 100, r3 = (x) => Math.round(x * 1000) / 1000;
  const num = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
  const fail = () => { throw new Error("CORRECTION_INVALID"); };

  /** A record to keep: {type, …} → {v:1, at, type, …} with only its own fields; anything else throws CORRECTION_INVALID. */
  function record(input) {
    if (!input || typeof input !== "object" || Array.isArray(input) || !TYPES.includes(input.type)) fail();
    const own = FIELDS[input.type], extra = ["type", "duration", "at", "v", "id"];
    for (const k of Object.keys(input)) if (!own.includes(k) && !extra.includes(k)) fail();
    if (!num(input.duration, 0, 86400 * 7)) fail();
    const out = { v: 1, at: num(input.at, 0, 1e15) ? Math.round(input.at) : Date.now(), type: input.type, duration: r2(input.duration) };
    // the store's own id for a record, so undoing an edit can take its record back
    if ("id" in input) { if (typeof input.id !== "string" || !/^[a-f0-9]{16}$/.test(input.id)) fail(); out.id = input.id; }
    // a kind change, a taking-out or an added part may say which recording and which part (rec, s, e: all three or none)
    const where = ["rec", "s", "e"].filter((k) => k in input);
    if (where.length && (where.length !== 3 || typeof input.rec !== "string" || !/^[a-f0-9]{16}$/.test(input.rec)
      || !num(input.s, 0, out.duration) || !num(input.e, 0, out.duration) || input.e <= input.s)) fail();
    for (const k of own) {
      const v = input[k];
      if (k === "rec" || k === "s" || k === "e") { if (where.length) out[k] = k === "rec" ? v : r2(v); continue; }
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

  /** Which recording, without its path: its length and its sound (the loudness bins, to 0.1 dB), hashed (FNV-1a, 64 bits)
   *  → 16 hex digits; null without them. The same file gives the same key; another file, another length or sound, another. */
  function recordingKey(duration, loudness) {
    if (!Number.isFinite(duration) || !loudness || !Array.isArray(loudness.values) || !loudness.values.length || !(loudness.step > 0)) return null;
    const text = r2(duration) + "|" + loudness.step + "|" + loudness.values.map((x) => (Number.isFinite(x) ? Math.round(x * 10) : "n")).join(",");
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
    return h.toString(16).padStart(16, "0");
  }
  /** A part's sound in numbers: its length, its usual (median) level and how often it drops PAUSE_DB below that. */
  function features(part, loudness) {
    if (!loudness || !Array.isArray(loudness.values) || !(loudness.step > 0)) return null;
    const st = loudness.step, xs = loudness.values.slice(Math.max(0, Math.floor(part.s / st)), Math.max(0, Math.ceil(part.e / st))).filter(Number.isFinite);
    if (!xs.length) return null;
    const sorted = xs.slice().sort((x, y) => x - y), med = sorted[sorted.length >> 1];
    return { len: r2(part.e - part.s), level: r2(med), pause: r3(xs.filter((x) => x < med - PAUSE_DB).length / xs.length) };
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  const median = (xs) => xs.slice().sort((x, y) => x - y)[xs.length >> 1];
  /** A habit among the last HABIT_WINDOW values: HABIT_MIN or more the same sign → {values: those, n: how many were
   *  looked at}; else null. The card says 「你以前 n 首里有 of 首…」. */
  function habit(values) {
    const last = values.slice(-HABIT_WINDOW), up = last.filter((v) => v > 0), down = last.filter((v) => v < 0);
    const same = up.length >= HABIT_MIN ? up : down.length >= HABIT_MIN ? down : null;
    return same && { values: same, n: last.length };
  }
  /** The fixed rules from the records: {shift: {kind: {start?: {by, of}, end?: {by, of}}}, bar?: {dir, PAUSE, of},
   *  notSong?: [{rec, s, e, to}], gone?: [{rec, s, e}], added?: [{rec, s, e, kind, id}]}. opts.bar turns the singing bar on (default BAR_ON, off). */
  function rules(records, { bar = BAR_ON } = {}) {
    const list = Array.isArray(records) ? records : [], out = { shift: {} };
    for (const k of KINDS) {
      const t = list.filter((x) => x.type === "trim" && x.kind === k), one = {};
      for (const [edge, key] of [["start", "startShift"], ["end", "endShift"]]) {
        const h = habit(t.map((x) => x[key]));
        if (h) one[edge] = { by: r2(clamp(mean(h.values), -MAX_SHIFT, MAX_SHIFT)), of: h.values.length, n: h.n };
      }
      if (one.start || one.end) out.shift[k] = one;
    }
    // 「不是唱歌」 (+1: the bar up, stricter) and 「是唱歌」 (−1: the bar down), the last of them in order
    const kinds = list.filter((x) => x.type === "kind" && (x.from === "song") !== (x.to === "song"));
    const marked = kinds.filter((x) => x.from === "song" && x.rec).map((x) => ({ rec: x.rec, s: x.s, e: x.e, to: x.to }));
    if (marked.length) out.notSong = marked;
    // the parts taken out (不要这条) in a known recording: a part marked 不是唱歌 and taken out stays away
    const gone = list.filter((x) => x.type === "remove" && x.rec).map((x) => ({ rec: x.rec, s: x.s, e: x.e }));
    if (gone.length) out.gone = gone;
    // the parts added (补一段) in a known recording and not taken out since: a later taking-out of that card (the same
    // recording, more than half of each inside the other — a bigger card taken out earlier or later is another card)
    const same = (a, b) => a.rec === b.rec && Math.min(a.e, b.e) - Math.max(a.s, b.s) > Math.max(a.e - a.s, b.e - b.s) / 2;
    const added = list.map((x, i) => [x, i]).filter(([x, i]) => x.type === "add" && x.rec && !list.slice(i + 1).some((g) => g.type === "remove" && g.rec && same(g, x)))
      .map(([x]) => ({ rec: x.rec, s: x.s, e: x.e, kind: x.kind, id: x.id }));
    if (added.length) out.added = added;
    const h = bar && habit(kinds.map((x) => (x.from === "song" ? 1 : -1)));
    if (h) {
      const dir = h.values[0] > 0 ? "up" : "down", same = kinds.slice(-HABIT_WINDOW).filter((x) => (x.from === "song") === (dir === "up") && x.features);
      if (same.length) {
        const p = median(same.map((x) => x.features.pause));
        out.bar = { dir, PAUSE: r3(dir === "up" ? clamp(p, BAR_RANGE[0], BAR_BASE) : clamp(p, BAR_BASE, BAR_RANGE[1])), of: h.values.length, n: h.n };
      }
    }
    return out;
  }
  const none = (r) => !r || (!Object.keys(r.shift || {}).length && !r.bar && !(r.notSong && r.notSong.length) && !(r.added && r.added.length));
  /** songs.js options for the search: the moved bar, or nothing. */
  const songOptions = (r) => (r && r.bar ? { PAUSE: r.bar.PAUSE } : {});

  /** The cards with the rules applied; opts: {duration: {mediaId: s}, recKey: {mediaId: recordingKey}}. With no rules
   *  the very same cards (a copy) come back, without a rules field. A song card found with a moved bar says so
   *  (song-bar). A song card more than half inside a part marked 不是唱歌 in the same recording becomes that part, as the
   *  kind it was given (changedFrom "song", the rule not-song; one card per part, not moved by a habit), or stays away
   *  if that part was also taken out. A part added in a recording being searched comes back after the cards: its kind,
   *  where it was added, added (rule added, keptId: the record's id; not moved by a habit). */
  function apply(cards, r, opts = {}) {
    const list = JSON.parse(JSON.stringify(Array.isArray(cards) ? cards : []));
    if (none(r)) return list;
    const marks = r.notSong || [], gone = r.gone || [], keyOf = opts.recKey || {}, done = new Set();
    const over = (a, b) => Math.min(a.e, b.e) - Math.max(a.s, b.s);
    const markOf = (c) => (c.kind === "song" && keyOf[c.mediaId] && c.e > c.s ? marks.find((m) => m.rec === keyOf[c.mediaId] && over(c, m) > (c.e - c.s) / 2) : null);
    const out = [];
    for (const c of list) {
      const m = markOf(c);
      if (!m) { out.push(c); continue; }
      if (done.has(m) || gone.some((g) => g.rec === m.rec && over(g, m) > (m.e - m.s) / 2)) continue;
      done.add(m);
      out.push({ ...c, kind: m.to, s: m.s, e: m.e, at: m.s, reasons: [], changedFrom: "song", rules: ["not-song"] });
    }
    const mediaOf = new Map(Object.entries(keyOf).filter(([, k]) => k).map(([m, k]) => [k, m]));
    for (const x of r.added || []) {
      const mediaId = mediaOf.get(x.rec);
      if (!mediaId) continue;
      let id = mediaId + "_a" + Math.round(x.s * 10), n = 2;
      while (out.some((c) => c.id === id) || list.some((c) => c.id === id)) id = mediaId + "_a" + Math.round(x.s * 10) + "_" + n++;
      out.push({ id, mediaId, kind: x.kind, no: null, s: x.s, e: x.e, at: x.s, added: true, rules: ["added"], ...(x.id ? { keptId: x.id } : {}) });
    }
    return out.map((c) => {
      if (c.changedFrom || c.added) return c;
      const used = [];
      let s = c.s, e = c.e;
      if (c.kind === "song" && r.bar) used.push("song-bar");
      const sh = r.shift[c.kind] || {}, max = opts.duration && Number.isFinite(opts.duration[c.mediaId]) ? opts.duration[c.mediaId] : Infinity;
      if (sh.start) { const ns = r3(Math.max(0, s + sh.start.by)); if (ns !== s && e - ns >= MIN_LEN) { s = ns; used.push("shift-start:" + c.kind); } }
      if (sh.end) { const ne = r3(Math.min(max, e + sh.end.by)); if (ne !== e && ne - s >= MIN_LEN) { e = ne; used.push("shift-end:" + c.kind); } }
      // a card moved by a habit keeps where it was, for 〔这次不用〕 (v11)
      return s !== c.s || e !== c.e ? { ...c, s, e, rules: used, was: { s: c.s, e: c.e } } : { ...c, s, e, rules: used };
    });
  }
  /** 〔这次不用〕: a card moved by a habit back where the search put it, its rules dropped; any other card as it is. */
  function revert(card) {
    const c = JSON.parse(JSON.stringify(card));
    if (!c.was) return c;
    const { was, ...rest } = c;
    return { ...rest, s: was.s, e: was.e, rules: [], notThisTime: true };
  }
  return Object.freeze({ KINDS, TYPES, MAX_SHIFT, HABIT_WINDOW, HABIT_MIN, BAR_BASE, BAR_RANGE, BAR_ON, record, recordingKey, features, rules, songOptions, apply, revert });
});
