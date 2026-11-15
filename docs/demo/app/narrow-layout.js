/* Narrow windows (VV, 2026-11-02): tools that do not fit a bar go into that bar's
   "More" menu instead of being cut off, and the timeline never takes the room the
   preview and the player need. Pure planning functions (tested in Node) plus a small
   DOM helper that moves the real elements, so their listeners and state come along. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipNarrow = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // The upper area keeps room for the monitor header, the player and a picture;
  // the timeline keeps its toolbar, the ruler and one track.
  const UPPER_MIN = 150, TIMELINE_MIN = 140;

  /** items: [{id, width, rank}] in bar order; rank null = never moves, higher ranks leave first.
      Returns {keep, more, needsMore}: what stays (in order), what moves (in the order it left). */
  function planOverflow(items, { available, gap = 0, moreWidth = 0 }) {
    const span = (list) => list.reduce((s, x) => s + x.width, 0) + gap * Math.max(0, list.length - 1);
    if (span(items) <= available) return { keep: items.map((x) => x.id), more: [], needsMore: false };
    const keep = items.slice(), more = [];
    const movable = items.filter((x) => x.rank != null).sort((a, b) => b.rank - a.rank);
    for (const x of movable) {
      if (span(keep) + gap + moreWidth <= available) break;
      keep.splice(keep.indexOf(x), 1); more.push(x.id);
    }
    return { keep: keep.map((x) => x.id), more, needsMore: more.length > 0 };
  }

  /** The largest timeline height that still leaves UPPER_MIN for the upper area. */
  function timelineMax({ appHeight, fixed, gaps, gap, upperMin = UPPER_MIN }) {
    return Math.floor(appHeight - fixed.reduce((s, h) => s + h, 0) - gaps * gap - upperMin);
  }

  /** What the upper area needs: the monitor header, the player and a 90px-tall picture. */
  function upperNeed({ head, transport, stageMin = 90 }) {
    return Math.max(UPPER_MIN, Math.ceil(head + transport + stageMin));
  }

  /* Keep `bar`'s direct children with data-more-rank in the bar while they fit; move the
     rest (highest rank first) into `menu`, shown by `button`. Placeholders keep the order.
     floating: the menu lives in <body> and opens fixed under its button, so nothing the bar's
     panel draws (the monitor's picture) or clips can cover it (VV, #33: #preview did). */
  function attach(bar, button, menu, { onChange, floating = false } = {}) {
    const doc = bar.ownerDocument, slots = new Map(), view = doc.defaultView || window;
    if (floating) { doc.body.appendChild(menu); menu.classList.add("more-menu-floating"); }
    let lastWidth = -1; // the width our own last move left the bar at: not a reason to re-plan
    const ranked = () => [...bar.children, ...menu.children].filter((e) => e.dataset && e.dataset.moreRank != null);
    const restore = () => { for (const [el, mark] of slots) mark.replaceWith(el); slots.clear(); };
    function layout() {
      restore();
      button.hidden = true;
      const style = getComputedStyle(bar), gap = parseFloat(style.columnGap || style.gap) || 0;
      const available = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const kids = [...bar.children].filter((e) => e !== button && e !== menu && e.offsetParent !== null && !e.classList.contains("flex-spacer"));
      const items = kids.map((e, i) => ({ id: i, el: e, width: e.getBoundingClientRect().width, rank: e.dataset.moreRank != null ? +e.dataset.moreRank : null }));
      button.hidden = false;
      const moreWidth = button.getBoundingClientRect().width;
      const plan = planOverflow(items, { available, gap, moreWidth });
      button.hidden = !plan.needsMore;
      if (!plan.needsMore) close();
      for (const id of plan.more.slice().sort((a, b) => a - b)) {
        const el = items[id].el, mark = doc.createComment("more");
        el.replaceWith(mark); slots.set(el, mark); menu.appendChild(el);
      }
      button.classList.toggle("on", false);
      lastWidth = bar.getBoundingClientRect().width;
      if (onChange) onChange(plan.more.map((id) => items[id].el));
    }
    function place() {
      if (!floating || menu.hidden) return;
      const b = button.getBoundingClientRect(), w = menu.offsetWidth, top = Math.round(b.bottom + 4);
      menu.style.top = top + "px";
      menu.style.left = Math.round(Math.max(8, Math.min(b.right - w, view.innerWidth - w - 8))) + "px";
      menu.style.maxHeight = Math.max(80, view.innerHeight - top - 8) + "px";
    }
    function open() { menu.hidden = false; button.setAttribute("aria-expanded", "true"); place(); }
    function close() { menu.hidden = true; button.setAttribute("aria-expanded", "false"); }
    button.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });
    doc.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== button) close(); }, true);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { close(); button.focus(); } });
    let queued = false;
    const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layout(); }); };
    new ResizeObserver((entries) => { if (Math.abs(entries[0].target.getBoundingClientRect().width - lastWidth) > 0.5) schedule(); }).observe(bar);
    // a bar that sizes to its content still re-plans when the window changes
    view.addEventListener("resize", () => { schedule(); place(); });
    // a tool that appears or disappears (IN/OUT tools, Source mode) or relabels (language) re-plans
    const watch = new MutationObserver(schedule);
    for (const el of ranked()) watch.observe(el, { attributes: true, attributeFilter: ["class", "hidden"], childList: true, subtree: true, characterData: true });
    close(); schedule();
    return { layout, open, close, place };
  }

  return { UPPER_MIN, TIMELINE_MIN, planOverflow, timelineMax, upperNeed, attach };
});
