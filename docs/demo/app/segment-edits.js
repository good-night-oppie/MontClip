/* Two edits of the 「自动出切片」 cards (the owner: 「卡片加『这段不是唱歌』、弹窗加『补一段』」; Deja, 2026-11-03). Base
   capabilities in capabilities.js (set_segment_kind, add_segment), both undoable; the streamer's buttons and the AI call
   the same functions. Pure: each gives the cards after it, the event's args (capability + args, for agent-events.js),
   how to undo it, and the correction it teaches (corrections.js record, without the numbers the page adds: the
   recording's length and the part's sound). The cards are not changed in place. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipSegmentEdits = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // 互动 right after 唱歌 (ADR 39a05471), then 聊天 and 整活 (Deja, from v12); 普通高光 is what the search finds. ADD_ORDER is
  // what 补一段 offers, in v12's order: 唱歌、互动、聊天、整活、别的
  const KINDS = Object.freeze(["song", "interaction", "chat", "stunt", "moment", "other"]), MIN_LEN = 5;
  const ADD_ORDER = Object.freeze(["song", "interaction", "chat", "stunt", "other"]);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const copy = (cards) => JSON.parse(JSON.stringify(Array.isArray(cards) ? cards : []));
  const no = (code) => ({ ok: false, code });

  /** set_segment_kind {id, kind}: the card's kind changes, nothing else. */
  function setKind(cards, { id, kind } = {}) {
    if (!KINDS.includes(kind) || typeof id !== "string") return no("SEGMENT_INVALID");
    const list = copy(cards), c = list.find((x) => x.id === id);
    if (!c) return no("SEGMENT_UNKNOWN");
    if (c.kind === kind) return no("SEGMENT_SAME");
    const was = c.kind;
    c.kind = kind;
    return { ok: true, cards: list, event: { capability: "set_segment_kind", args: { id, kind } },
      undo: { op: "kind", id, kind: was }, correction: { type: "kind", from: was, to: kind } };
  }
  /** add_segment {mediaId, from, to, kind}: a new card from IN–OUT, inside its recording (opts.duration[mediaId]),
   *  at least MIN_LEN seconds, after the other cards (whose order is not touched). */
  function add(cards, { mediaId, from, to, kind } = {}, opts = {}) {
    const max = opts.duration && opts.duration[mediaId];
    if (!KINDS.includes(kind) || typeof mediaId !== "string" || !Number.isFinite(max)) return no("SEGMENT_INVALID");
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > max || to <= from) return no("SEGMENT_OUTSIDE");
    if (to - from < MIN_LEN) return no("SEGMENT_TOO_SHORT");
    const list = copy(cards), s = r3(from), e = r3(to);
    let id = mediaId + "_a" + Math.round(s * 10), k = 2;
    while (list.some((c) => c.id === id)) id = mediaId + "_a" + Math.round(s * 10) + "_" + k++;
    // added after the others: the cards keep their own order (best first), so undoing gives them back exactly
    list.push({ id, mediaId, kind, no: null, s, e, at: s, added: true });
    return { ok: true, id, cards: list, event: { capability: "add_segment", args: { mediaId, from: s, to: e, kind } },
      undo: { op: "remove", id }, correction: { type: "add", kind } };
  }
  /** Undo one edit: {op:"kind", id, kind} puts the kind back; {op:"remove", id} takes the added card out. */
  function undo(cards, u) {
    const list = copy(cards);
    if (u && u.op === "kind") { const c = list.find((x) => x.id === u.id); if (c) c.kind = u.kind; return list; }
    if (u && u.op === "remove") return list.filter((x) => x.id !== u.id);
    return list;
  }
  return Object.freeze({ KINDS, ADD_ORDER, MIN_LEN, setKind, add, undo });
});
