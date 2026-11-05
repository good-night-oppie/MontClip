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
  const num = (v) => String(Math.round(Math.abs(v) * 100) / 100);
  const minus = (v) => (v < 0 ? "−" : "") + num(v);              // 120 · −40 (a true minus sign, no plus)
  const plusMinus = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + num(v);   // +3 · −2
  const zh = (l) => l !== "en";
  /* The 15 properties 属性 shows (JJ's final words, 2026-11-04), in this order. Which ones a clip shows depends on its
     kind: the editor gives every clip every default (a recording's props hold text "Title" too), so a property is shown
     only where it means something — sound for video and audio, text for titles, picture for what is drawn. */
  const SOUND = ["video", "audio"], PICTURE = ["video", "image", "svg", "text", "shape", "comp", "adjust"], TEXT = ["text"];
  const PROPS = [
    { key: "text", zh: "文字内容", en: "Text", kinds: TEXT, value: (v) => String(v) },
    { key: "font", zh: "字体", en: "Font", kinds: TEXT, value: (v) => String(v) },
    { key: "fontSize", zh: "字号", en: "Size", kinds: TEXT, value: (v) => num(v) },
    { key: "color", zh: "颜色", en: "Color", kinds: TEXT, value: (v) => String(v), swatch: true },
    { key: "volume", zh: "音量", en: "Volume", kinds: SOUND, value: (v) => pct(v) },
    { key: "gain", zh: "音量增减", en: "Gain", kinds: SOUND,
      value: (v, l) => (v === 0 ? (zh(l) ? "不变" : "0 dB") : plusMinus(v) + (zh(l) ? " 分贝" : " dB")) },
    { key: "speed", zh: "速度", en: "Speed", kinds: SOUND, value: (v, l) => (v === 1 && zh(l) ? "原速" : num(v) + (zh(l) ? " 倍" : "×")) },
    { key: "pan", zh: "左右声道", en: "Pan", kinds: SOUND,
      value: (v, l) => (Math.abs(v) < 0.005 ? (zh(l) ? "居中" : "Center") : (v < 0 ? (zh(l) ? "偏左 " : "Left ") : (zh(l) ? "偏右 " : "Right ")) + pct(Math.abs(v))) },
    { key: "scale", zh: "缩放", en: "Scale", kinds: PICTURE, value: (v) => pct(v) },
    { key: "position", zh: "位置", en: "Position", kinds: PICTURE, from: ["x", "y"],
      value: ([x, y], l) => (zh(l) ? `横 ${minus(x)}，竖 ${minus(y)}` : `X ${minus(x)}, Y ${minus(y)}`) },
    { key: "rotation", zh: "旋转", en: "Rotation", kinds: PICTURE, value: (v) => minus(v) + "°" },
    { key: "opacity", zh: "不透明度", en: "Opacity", kinds: PICTURE, value: (v) => pct(v) },
    // the main interface names filters and text animations by their ids only: shown as they are (状态表: 未排)
    { key: "filterPreset", zh: "滤镜", en: "Filter", kinds: ["video", "image", "svg", "adjust"], value: (v) => String(v) },
    { key: "textAnim", zh: "文字动画", en: "Text animation", kinds: TEXT, value: (v) => String(v) },
  ];
  /** A keyframed channel's plain name (the 关键帧 row; x and y are 位置); one not among the 15 keeps its key. */
  function propName(key, lang = "zh-CN") {
    const p = PROPS.find((x) => x.key === key || (x.from && x.from.includes(key)));
    return p ? (zh(lang) ? p.zh : p.en) : key;
  }
  /** [[name, value, swatch?], …] for the clip's kind, in JJ's order. `name` is what the 名称 row already says: the
   *  text is not repeated when it is that. */
  function propRows(props, lang = "zh-CN", kind = "text", name = null) {
    const rows = [];
    const set = (v) => v !== undefined && v !== null && v !== "";
    for (const p of PROPS) {
      if (!p.kinds.includes(kind)) continue;
      const v = p.from ? p.from.map((k) => (props ? props[k] : undefined)) : props ? props[p.key] : undefined;
      if (p.from ? !v.some(set) : !set(v)) continue;
      if (p.key === "text" && String(v) === String(name)) continue;
      const val = p.from ? v.map((x) => (set(x) ? +x : 0)) : typeof v === "string" || p.key === "text" ? v : +v;
      const row = [zh(lang) ? p.zh : p.en, p.value(val, lang)];
      if (p.swatch && /^#[0-9a-f]{3,8}$/i.test(String(v))) row.push(String(v));
      rows.push(row);
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
      props: propRows(c.props, lang, c.kind, c.name || m?.name || c.props?.text || c.id),
      media: m ? { name: m.name, kind: m.kind, duration: m.duration ?? null, width: m.width ?? null, height: m.height ?? null,
        fps: m.fps ?? null, codec: m.codec ?? null, audioChannels: m.audioChannels ?? null } : null,
    };
  }

  return { lines, currentIndex, formatTime, clipFacts, kindLabel, propRows, propName };
});
