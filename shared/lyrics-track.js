/* Lyrics onto a new caption track, for the agent (JJ, 2026-11-05; docs/decisions/2026-11-05-lyrics-align-agent-tool.md).
   The streamer pastes the lyrics; the transcript's words in the part of the recording are aligned to them with the same
   aligner the lyrics dialog uses (lyrics-align.js, character edit distance, on this computer, nothing sent). This module
   only turns that alignment into a proposal and the proposal into clips; it never changes a project itself:
     propose(words, lyrics) → each line {text, start, end, matched, confidence}, n lines, k matched, m = n − k not matched,
                              and a code: OK, TOO_FEW (fewer than THRESHOLD of the lines matched: nothing is placed),
                              NO_LYRICS, NO_VOCALS, TOO_LONG
     place(proposal)        → where each line goes on the new track: matched lines at their own times; the lines that did
                              not match are not guessed into the song — they go grey (disabled, not in preview or export)
                              into a gap beside their neighbours, or after the song when there is no room, for the
                              streamer to drag into place
     clips(proposal, opts)  → the caption clips for one new track
   It does not recognise songs: the lyrics are the streamer's own paste, and nothing here names a song. Pure. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./lyrics-align"), require("./captions"));
  else root.MontClipLyricsTrack = factory(root.MontClipLyrics, root.MontClipCaptions);
})(typeof globalThis !== "undefined" ? globalThis : this, function (L, C) {
  "use strict";
  /* At least this share of the lines must match (and at least two, or the one line there is), or nothing is placed
     (「只对上了 k/n 行」). Measured on synthetic transcripts of four songs (scripts/lyrics-threshold.cjs, 20 seeds each):
     the right lyrics with up to 40 % of the characters misheard matched ≥ 0.30 of their lines, and with 3 made-up lines
     mixed into 13 ≥ 0.23; another song's lyrics matched 0.00 every time (lines are only matched at ≥ MIN_SCORE 0.5 of
     their characters, so chance overlaps never count). 0.2 places every right case and keeps a clear gap to the wrong ones;
     the lines that did not match go grey for the streamer. */
  const THRESHOLD = 0.2;
  const GAP = 0.5, MIN_LINE = 0.6, MAX_GREY = 4, GREY = 2;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const lettersIn = (t) => /[\p{L}\p{N}]/u.test(String(t == null ? "" : t));

  /** words: [{w, s, e}] (timeline seconds, in time order); lyrics: the pasted text. */
  function propose(words, lyrics, { threshold = THRESHOLD } = {}) {
    const lines = L.lines(lyrics);
    if (!lines.length) return { ok: false, code: "NO_LYRICS" };
    const heard = (Array.isArray(words) ? words : []).filter((w) => lettersIn(w && (w.w != null ? w.w : w[0])));
    if (!heard.length) return { ok: false, code: "NO_VOCALS" };
    const r = L.align(heard, lyrics);
    if (!r.ok) return { ok: false, code: r.code === "NO_WORDS" ? "NO_VOCALS" : r.code };
    const out = r.lines.map((l) => ({
      text: l.text, start: l.sure ? r3(l.start) : null, end: l.sure ? r3(l.end) : null, matched: !!l.sure, confidence: l.score,
      words: l.sure ? l.words.map((w) => ({ w: w.w, s: w.s, e: w.e })) : null,
    }));
    const n = out.length, k = out.filter((l) => l.matched).length;
    const from = Math.min(...heard.map((w) => +(w.s != null ? w.s : w[1]))), to = Math.max(...heard.map((w) => +(w.e != null ? w.e : w[2])));
    return { ok: true, code: k >= Math.min(2, n) && k / n >= threshold ? "OK" : "TOO_FEW", n, k, m: n - k, from: r3(from), to: r3(to), lines: out };
  }

  /** Where each line goes: [{line, start, end, text, words, matched}] in time order, never overlapping. A matched line
   *  shorter than MIN_LINE is held a little longer (never into the next line). */
  function place(p) {
    if (!p || !p.ok || p.code !== "OK") return [];
    const lines = p.lines, out = [], late = [];
    const nextStart = (i) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].matched) return lines[j].start; return null; };
    let edge = p.from, i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.matched) {
        const after = nextStart(i), start = Math.max(l.start, edge);
        let end = Math.max(l.end, start + MIN_LINE);
        if (after != null) end = Math.min(end, after);
        if (end - start < 0.05) end = start + 0.05;
        out.push({ line: i, start: r3(start), end: r3(end), text: l.text, words: l.words, matched: true });
        edge = end; i++;
        continue;
      }
      // a run of lines that did not match, between the line before and the next one that did
      let j = i;
      while (j < lines.length && !lines[j].matched) j++;
      const run = j - i, after = nextStart(i - 1);
      const b = after != null ? after : Math.max(p.to, edge), room = b - edge;
      if (room >= run * GAP) {
        const each = Math.min(room / run, MAX_GREY);
        for (let x = 0; x < run; x++)
          out.push({ line: i + x, start: r3(edge + x * each), end: r3(edge + (x + 1) * each), text: lines[i + x].text, words: null, matched: false });
        edge = edge + run * each;
      } else for (let x = i; x < j; x++) late.push(x);
      i = j;
    }
    // no room beside their neighbours: after the song, one after another, for the streamer to drag
    let t = Math.max(p.to, ...out.map((q) => q.end)) + GAP;
    for (const x of late) { out.push({ line: x, start: r3(t), end: r3(t + GREY), text: lines[x].text, words: null, matched: false }); t += GREY; }
    return out.sort((a, b) => a.start - b.start);
  }

  /** The id of the video track to add on top of `tracks` (V1…V16), or null when there are 16 already. */
  function newTrack(doc) {
    const ids = (Array.isArray(doc.tracks) && doc.tracks.length ? doc.tracks : C.DEFAULT_TRACKS).filter((t) => t && t.kind === "video").map((t) => t.id);
    for (const c of doc.clips || []) if (/^V\d+$/.test(c.track) && !ids.includes(c.track)) ids.push(c.track);
    const n = Math.max(0, ...ids.map((id) => +String(id).slice(1)).filter(Number.isFinite)) + 1;
    return n > 16 ? null : "V" + n;
  }

  /** The caption clips for the lines on `track`: matched lines as captions timed word by word where the words have
   *  times, the others grey (disabled) with lyricsUnmatched. id(i) names each clip. */
  function clips(p, { track, width, height, style, id = (i) => "c_ly" + i } = {}) {
    return place(p).map((q, i) => {
      const cue = { start: q.start, end: q.end, text: q.text,
        words: q.words && q.words.every((w) => w.s != null && w.e != null) ? q.words : [] };
      const c = { ...C.clip(cue, { style: style || C.DEFAULT_STYLE, width, height, track }), id: id(i), name: "Lyrics" };
      c.props.lyricsLine = q.line;
      if (!q.matched) { c.disabled = true; c.props.lyricsUnmatched = true; }
      return c;
    });
  }

  /** What the alignment depends on, to check that nothing moved between the proposal and its use: each speech clip's
   *  place, source window and speed, and the frame rate. */
  function scopeSig(doc, clipIds) {
    const ids = new Set(clipIds || []);
    return JSON.stringify([doc.fps || 30, (doc.clips || []).filter((c) => ids.has(c.id))
      .map((c) => [c.id, c.track, c.start, c.in || 0, c.duration, c.mediaId, (c.props && c.props.speed) ?? 1, !!c.disabled])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))]);
  }

  /** The proposal as the agent reads it: each line {text, start, end, matched, confidence}, with n and k. */
  function forAgent(p) {
    if (!p || !p.ok) return { ok: false, code: p ? p.code : "NO_LYRICS" };
    return { ok: true, code: p.code, n: p.n, k: p.k, m: p.m,
      lines: p.lines.map((l) => ({ text: l.text, start: l.start, end: l.end, matched: l.matched, confidence: l.confidence })) };
  }

  /** The copy key for a proposal (ui-preferences own.*): preview, too few, no singing, no lyrics. */
  function messageKey(p) {
    if (!p) return "lt-no-lyrics";
    if (p.code === "OK") return "lt-preview";
    return { TOO_FEW: "lt-too-few", NO_VOCALS: "lt-no-vocals", NO_LYRICS: "lt-no-lyrics", TOO_LONG: "ly-too-long", ASR_UNAVAILABLE: "lt-asr-unavailable" }[p.code] || "lt-no-vocals";
  }

  return Object.freeze({ THRESHOLD, propose, place, newTrack, clips, scopeSig, forAgent, messageKey });
});
