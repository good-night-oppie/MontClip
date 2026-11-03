/* Correct the transcript's captions from the lyrics (P6a; the owner and Deja, 2026-11-03, ADR 本机能力边界 补记「用歌词校准听写
   字幕」). On this computer only; nothing is sent. The transcript's words (timeline seconds) and the lyrics the streamer pasted
   are aligned character by character — letters and digits only, case and width folded — by edit distance. The times stay
   the transcript's: each lyric character takes the time of the transcript character it is aligned with (a word's time is
   shared evenly among its characters), and only the wrong characters become the lyrics' ones. One lyric line is one caption.
   Transcript characters with no lyric counterpart (talking between lines) go with the line before. A line whose score —
   characters that match, over the longer of the line and what was heard for it — is under MIN_SCORE, or that has nothing
   heard under it, is not sure (「可能不对」): the page does not change it unless the streamer picks it. Pure. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipLyrics = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MIN_SCORE = 0.5, MAX_CHARS = 3000, MAX_LINES = 300;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const units = (t) => [...String(t).normalize("NFKC").toLowerCase()].filter((c) => /[\p{L}\p{N}]/u.test(c));
  // CJK, kana and Hangul are written without spaces; other words get one between them
  const TIGHT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const join = (ws) => ws.reduce((out, w) => (out && !TIGHT.test(out.at(-1)) && !TIGHT.test(w[0]) ? out + " " + w : out + w), "");

  /** The pasted lyrics as lines to sing: trimmed, LRC time tags removed, lines with no letter or digit dropped. */
  function lines(text) {
    return String(text == null ? "" : text).split(/\r?\n/).map((l) => l.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, "").trim())
      .filter((l) => units(l).length).slice(0, MAX_LINES);
  }

  /** words: [{w, s, e}] in time order (FableCutTranscribe.layout); lyrics: the pasted text.
   *  → {ok, lines:[{text, original, start, end, score, sure, words:[{w, s, e}|{w, s:null, e:null}]}]} or {ok:false, code}. */
  function align(words, lyrics) {
    const ls = lines(lyrics);
    if (!Array.isArray(words) || !words.length) return { ok: false, code: "NO_WORDS" };
    if (!ls.length) return { ok: false, code: "NO_LYRICS" };
    // the transcript's characters, each with its time and its word
    const heard = [];
    words.forEach((w, wi) => {
      const u = units(w.w != null ? w.w : w[0]), s = +(w.s != null ? w.s : w[1]), e = +(w.e != null ? w.e : w[2]);
      u.forEach((c, k) => heard.push({ c, wi, s: r4(s + (e - s) * k / u.length), e: k === u.length - 1 ? r4(e) : r4(s + (e - s) * (k + 1) / u.length) }));
    });
    // the lyrics' characters, each with its line and its place in the line's words
    const sung = [];
    ls.forEach((text, li) => text.split(/\s+/).filter(Boolean).forEach((word, wi) => units(word).forEach((c) => sung.push({ c, li, wi }))));
    if (!heard.length) return { ok: false, code: "NO_WORDS" };
    if (heard.length > MAX_CHARS || sung.length > MAX_CHARS) return { ok: false, code: "TOO_LONG" };
    // edit distance, with the path kept: 0 = diagonal (match / substitution), 1 = a heard character left out, 2 = a sung one
    const n = heard.length, m = sung.length, W = m + 1, step = new Uint8Array((n + 1) * W);
    let prev = new Uint32Array(W), cur = new Uint32Array(W);
    for (let j = 0; j <= m; j++) { prev[j] = j; step[j] = 2; }
    for (let i = 1; i <= n; i++) {
      cur[0] = i; step[i * W] = 1;
      for (let j = 1; j <= m; j++) {
        const same = heard[i - 1].c === sung[j - 1].c, diag = prev[j - 1] + (same ? 0 : 1), del = prev[j] + 1, ins = cur[j - 1] + 1;
        // on a tie, a match first, then a sung character left unheard, then a substitution: walking back from the end,
        // lyric lines nobody sang stay unheard instead of taking the last heard characters as wrong ones
        if (same && diag <= del && diag <= ins) { cur[j] = diag; step[i * W + j] = 0; }
        else if (ins <= diag && ins <= del) { cur[j] = ins; step[i * W + j] = 2; }
        else if (diag <= del) { cur[j] = diag; step[i * W + j] = 0; }
        else { cur[j] = del; step[i * W + j] = 1; }
      }
      [prev, cur] = [cur, prev];
    }
    const pair = new Array(m).fill(-1), extra = [];   // sung j ← heard i; heard characters with no counterpart
    for (let i = n, j = m; i > 0 || j > 0;) {
      const d = step[i * W + j];
      if (i > 0 && j > 0 && d === 0) { pair[j - 1] = i - 1; i--; j--; }
      else if (i > 0 && (j === 0 || d === 1)) { extra.push({ i: i - 1, after: j - 1 }); i--; }
      else j--;
    }
    // which line each heard character goes with: its sung partner's, else the line before it (the first line at the start)
    const lineOf = new Array(n).fill(0);
    sung.forEach((x, j) => { if (pair[j] >= 0) lineOf[pair[j]] = x.li; });
    for (const { i, after } of extra) lineOf[i] = after >= 0 ? sung[after].li : 0;
    const out = ls.map((text) => ({ text, heard: [], matches: 0, sungCount: 0, times: [] }));
    sung.forEach((x, j) => {
      const L = out[x.li]; L.sungCount++;
      if (pair[j] >= 0) { const h = heard[pair[j]]; L.times.push(h); if (h.c === x.c) L.matches++; }
    });
    heard.forEach((h, i) => out[lineOf[i]].heard.push(h));
    return {
      ok: true,
      lines: out.map((L, li) => {
        const wordIds = [...new Set(L.heard.map((h) => h.wi))].filter((wi) => lineOf[heard.findIndex((h) => h.wi === wi)] === li);
        const score = L.matches / Math.max(L.sungCount, L.heard.length, 1);
        const start = L.times.length ? Math.min(...L.times.map((h) => h.s)) : null, end = L.times.length ? Math.max(...L.times.map((h) => h.e)) : null;
        // each lyric word's time, from its own characters' partners
        const lw = L.text.split(/\s+/).filter(Boolean).map((w) => ({ w, s: null, e: null }));
        sung.forEach((x, j) => { if (x.li !== li || pair[j] < 0) return; const h = heard[pair[j]], t = lw[x.wi];
          t.s = t.s == null ? h.s : Math.min(t.s, h.s); t.e = t.e == null ? h.e : Math.max(t.e, h.e); });
        const heardWords = wordIds.map((wi) => { const w = words[wi]; return { w: String(w.w != null ? w.w : w[0]), s: r4(+(w.s != null ? w.s : w[1])), e: r4(+(w.e != null ? w.e : w[2])) }; });
        return { text: L.text, original: join(heardWords.map((w) => w.w)), heard: heardWords, start, end,
          score: r4(score), sure: start != null && score >= MIN_SCORE, words: lw };
      }),
    };
  }
  /** The captions to put in place of the old ones, one per line in order: a picked line (with a time) as the lyrics, any
   *  other as it was heard (its own words and times). A line with nothing heard under it has no caption. */
  function cues(result, picked) {
    const take = new Set(Array.isArray(picked) ? picked : []);
    return (result && result.ok ? result.lines : []).map((l, i) => cueOf(l, take.has(i))).filter(Boolean);
  }
  function cueOf(l, picked) {
    if (picked && l.start != null) return { start: l.start, end: l.end, text: l.text, words: l.words.map((w) => ({ ...w })) };
    if (l.heard.length) return { start: Math.min(...l.heard.map((w) => w.s)), end: Math.max(...l.heard.map((w) => w.e)), text: l.original, words: l.heard.map((w) => ({ ...w })) };
    return null;
  }

  /* What is changed (QQ on #85; Deja, 2026-11-03): the captions picked are the ones changed; the ones not picked do not
     change by a single character. */
  const EPS = 1e-3;
  const mid = (w) => ((w.s != null ? +w.s : +w[1]) + (w.e != null ? +w.e : +w[2])) / 2;
  /** The captions to work on and the transcript's words to align: the picked captions (selected ids), else every unlocked
   *  caption whose middle is in IN–OUT; the words whose middle is inside one of them — never the words between them.
   *  captions: [{id, start, end, locked}] (timeline seconds). → {caps:[{id, start, end}] in time order, words} or null. */
  function scope({ captions, selected, inPoint, outPoint, words } = {}) {
    const all = (captions || []).map((c) => ({ id: c.id, start: +c.start, end: +c.end, locked: !!c.locked }));
    const sel = new Set(Array.isArray(selected) ? selected : []);
    let take;
    if (sel.size) take = all.filter((c) => sel.has(c.id));
    else if (Number.isFinite(inPoint) && Number.isFinite(outPoint) && outPoint > inPoint)
      take = all.filter((c) => !c.locked && (c.start + c.end) / 2 >= inPoint && (c.start + c.end) / 2 < outPoint);
    else return null;
    take.sort((x, y) => x.start - y.start);
    const caps = take.map(({ id, start, end }) => ({ id, start, end }));
    return { caps, words: (words || []).filter((w) => caps.some((c) => mid(w) >= c.start && mid(w) < c.end)).map((w) => ({ ...w })) };
  }
  /** The new captions for the picked lines (the others as heard), each inside one of caps, with the caption it replaces:
   *  → {cues:[{start, end, text, words, capId, line, lyrics}], replace:[ids], outside:[line indexes], held:[ids]}; lyrics: the
   *  caption is the lyric line (else the line as heard).
   *  outside: lines that answer to time no picked caption covers — placed across or outside the picked captions, or with
   *  nothing heard between lines placed in two different ones; they are not made. held: picked captions such a line
   *  reaches into; they are left as they were (with the lines inside them), so no heard word is lost. replace: the picked
   *  captions that get new ones; only those are removed. */
  function plan(result, picked, caps) {
    const take = new Set(Array.isArray(picked) ? picked : []), list = (caps || []).slice().sort((x, y) => x.start - y.start);
    const lines = result && result.ok ? result.lines : [];
    const within = (q) => list.find((c) => q.start >= c.start - EPS && q.end <= c.end + EPS) || null;
    const per = lines.map((l, i) => { const q = cueOf(l, take.has(i)); return q ? { q, cap: within(q) } : null; });
    const outside = [];
    per.forEach((x, i) => {
      if (x) { if (!x.cap) outside.push(i); return; }
      let b = i - 1, f = i + 1;
      while (b >= 0 && !per[b]) b--;
      while (f < per.length && !per[f]) f++;
      if (b >= 0 && f < per.length && (per[b].cap && per[b].cap.id) !== (per[f].cap && per[f].cap.id)) outside.push(i);
    });
    const spans = outside.map((i) => per[i] && per[i].q).filter(Boolean);
    const held = list.filter((c) => spans.some((q) => q.start < c.end - EPS && q.end > c.start + EPS)).map((c) => c.id);
    const cuesOut = [];
    per.forEach((x, i) => { if (x && x.cap && !held.includes(x.cap.id) && !outside.includes(i)) cuesOut.push({ ...x.q, capId: x.cap.id, line: i, lyrics: take.has(i) && lines[i].start != null }); });
    const replace = list.filter((c) => cuesOut.some((q) => q.capId === c.id)).map((c) => c.id);
    return { cues: cuesOut, replace, outside, held };
  }
  return Object.freeze({ MIN_SCORE, MAX_CHARS, MAX_LINES, lines, align, cues, scope, plan });
});
