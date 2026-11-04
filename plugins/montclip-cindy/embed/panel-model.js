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

  /* 属性 in plain words (JJ, 2026-11-04: 类型 and the property names; the names below are the first version, for JJ to
     settle). zh-CN, else English. */
  const KIND = {
    "zh-CN": { video: "视频", audio: "音频", image: "图片", caption: "字幕", text: "文字", other: "其他" },
    en: { video: "Video", audio: "Audio", image: "Image", caption: "Caption", text: "Text", other: "Other" },
  };
  /** 视频 / 音频 / 图片 / 字幕 (a text clip the captions made) / 文字 / 其他 */
  function kindLabel(c, lang = "zh-CN") {
    const t = KIND[lang] || KIND.en;
    if (c.kind === "text") return c.props && c.props.caption ? t.caption : t.text;
    return t[c.kind] && c.kind !== "caption" && c.kind !== "other" ? t[c.kind] : t.other;
  }
  const pct = (v) => Math.round(v * 100) + "%";
  const num = (v) => String(Math.round(v * 100) / 100);
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v));
  /* each shown property: its name, how its value reads, and the value that needs no saying (the editor's default) */
  const PROPS = [
    { key: "volume", zh: "音量", en: "Volume", value: (v) => pct(v), quiet: 1 },
    { key: "gain", zh: "音量增减", en: "Gain", value: (v, l) => signed(v) + (l === "en" ? " dB" : " 分贝"), quiet: 0 },
    { key: "speed", zh: "速度", en: "Speed", value: (v, l) => num(v) + (l === "en" ? "×" : " 倍"), quiet: 1 },
    { key: "pan", zh: "左右声道", en: "Pan", quiet: 0,
      value: (v, l) => (Math.abs(v) < 0.005 ? (l === "en" ? "Center" : "居中") : (v < 0 ? (l === "en" ? "Left " : "偏左 ") : (l === "en" ? "Right " : "偏右 ")) + pct(Math.abs(v))) },
    { key: "scale", zh: "缩放", en: "Scale", value: (v) => pct(v), quiet: 1 },
    { key: "position", zh: "位置", en: "Position", from: ["x", "y"], quiet: [0, 0],
      value: ([x, y], l) => (l === "en" ? `X ${signed(x)} · Y ${signed(y)}` : `横 ${signed(x)} · 竖 ${signed(y)}`) },
    { key: "rotation", zh: "旋转", en: "Rotation", value: (v) => signed(v) + "°", quiet: 0 },
    { key: "opacity", zh: "不透明度", en: "Opacity", value: (v) => pct(v), quiet: 1 },
    { key: "brightness", zh: "亮度", en: "Brightness", value: (v) => num(v) + "%", quiet: 100 },
    { key: "contrast", zh: "对比度", en: "Contrast", value: (v) => num(v) + "%", quiet: 100 },
    { key: "saturation", zh: "饱和度", en: "Saturation", value: (v) => num(v) + "%", quiet: 100 },
    { key: "font", zh: "字体", en: "Font", value: (v) => String(v) },
    { key: "fontSize", zh: "字号", en: "Font size", value: (v) => num(v) },
    { key: "color", zh: "文字颜色", en: "Text colour", value: (v) => String(v) },
    { key: "filterPreset", zh: "滤镜", en: "Filter", value: (v) => String(v), quiet: "none" },
    { key: "textAnim", zh: "文字动画", en: "Text animation", value: (v) => String(v), quiet: "none" },
  ];
  /** A keyframed channel's plain name (the 关键帧 row); one not in the list keeps its key. */
  function propName(key, lang = "zh-CN") {
    const p = PROPS.find((x) => x.key === key || (x.from && x.from.includes(key)));
    return p ? (lang === "en" ? p.en : p.zh) : key;
  }
  /** [[name, value], …] for the properties set to something other than the editor's default; the title's own text is
   *  not among them (it is the clip's name). */
  function propRows(props, lang = "zh-CN") {
    const rows = [];
    const set = (v) => v !== undefined && v !== null && v !== "";
    for (const p of PROPS) {
      const v = p.from ? p.from.map((k) => (props ? props[k] : undefined)) : props ? props[p.key] : undefined;
      if (p.from ? !v.some(set) : !set(v)) continue;
      if (p.from ? v.every((x, i) => !set(x) || x === p.quiet[i]) : p.quiet !== undefined && v === p.quiet) continue;
      const val = p.from ? v.map((x) => (set(x) ? +x : 0)) : v;
      rows.push([lang === "en" ? p.en : p.zh, p.value(val, lang)]);
    }
    return rows;
  }
  /** What 属性 shows for one clip (null when there is no such clip). Read-only: edits go through the editor. */
  function clipFacts(project, id, lang = "zh-CN") {
    const c = (project.clips || []).find((x) => x.id === id);
    if (!c) return null;
    const m = c.mediaId ? (project.media || []).find((x) => x.id === c.mediaId) : null;
    return {
      id: c.id, name: c.name || m?.name || c.props?.text || c.id, kind: c.kind, kindLabel: kindLabel(c, lang), track: c.track,
      start: round(c.start), duration: round(c.duration), end: round(c.start + c.duration),
      // 素材起点: where in its file the clip starts — only for a clip that has a file
      in: m ? round(c.in || 0) : null,
      locked: !!c.locked || (project.lockedTracks || []).includes(c.track), disabled: !!c.disabled,
      keyframes: [...new Set(Object.keys(c.keyframes || {}).filter((k) => (c.keyframes[k] || []).length).map((k) => propName(k, lang)))],
      props: propRows(c.props, lang),
      media: m ? { name: m.name, kind: m.kind, duration: m.duration ?? null, width: m.width ?? null, height: m.height ?? null,
        fps: m.fps ?? null, codec: m.codec ?? null, audioChannels: m.audioChannels ?? null } : null,
    };
  }

  return { lines, currentIndex, formatTime, clipFacts, kindLabel, propRows, propName };
});
