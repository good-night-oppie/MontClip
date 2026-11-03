/* Steps a plan can really do (Deja, 2026-11-03): 「找出每首歌」 (find_songs), 「找高光」 (find_highlights), the two
   range edits, and 「导出」 (export_files, through the system's Save window only), so 「把我唱歌的部分一首一个切片剪出来」
   runs from start to end: find the songs → keep them, one clip each → export. A step can use what an earlier step found:
   {"$step": n} in its args stands for step n's ranges (the plan's own data, checked here; never anything the model
   wrote as text). Pure: the page runs the steps (app.js) and the main process decides each one (agent-policy.js). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipPlanSteps = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DOABLE = Object.freeze(["keep_sentences", "keep_ranges", "find_songs", "find_highlights", "export_files"]);
  // steps that only find things: their result is ranges for a later step; the project does not change
  const FINDS = Object.freeze(["find_songs", "find_highlights"]);
  const MIN_RANGE = 0.5;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const fail = (code) => { throw new Error(code); };

  const ramped = (c) => !!(c.keyframes && Array.isArray(c.keyframes.speed) && c.keyframes.speed.length);
  /** The timeline clip showing a recording (a video first, else its sound) and the part of the file it shows. A clip
   *  with a speed ramp doesn't show the file at one speed, so it is left out. */
  function windowOf(mediaId, clips) {
    const list = (clips || []).filter((c) => c.mediaId === mediaId && (c.kind === "video" || c.kind === "audio") && !c.disabled && !ramped(c));
    const c = list.find((x) => x.kind === "video") || list[0];
    if (!c) return null;
    const speed = Number.isFinite(c.props && c.props.speed) && c.props.speed > 0 ? c.props.speed : 1, from = c.in || 0;
    return { clipId: c.id, from, to: from + c.duration * speed };
  }
  /** File-second parts of recordings → keep_ranges ranges of their clips, cut to what the timeline shows. The names come
   *  from the page: name(n, {from, to}) — a song is 「第 n 首歌」 only once songs.js passes Deja's gate (auto-slices.js). */
  function toRanges(parts, clips, name) {
    if (typeof name !== "function") fail("NAME");
    const out = [];
    for (const { mediaId, list } of parts) {
      const w = windowOf(mediaId, clips);
      if (!w) continue;
      for (const p of list) {
        const from = Math.max(p.from, w.from), to = Math.min(p.to, w.to);
        if (to - from >= MIN_RANGE) out.push({ clipId: w.clipId, from: r3(from), to: r3(to) });
      }
    }
    return out.map((r, i) => ({ ...r, label: name(i + 1, r) }));
  }
  /** found: [{mediaId, songs:[{from, to}]}] in file seconds (song-scan.js / songs.js). */
  function rangesFromSongs(found, clips, { name } = {}) {
    return toRanges((found || []).map((f) => ({ mediaId: f.mediaId, list: (f.songs || []).slice().sort((x, y) => x.from - y.from) })), clips, name);
  }
  /** found: [{mediaId, cards:[{from, to, score}]}] (highlight-candidates.js); the best `count` by score, in time order. */
  function rangesFromHighlights(found, clips, { count, name } = {}) {
    const all = [];
    for (const f of found || []) for (const c of f.cards || []) all.push({ mediaId: f.mediaId, ...c });
    const best = all.sort((x, y) => y.score - x.score).slice(0, Number.isInteger(count) && count >= 0 ? count : all.length)
      .sort((x, y) => x.from - y.from);
    const parts = [];
    for (const c of best) { let p = parts.find((x) => x.mediaId === c.mediaId); if (!p) parts.push(p = { mediaId: c.mediaId, list: [] }); p.list.push(c); }
    return toRanges(parts, clips, name);
  }
  const plain = (o) => !!o && typeof o === "object" && !Array.isArray(o);
  /** A step's args with every {"$step": n} replaced by step n's ranges; step is this step's number (1-based). */
  function resolve(args, outputs, step) {
    const walk = (v) => {
      if (Array.isArray(v)) return v.map(walk);
      if (!plain(v)) return v;
      if ("$step" in v) {
        const n = v.$step;
        if (Object.keys(v).length !== 1 || !Number.isInteger(n) || n < 1 || n >= step) fail("STEP_REF");
        const o = outputs[n - 1];
        if (!o || !Array.isArray(o.ranges)) fail("STEP_REF");
        if (!o.ranges.length) fail("STEP_EMPTY");
        return JSON.parse(JSON.stringify(o.ranges));
      }
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    };
    return walk(JSON.parse(JSON.stringify(args)));
  }
  return Object.freeze({ DOABLE, FINDS, MIN_RANGE, windowOf, rangesFromSongs, rangesFromHighlights, resolve });
});
