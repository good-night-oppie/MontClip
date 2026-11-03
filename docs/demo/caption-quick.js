/* Caption size and position in one go (P5; frozen design v10 ④, v7.2 numbers, Deja 2026-11-03). Pure: the numbers,
   what the buttons show, and the change to a list of caption clips. The page (app.js captionQuick*) offers it in two
   places — 〔字幕大小〕 beside the caption style menu for all captions, the Inspector's top for the selected ones — and
   makes each change one undo step. Nothing is generated again: only props.fontSize and props.y change.
     中 = round(0.042 × the canvas's short side), 大 = round(中 × 1.3), 小 = round(中 × 0.8);
     上面 / 下面 = ∓round(0.38 × the canvas height) from the centre (props.y is px from the centre, y down). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipCaptionQuick = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SIZES = ["small", "mid", "big"], POSITIONS = ["top", "bottom"];
  // a text clip's own defaults (app.js DEFAULT_PROPS): a caption without them reads as these
  const DEFAULT_FONT_SIZE = 72, DEFAULT_Y = 0;

  function sizes(width, height) {
    const mid = Math.round(0.042 * Math.min(width, height));
    return { small: Math.round(mid * 0.8), mid, big: Math.round(mid * 1.3) };
  }
  function positions(width, height) {
    const d = Math.round(0.38 * height);
    return { top: -d, bottom: d };
  }
  const fontSizeOf = (c) => (c.props && Number.isFinite(c.props.fontSize) ? c.props.fontSize : DEFAULT_FONT_SIZE);
  const yOf = (c) => (c.props && Number.isFinite(c.props.y) ? c.props.y : DEFAULT_Y);

  /** What the buttons show for these clips: the level they all have (or null), and whether they differ. */
  function current(clips, width, height) {
    const s = sizes(width, height), p = positions(width, height);
    const one = (values, table, names) => {
      const same = values.every((v) => v === values[0]);
      if (!values.length || !same) return { level: null, mixed: values.length > 1 && !same };
      return { level: names.find((k) => table[k] === values[0]) || null, mixed: false };
    };
    const a = one(clips.map(fontSizeOf), s, SIZES), b = one(clips.map(yOf), p, POSITIONS);
    return { size: a.level, mixedSize: a.mixed, pos: b.level, mixedPos: b.mixed };
  }

  /** Give every clip the size ("size": small | mid | big) or the position ("pos": top | bottom). Returns how many. */
  function apply(clips, kind, level, width, height) {
    if (kind === "size" && SIZES.includes(level)) {
      const v = sizes(width, height)[level];
      for (const c of clips) c.props = { ...(c.props || {}), fontSize: v };
    } else if (kind === "pos" && POSITIONS.includes(level)) {
      const v = positions(width, height)[level];
      for (const c of clips) c.props = { ...(c.props || {}), y: v };
    } else throw new Error("caption quick: unknown " + kind + " " + level);
    return clips.length;
  }

  return { SIZES, POSITIONS, sizes, positions, current, apply };
});
