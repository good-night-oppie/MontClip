/* Pure planning for an explicitly requested gap repair. Source offsets and timeline
 * offsets are different clocks: timeline annotations use their unique footage clip. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipGapRemap = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const conflict = message => Object.assign(new Error(message), { code: "GAP_EDIT_CONFLICT" });
  function retained(from, to) {
    if (!(to > from)) throw conflict("annotation or cut lies entirely inside a gap");
  }
  function mapper(map) {
    if (!Number.isFinite(map.duration) || map.duration <= 0) throw new Error("invalid gap map duration");
    let end = 0, removedTotal = 0;
    for (const g of map.gaps || []) {
      if (!Number.isFinite(g.from) || !Number.isFinite(g.to) || g.from < end || g.to <= g.from)
        throw new Error("invalid gap map");
      end = g.to;
      removedTotal += g.to - g.from;
    }
    const sourceDuration = map.duration + removedTotal;
    if (end > sourceDuration || (map.sourceDuration != null && Math.abs(map.sourceDuration - sourceDuration) > 1e-6))
      throw new Error("invalid gap map duration");
    return t => {
      if (!Number.isFinite(t) || t < 0 || t > sourceDuration + 1e-6) throw new Error("invalid source time");
      let removed = 0;
      for (const g of map.gaps || []) removed += Math.max(0, Math.min(t, g.to) - g.from);
      return t - removed;
    };
  }
  function transcript(doc, src, map) {
    const time = mapper(map), result = clone(doc);
    result.src = src; result.duration = map.duration;
    result.words = (result.words || []).map(w => {
      const start = time(w[1]), end = time(w[2]); retained(start, end);
      return [w[0], start, end, ...w.slice(3)];
    });
    if (result.gaps) result.gaps = result.gaps.map(g => {
      const start = time(g[0]), end = time(g[1]); retained(start, end);
      return [start, end, ...g.slice(2)];
    });
    return result;
  }
  function plan(original, oldId, newId, map, highlights = []) {
    const project = clone(original), time = mapper(map);
    if (!original.media?.some(m => m.id === oldId) || oldId === newId || original.media.some(m => m.id === newId) || original.songs?.[newId])
      throw new Error("invalid replacement media identity");
    // User decision: preserve the project and ask for conflicting edits to be
    // resolved first. Never delete an annotation or snap it onto a gap boundary.
    const speed = c => c.props?.speed ?? 1;
    function source(c, t) { return (c.in || 0) + (t - c.start) * speed(c); }
    function timeline(c, t) { return c.start + (time(source(c, t)) - time(c.in || 0)) / speed(c); }
    function owner(clips, from, to) {
      const overlapping = clips.filter(c => c.kind === "video" && !c.disabled && c.start < to && c.start + c.duration > from);
      if (!overlapping.some(c => c.mediaId === oldId)) return null;
      if (overlapping.length !== 1 || overlapping[0].start > from || overlapping[0].start + overlapping[0].duration < to)
        throw conflict("ambiguous timeline annotation source");
      return overlapping[0];
    }
    function annotations(clips, records) {
      return records.map(r => {
        const c = owner(clips, r.from, r.to);
        const result = c ? { ...r, from: timeline(c, r.from), to: timeline(c, r.to) } : r;
        retained(result.from, result.to); return result;
      });
    }
    function remapClips(clips = []) {
      // Validate first; nonlinear ramps need their own inverse, never a constant-speed approximation.
      for (const c of clips) if (c.mediaId === oldId) {
        if (c.keyframes?.speed?.length) throw conflict("speed ramp gap mapping is not supported");
        if (!Number.isFinite(speed(c)) || speed(c) <= 0) throw new Error("invalid clip speed");
      }
      const before = clone(clips);
      for (const c of clips) {
        if (c.kind === "text" && c.props?.caption) {
          const footage = owner(before, c.start, c.start + c.duration);
          if (footage) {
            const start = c.start, mappedStart = timeline(footage, start);
            if (c.props.wordTimes) c.props.wordTimes = c.props.wordTimes.map(w => {
              const from = timeline(footage, start + w[0]) - mappedStart;
              const to = timeline(footage, start + w[1]) - mappedStart;
              retained(from, to); return [from, to];
            });
            c.duration = timeline(footage, start + c.duration) - mappedStart;
            retained(0, c.duration);
            c.start = mappedStart;
            if (c.props.captionSource?.output) c.props.captionSource.output = { start: c.start, end: c.start + c.duration };
          }
        }
        if (c.mediaId === oldId) {
          const start = c.in || 0, end = start + c.duration * speed(c);
          c.in = time(start); c.duration = (time(end) - c.in) / speed(c);
          retained(0, c.duration);
          // MediaLib.swapMedia repoints only after the entire plan has validated.
        }
      }
      return clips;
    }
    const mappedHighlights = annotations(project.clips || [], clone(highlights));
    project.clips = remapClips(project.clips);
    for (const comp of project.comps || []) comp.clips = remapClips(comp.clips);
    for (const seq of project.sequences || []) seq.clips = remapClips(seq.clips);
    for (const d of project.danmaku || []) if (d.mediaId === oldId) {
      d.mediaId = newId;
      d.items = (d.items || []).map(item => {
        const start = time(item[0]);
        const end = time(item[0] + item[1]); retained(start, end);
        return [start, end - start, ...item.slice(2)];
      });
      d.count = d.items.length;
    }
    if (project.songs?.[oldId]) {
      const songs = project.songs[oldId];
      if (Number.isFinite(songs.scanned)) songs.scanned = time(songs.scanned);
      songs.songs = (songs.songs || []).map(s => {
        const from = time(s.from), to = time(s.to); retained(from, to);
        return { ...s, from, to, marks: (s.marks || []).map(m => {
          if (map.gaps.some(g => m.t > g.from && m.t < g.to)) throw conflict("song mark lies entirely inside a gap");
          return { ...m, t: time(m.t) };
        }) };
      });
      project.songs[newId] = songs; delete project.songs[oldId];
    }
    return { project, highlights: mappedHighlights };
  }
  return { mapper, transcript, plan };
});
