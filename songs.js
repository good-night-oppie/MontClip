/* Find each song in a recording (P2 「找出每首歌」, Deja 2026-11-03). From Deja's prototype songs.cjs (MIT), made product
   code: the sound's loudness every 0.5 s (ffmpeg astats; song-scan.js reads it), and in a window of W seconds around each
   moment, how often it drops PAUSE_DB below the window's median. Singing holds its level; talk pauses between words.
   So a moment is singing when at most PAUSE of its window pauses and the window is not a quiet room (median above
   MUSIC_DB). Spectral entropy is not used. Runs of singing are joined across breaks of at most MERGE seconds, a run long
   enough to be two songs is split at a quiet gap, and runs shorter than MIN_SONG are dropped. Parameters: the
   prototype's grid2 result over the local golden set.
   Each song's start backs up to where the sound begins (the prelude), its end runs on to where the sound stops; both
   at most EDGE seconds. A song is 「估的」 (estimated) where something was guessed, and says where:
     split  — two songs with no clear gap between them were split at the quietest gap
     merged — a break inside was bridged (it may be two songs)
     edge   — it starts or ends with the recording
     unread — it runs into the part of the file not read yet
     limit  — its start or end ran out of room before the sound began or stopped
   find(rms, {complete}) → [{from, to, confidence: "likely"|"estimated", marks: [{at: "start"|"end"|"inside", t, why}]}],
   times in seconds of the file. entry()/clean() check what is kept in the project (project.songs). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipSongs = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DEFAULTS = Object.freeze({ step: 0.5, W: 30, PAUSE: 0.12, PAUSE_DB: 14, MUSIC_DB: -45, MERGE: 8, SPLIT_MIN: 150, MIN_SONG: 90,
    GAP_DB: 14, GAP_MIN: 1, EDGE: 12, EDGE_DB: 10 });
  const FLOOR = -90, WHY = ["split", "merged", "edge", "unread", "limit"], AT = ["start", "end", "inside"];
  const MAX_SONGS = 400, MAX_MARKS = 16;
  const r1 = (x) => Math.round(x * 1000) / 1000;

  function find(input, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, st = o.step, complete = opts.complete === true;
    const rms = (Array.isArray(input) ? input : []).map((v) => (typeof v === "number" && v > FLOOR ? v : FLOOR));
    const n = rms.length;
    if (!n) return [];
    // 1. singing or not, moment by moment
    const h = Math.round(o.W / 2 / st), music = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - h), b = Math.min(n, i + h + 1), w = rms.slice(a, b).sort((x, y) => x - y), med = w[w.length >> 1];
      let pz = 0;
      for (let j = a; j < b; j++) if (rms[j] < med - o.PAUSE_DB) pz++;
      music[i] = pz / (b - a) <= o.PAUSE && med > o.MUSIC_DB;
    }
    // 2. runs, joined across short breaks
    const runs = [];
    for (let i = 0; i < n;) {
      if (!music[i]) { i++; continue; }
      let j = i; while (j < n && music[j]) j++;
      const last = runs[runs.length - 1];
      if (last && (i - last.b) * st <= o.MERGE) { last.gaps.push((last.b + i) / 2 * st); last.b = j; }
      else runs.push({ a: i, b: j, gaps: [] });
      i = j;
    }
    // 3. a run long enough to be two songs is split at a quiet gap
    const parts = [];
    for (const r of runs) {
      const cuts = [];   // [gap start, gap end] index pairs
      if ((r.b - r.a) * st >= o.SPLIT_MIN * 1.6) {
        const w = rms.slice(r.a, r.b).sort((x, y) => x - y), med = w[w.length >> 1];
        let from = r.a;
        for (let i = r.a; i < r.b;) {
          if (rms[i] < med - o.GAP_DB) {
            let j = i; while (j < r.b && rms[j] < med - o.GAP_DB) j++;
            if ((j - i) * st >= o.GAP_MIN && (j - from) * st >= o.SPLIT_MIN && (r.b - j) * st >= o.MIN_SONG) { cuts.push([i, j]); from = j; }
            i = j;
          } else i++;
        }
      }
      let a = r.a, splitStart = false;
      // a split song ends where the gap begins; it is long enough when it is up to where the gap ends (the prototype)
      for (const [g0, g1] of cuts) { parts.push({ a, b: g0, len: g1, splitStart, splitEnd: true, gaps: r.gaps }); a = g1; splitStart = true; }
      parts.push({ a, b: r.b, len: r.b, splitStart, splitEnd: false, gaps: r.gaps });
    }
    const songs = parts.filter((p) => (p.len - p.a) * st >= o.MIN_SONG);
    // 4. the start backs up to where the sound begins, as the prototype; then the end runs on to where it stops
    const edge = Math.round(o.EDGE / st);
    for (const s of songs) {
      let i = s.a; const lim = Math.max(0, i - edge), base = rms[i];
      while (i > lim && rms[i - 1] > base - o.EDGE_DB) i--;
      s.from = i; s.startLimit = i === lim && lim > 0 && rms[i - 1] > base - o.EDGE_DB;
    }
    songs.forEach((s, k) => {
      const next = songs[k + 1] ? songs[k + 1].from : n;
      let j = s.b;
      if (!s.splitEnd) {
        const lim = Math.min(next, j + edge), base = rms[j - 1];
        while (j < lim && rms[j] > base - o.EDGE_DB) j++;
        s.endLimit = j === s.b + edge && j < n && rms[j] > base - o.EDGE_DB;
      }
      s.to = Math.min(j, next);
    });
    return songs.map((s) => {
      const from = s.from * st, to = s.to * st, marks = [];
      if (s.splitStart) marks.push({ at: "start", t: from, why: "split" });
      else if (s.from === 0) marks.push({ at: "start", t: from, why: "edge" });
      else if (s.startLimit) marks.push({ at: "start", t: from, why: "limit" });
      for (const g of s.gaps) if (g > from && g < to) marks.push({ at: "inside", t: r1(g), why: "merged" });
      if (s.splitEnd) marks.push({ at: "end", t: to, why: "split" });
      else if (s.to >= n) marks.push({ at: "end", t: to, why: complete ? "edge" : "unread" });
      else if (s.endLimit) marks.push({ at: "end", t: to, why: "limit" });
      return { from: r1(from), to: r1(to), confidence: marks.length ? "estimated" : "likely", marks };
    });
  }

  /* What the project keeps for one file: {v:1, key, complete, scanned, songs}. key = the file version it was read from. */
  const fail = (why) => { throw new Error("SONGS_INVALID: " + why); };
  const plain = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const num = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  function song(s) {
    if (!plain(s) || Object.keys(s).sort().join() !== "confidence,from,marks,to") fail("a song is {from, to, confidence, marks}");
    if (!num(s.from) || !num(s.to) || s.to <= s.from) fail("from < to, seconds");
    if (s.confidence !== "likely" && s.confidence !== "estimated") fail("confidence is likely or estimated");
    if (!Array.isArray(s.marks) || s.marks.length > MAX_MARKS) fail("marks");
    const marks = s.marks.map((m) => {
      if (!plain(m) || Object.keys(m).sort().join() !== "at,t,why" || !AT.includes(m.at) || !WHY.includes(m.why) || !num(m.t)) fail("a mark is {at, t, why}");
      return { at: m.at, t: r1(m.t), why: m.why };
    });
    return { from: r1(s.from), to: r1(s.to), confidence: s.confidence, marks };
  }
  function entry(e) {
    if (!plain(e)) fail("an entry is {key, complete, scanned, songs}");
    if (typeof e.key !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(e.key)) fail("key");
    if (typeof e.complete !== "boolean" || !num(e.scanned)) fail("complete, scanned");
    if (!Array.isArray(e.songs) || e.songs.length > MAX_SONGS) fail("songs is a list of at most " + MAX_SONGS);
    for (const k of Object.keys(e)) if (!["v", "key", "complete", "scanned", "songs"].includes(k)) fail("unknown key " + k);
    return { v: 1, key: e.key, complete: e.complete, scanned: r1(e.scanned), songs: e.songs.map(song) };
  }
  /** project.songs as saved: entries of files still in the project, checked; damaged ones dropped. null when none. */
  function clean(all, media) {
    if (!plain(all)) return null;
    const ids = new Set((media || []).map((m) => m && m.id));
    const out = {};
    for (const [id, e] of Object.entries(all)) {
      if (!ids.has(id)) continue;
      try { out[id] = entry(e); } catch { /* dropped */ }
    }
    return Object.keys(out).length ? out : null;
  }
  return { DEFAULTS, MAX_SONGS, find, entry, clean };
});
