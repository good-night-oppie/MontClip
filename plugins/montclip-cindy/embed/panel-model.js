/* The side panel's model (pure; tested in Node): the timeline's lines for 文稿 (Transcript) and the selected clip's
   facts for 属性 (Properties), read from the project document. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipPanelModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

  /** The lines to read: the captions when there are any (props.caption), else every title (text clip) — by start,
   *  leaving out disabled clips and disabled tracks. */
  function lines(project) {
    const off = new Set(project.disabledTracks || []);
    const text = (project.clips || []).filter((c) => c.kind === "text" && !c.disabled && !off.has(c.track) &&
      String(c.props?.text ?? "").trim());
    const captions = text.filter((c) => c.props?.caption);
    return (captions.length ? captions : text)
      .map((c) => ({ id: c.id, start: round(c.start), end: round(c.start + c.duration), text: String(c.props.text).replace(/\s*\n\s*/g, " ").trim(), track: c.track, caption: !!c.props.caption }))
      .sort((a, b) => a.start - b.start || a.track.localeCompare(b.track));
  }

  /** The line being shown at `t` (the latest one that started), or -1. */
  function currentIndex(list, t) {
    let at = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].start <= t + 1e-6) { if (t < list[i].end) at = i; }
      else break;
    }
    return at;
  }

  /** 1:05.3 · 1:02:03.0 */
  function formatTime(t) {
    t = Math.max(0, +t || 0);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const ss = s.toFixed(1).padStart(4, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  const SHOWN_PROPS = ["text", "font", "fontSize", "color", "volume", "gain", "speed", "pan", "scale", "x", "y", "rotation", "opacity", "filterPreset", "textAnim"];
  /** What 属性 shows for one clip (null when there is no such clip). Read-only: edits go through the editor. */
  function clipFacts(project, id) {
    const c = (project.clips || []).find((x) => x.id === id);
    if (!c) return null;
    const m = c.mediaId ? (project.media || []).find((x) => x.id === c.mediaId) : null;
    const props = {};
    for (const k of SHOWN_PROPS) if (c.props && c.props[k] !== undefined && c.props[k] !== "") props[k] = c.props[k];
    return {
      id: c.id, name: c.name || m?.name || c.props?.text || c.id, kind: c.kind, track: c.track,
      start: round(c.start), duration: round(c.duration), end: round(c.start + c.duration), in: round(c.in || 0),
      locked: !!c.locked || (project.lockedTracks || []).includes(c.track), disabled: !!c.disabled,
      keyframes: Object.keys(c.keyframes || {}).filter((k) => (c.keyframes[k] || []).length),
      props,
      media: m ? { name: m.name, kind: m.kind, duration: m.duration ?? null, width: m.width ?? null, height: m.height ?? null,
        fps: m.fps ?? null, codec: m.codec ?? null, audioChannels: m.audioChannels ?? null } : null,
    };
  }

  return { lines, currentIndex, formatTime, clipFacts };
});
