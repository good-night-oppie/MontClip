/* 「✨ 自动出切片」 (P3, Deja 2026-11-03; frozen design documents/2026-11-03-自动出切片-冻结设计/, v7 with v7.5 last):
   what the dialog shows, worked out from each recording's found songs (songs.js), its loudness every 0.5 s and its
   highlight candidates (highlight-candidates.js). Pure — no page, no server; app.js draws it.
     build({recordings:[{mediaId, duration, songs, loudness, highlights}], kind, count, len}) → {clips, found, few}
   kind: what the stream is mostly — auto (songs and highlights; a highlight inside a song is left out), sing (songs),
   chat / game / watch (highlights). Best first, at most `count`, the best `checked` ticked. A song scores by how much
   louder than the recording's usual level it is, on the highlight engine's loudness scale (24 dB = full), so songs
   and highlights rank together. Every song card is 「估的」 at both ends (Deja: songs.js is not accurate enough to call
   any song right); a highlight's ends follow its sentences or silences. len: song (whole songs), hook and short (a
   song becomes its loudest 45 s). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipAutoSlices = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KINDS = ["auto", "sing", "chat", "game", "watch"], LENS = ["song", "hook", "short"], COUNTS = [3, 5, 8, 12];
  const DEFAULTS = Object.freeze({ kind: "auto", count: 5, checked: 3, len: "song", hookLen: 45, minLen: 5 });
  const LOUD_FULL = 24, LOUD_WEIGHT = 0.55, LOUD_MIN = 4;   // the highlight engine's loudness scale (highlight-candidates.js)
  /* Naming a part 「第 n 首歌」 waits for songs.js to be right often enough (Deja, 2026-11-03): on the acceptance set,
     precision@15 and recall@10 both at least 0.6. Until then a song card is 「{time} 那段」, 「可能在唱歌」. SONG_MEASURED is
     the last measurement (real-tests/songs-golden.cjs: precision@15 on 15 recordings from 13 streamers, recall@10 on the
     4 held-out recordings from 4 streamers); update it when a new measurement is made. */
  const SONG_GATE = Object.freeze({ precision15: 0.6, recall10: 0.6 });
  const SONG_MEASURED = Object.freeze({ precision15: 0.12, recall10: 0.38 });
  const songsTrusted = (m = SONG_MEASURED) => m.precision15 >= SONG_GATE.precision15 && m.recall10 >= SONG_GATE.recall10;
  /** The words for a card's name: {key, vars} for the page's string table. */
  function title(c, { trusted = songsTrusted() } = {}) {
    const time = hms(c.at);
    return c.kind === "song" && trusted ? { key: "as-song-name", vars: { no: c.no, time } } : { key: "as-moment-name", vars: { time } };
  }
  /** The level of one end (v8, frozen and JJ-approved): adjusted (你调过) while the streamer has it somewhere else than
   *  where it was found (undone or moved back → its own level again); estimated (估的) where songs.js marked that end
   *  as guessed, or for the best part of a song (hook / short); likely (比较可能) otherwise — a highlight's ends follow
   *  its sentences or silences. */
  function edgeLevel(c, w) {
    const now = w === "s" ? c.s : c.e, was = w === "s" ? c.s0 : c.e0;
    if (Number.isFinite(was) && Math.abs(now - was) > 1e-6) return "adjusted";
    if (c.kind !== "song") return "likely";
    if (c.hook) return "estimated";
    const at = w === "s" ? "start" : "end";
    return (c.marks || []).some((m) => m.at === at) ? "estimated" : "likely";
  }
  const r1 = (x) => Math.round(x * 10) / 10, r3 = (x) => Math.round(x * 1000) / 1000;
  const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const valuesIn = (l, a, b) => (l && Array.isArray(l.values) ? l.values.slice(Math.max(0, Math.floor(a / l.step)), Math.max(0, Math.ceil(b / l.step))) : []);
  const mean = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);

  /** The loudest `len` seconds inside [a, b] (by mean level); the middle when there is no sound to go on. */
  function loudest(l, a, b, len) {
    if (b - a <= len) return [a, b];
    const step = l && l.step > 0 ? l.step : 0.5, xs = valuesIn(l, a, b), w = Math.round(len / step);
    if (xs.length < w) { const m = (a + b - len) / 2; return [r3(m), r3(m + len)]; }
    let sum = 0, best = -Infinity, at = 0;
    for (let i = 0; i < xs.length; i++) {
      sum += xs[i]; if (i >= w) sum -= xs[i - w];
      if (i >= w - 1 && sum > best + 1e-9) { best = sum; at = i - w + 1; }
    }
    const s = Math.min(b - len, a + at * step);
    return [r3(s), r3(s + len)];
  }
  function build({ recordings = [], kind = DEFAULTS.kind, count = DEFAULTS.count, len = DEFAULTS.len, checked = DEFAULTS.checked } = {}) {
    if (!KINDS.includes(kind)) kind = DEFAULTS.kind;
    if (!LENS.includes(len)) len = DEFAULTS.len;
    count = Math.max(1, Math.floor(Number(count) || DEFAULTS.count));
    const wantSongs = kind === "auto" || kind === "sing", wantMoments = kind !== "sing";
    const all = [];
    for (const rec of recordings) {
      const usual = median((rec.loudness && rec.loudness.values) || []);
      const songs = (wantSongs ? rec.songs || [] : []).slice().sort((x, y) => x.from - y.from);
      songs.forEach((s, i) => {
        const avg = mean(valuesIn(rec.loudness, s.from, s.to)), above = usual == null || avg == null ? 0 : r1(avg - usual);
        const reasons = [{ signal: "singing", window: [s.from, s.to] }];
        if (above >= LOUD_MIN) reasons.push({ signal: "loudness", value: above, peak: above, baseline: usual, window: [s.from, s.to] });
        let [a, b] = [s.from, s.to];
        if (len !== "song") [a, b] = loudest(rec.loudness, s.from, s.to, DEFAULTS.hookLen);
        all.push({ id: rec.mediaId + "_s" + (i + 1), mediaId: rec.mediaId, kind: "song", no: i + 1, s: a, e: b, at: s.from, song: [s.from, s.to],
          score: r3(Math.min(1, Math.max(0, above) / LOUD_FULL) * LOUD_WEIGHT), reasons, marks: s.marks || [], confidence: s.confidence === "likely" ? "likely" : "estimated", s0: a, e0: b, hook: len !== "song" });
      });
      if (wantMoments) for (const h of rec.highlights || []) {
        const inside = songs.some((s) => Math.min(h.to, s.to) - Math.max(h.from, s.from) > (h.to - h.from) / 2);
        if (inside) continue;
        all.push({ id: rec.mediaId + "_m" + Math.round(h.from * 10), mediaId: rec.mediaId, kind: "moment", no: null, s: h.from, e: h.to, at: h.from,
          score: h.score, reasons: h.reasons || [], marks: [], s0: h.from, e0: h.to });
      }
    }
    all.sort((x, y) => y.score - x.score || x.at - y.at);
    // picked: the search ticked it — the review's title tells "as the search ticked them" from the streamer's own ticks
    const clips = all.slice(0, count).map((c, i) => ({ ...c, on: i < checked, picked: i < checked }));
    return { clips, found: clips.length, few: clips.length < count ? { found: clips.length, count } : null };
  }
  /** 1:12:04 over an hour, 12:04 under. */
  function hms(t) {
    const x = Math.max(0, Math.round(t)), h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  /** Move one end by d seconds: inside the recording, at least minLen long (edgeLevel then says 你调过). */
  function nudge(c, which, d, duration) {
    const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
    if (which === "s") return { ...c, s: r3(Math.max(0, Math.min(c.e - DEFAULTS.minLen, c.s + d))) };
    return { ...c, e: r3(Math.min(max, Math.max(c.s + DEFAULTS.minLen, c.e + d))) };
  }
  /** The whole-stream overview in a 1000 × 100 box: the sound as an area (louder = higher), a box per card, ticks every
   *  half hour. */
  function overview(rec, clips, startNo = 1) {
    const L = rec.duration > 0 ? rec.duration : 1, area = [];
    const l = rec.loudness;
    if (l && Array.isArray(l.values) && l.values.length) {
      const N = Math.min(200, l.values.length), per = l.values.length / N;
      for (let i = 0; i < N; i++) {
        const xs = l.values.slice(Math.floor(i * per), Math.max(Math.floor(i * per) + 1, Math.floor((i + 1) * per)));
        const v = Math.max(...xs), y = 100 - Math.max(0, Math.min(1, (v + 60) / 60)) * 92;
        area.push([r1(((i + 0.5) * per * l.step) / L * 1000), r1(y)]);
      }
    }
    const boxes = clips.filter((c) => c.mediaId === rec.mediaId).map((c, k) => ({ id: c.id, no: startNo + k, on: !!c.on,
      x: r3(c.s / L * 1000), w: r3(Math.max(9, (c.e - c.s) / L * 1000)) }));
    const ticks = [];
    for (let t = 0; t < L; t += 1800) ticks.push(t);
    return { area, boxes, ticks };
  }
  function totals(clips) {
    const on = clips.filter((c) => c.on);
    return { n: on.length, seconds: r3(on.reduce((x, c) => x + (c.e - c.s), 0)) };
  }
  /** File names in review order, numbered 01, 02, …; a colon cannot be in a Windows file name. */
  const numbered = (names) => names.map((n, i) => String(i + 1).padStart(2, "0") + " " + String(n).replace(/:/g, "："));
  /** The review's title, from the cards and the ones taken out (VV / JJ / Deja, 2026-11-03): none (nothing found),
   *  all-out (every card taken out), none-ticked, all / head (ticked exactly as the search ticked them: all of them, or
   *  its best), ticked (the streamer's own ticks). "As the search ticked them" is the set of cards, not the count: a
   *  card is as the search had it when its tick is its picked, and one the search ticked that was taken out is not. */
  function reviewHead(clips, dropped = []) {
    const list = Array.isArray(clips) ? clips : [], gone = Array.isArray(dropped) ? dropped : [];
    // found: every card this search found, the ones taken out included (VV on #96 e31d808), so taking one out or putting
    // one back never changes it; a part added by hand (补一段) was not found, and is not counted, ticked or not
    const searched = (c) => !c.added;
    const found = list.filter(searched).length + gone.filter(searched).length, on = list.filter((c) => c.on && searched(c)).length;
    if (!list.length) return gone.length ? { key: "all-out", found, on: 0 } : { key: "none", found: 0, on: 0 };
    if (!on) return { key: "none-ticked", found, on };
    const same = list.every((c) => !!c.on === !!c.picked) && !gone.some((c) => c.picked);
    return same ? { key: on === found ? "all" : "head", found, on } : { key: "ticked", found, on };
  }
  /** The reasons a card shows: a reason that only holds for singing (signal singing) only on a song card — one made
   *  another kind keeps its sound and danmaku reasons (VV on #90 b76bbe3). The card keeps them all, so made a song again
   *  (or the change undone) it shows it again. */
  const cardReasons = (c) => ((c && c.reasons) || []).filter((r) => c.kind === "song" || r.signal !== "singing");
  /* The card's 〔按歌词校准字幕〕 (docs/decisions/2026-11-03-card-lyrics.md): a card has no captions until it is placed, so
     it is calibrated on the card — one part, the card itself, and the transcript's words whose middle is inside it
     (recording seconds; lyrics-align.js aligns them). words: the transcript's [text, start, end] or {w, s, e}. */
  const wmid = (w) => ((w.s != null ? +w.s : +w[1]) + (w.e != null ? +w.e : +w[2])) / 2;
  function lyricScope(words, card) {
    return { caps: [{ id: card.id, start: card.s, end: card.e }],
      words: (Array.isArray(words) ? words : []).filter((w) => { const m = wmid(w); return m >= card.s && m < card.e; }) };
  }
  /** The card's lines (recording seconds) on the timeline, with the clip it was placed as ({start, in, duration}; speed 1):
   *  moved by start − in, cut to the clip's part; a line wholly outside it goes, and so do its words. */
  function lyricCuesOn(cues, clip) {
    const off = clip.start - (clip.in || 0), lo = clip.start, hi = clip.start + clip.duration, r3 = (x) => Math.round(x * 1000) / 1000;
    const move = (x) => r3(Math.min(hi, Math.max(lo, x + off)));
    return (Array.isArray(cues) ? cues : []).filter((q) => q.end + off > lo + 1e-6 && q.start + off < hi - 1e-6).map((q) => ({
      ...q, start: move(q.start), end: move(q.end),
      words: (q.words || []).filter((w) => w.s != null && w.e + off > lo + 1e-6 && w.s + off < hi - 1e-6).map((w) => ({ ...w, s: move(w.s), e: move(w.e) })),
    }));
  }
  return { KINDS, LENS, COUNTS, DEFAULTS, SONG_GATE, SONG_MEASURED, songsTrusted, title, edgeLevel, build, hms, nudge, overview, totals, numbered, reviewHead, cardReasons, lyricScope, lyricCuesOn };
});
