/* Ordered cuts on the existing edit engine. Pure proposal; callers own the
 * single revision/save/undo transaction. No media files are modified. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./captions"), require("./edit-ops"));
  else root.FableCutRangePlan = factory(root.FableCutCaptions, root.FableCutEdit);
})(typeof self !== "undefined" ? self : this, function (C, Edit) {
  "use strict";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const ms = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
  function create(doc, ranges) {
    if (!Array.isArray(ranges) || !ranges.length || ranges.some(r => !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.from < 0 || r.to <= r.from))
      throw new Error("Select valid ordered ranges / 请选择有效的有序区间");
    const end = Math.max(0, ...doc.clips.map(c => c.start + c.duration));
    if (ranges.some(r => r.to > end)) throw new Error("Selection exceeds timeline / 选区超出时间线");
    if (doc.clips.some(c => c.locked || (doc.lockedTracks || []).includes(c.track)))
      throw new Error("Unlock clips and tracks first / 请先解锁片段和轨道");
    if (doc.clips.some(c => c.kind === "comp" || c.parentId || c.parent || c.keyframes?.speed?.length))
      throw new Error("Nested, parented or speed-ramped clips need manual editing / 嵌套、父子关联或变速曲线请先手动处理");
    // "The same boundary" within half a frame (and never less than the 1 ms the output is rounded to):
    // times are floats, captions land on frames and output times are kept in whole milliseconds, so a
    // range that is exactly a sentence must not read as cutting it — on a second pass either.
    const tol = Math.max(0.0015, 0.5 / (Number(doc.fps) > 0 ? Number(doc.fps) : 30));
    const result = clone(doc), captions = [], clips = [], segments = [], markers = [];
    // Conservatively reject stale provenance after arbitrary timeline edits;
    // do not present old source intervals as if they described the current cue.
    C.sourceMap(doc);
    let offset = 0;
    ranges.forEach((range, index) => {
      const part = clone(doc);
      part.clips = part.clips.filter(c => !C.isCaption(c));
      // Do not silently drop a short non-caption intersection in the upstream
      // engine, whose minimum clip length is 50ms. Caption precision is separate. An overlap within the
      // boundary tolerance is rounding (a range taken from a rounded caption), not media: it is dropped.
      if (part.clips.some(c => { const n = Math.min(c.start+c.duration, range.to)-Math.max(c.start, range.from); return n > tol && n < Edit.MIN_DUR; }))
        throw new Error("Media intersection below supported clip duration / 音视频交集短于当前编辑器支持长度");
      Edit.forDoc(part, { tracks: [...new Set(part.clips.map(c => c.track))] }).trimToRange(range.from, range.to);
      for (const c of part.clips) {
        c.id = `range${index}_${c.id}`;
        if (c.linkGroup) c.linkGroup = `range${index}_${c.linkGroup}`;
        if (c.linkedId) c.linkedId = `range${index}_${c.linkedId}`;
        c.start = c.start - range.from + offset;
        clips.push(c);
      }
      for (const original of doc.clips.filter(C.isCaption)) {
        const from = Math.max(original.start, range.from), to = Math.min(original.start + original.duration, range.to);
        if (to <= from) continue;
        const start = ms(offset + from - range.from), end = ms(offset + to - range.from);
        const prior = original.props.captionSource;
        const sourceStart = prior ? prior.intersection.start + from-original.start : from;
        const sourceEnd = prior ? prior.intersection.start + to-original.start : to;
        const sourceOriginal = prior?.original || { start: original.start, end: original.start + original.duration };
        const entry = { sourceCaptionId: prior?.sourceCaptionId || original.id, segment: index,
          originalText: prior?.originalText ?? original.props.text,
          original: sourceOriginal,
          intersection: { start: sourceStart, end: sourceEnd }, output: { start, end },
          truncated: sourceStart > sourceOriginal.start + tol || sourceEnd < sourceOriginal.end - tol,
          status: end > start ? "visible" : "omitted-rounded-empty" };
        captions.push(entry);
        if (end <= start) continue;
        const c = clone(original);
        c.id = `range${index}_${c.id}`; c.start = start; c.duration = end - start;
        if (c.linkGroup) c.linkGroup = `range${index}_${c.linkGroup}`;
        if (c.linkedId) c.linkedId = `range${index}_${c.linkedId}`;
        c.props.captionSource = entry;
        // Whole-sentence text survives a boundary; never infer aligned words.
        if (entry.truncated) { delete c.props.wordTimes; c.props.textAnim = "none"; }
        clips.push(c);
      }
      segments.push({ order: index, source: { start: range.from, end: range.to }, output: { start: offset, end: offset + range.to-range.from } });
      for (const marker of doc.markers || []) if (marker.t >= range.from && marker.t < range.to)
        markers.push({ ...clone(marker), ...(marker.id ? { id: `range${index}_${marker.id}` } : {}), t: offset + marker.t-range.from });
      offset += range.to-range.from;
    });
    result.clips = clips; result.markers = markers; result.inPoint = null; result.outPoint = null;
    result.captionOmissions = captions.filter(c => c.status === "omitted-rounded-empty");
    return { project: clone(result), duration: offset, segments, captions };
  }
  return { create };
});
