/* MontClip media management — the Project bin's metadata, search, filters,
   sorting, tags, collections and usage. Zero dependencies. Loaded by the
   editor as a plain script (global `MontClipMedia`) and required by the
   server, the MCP server and the tests.

   A media entry may carry, beside id/name/kind/src/duration/width/height:
     size          bytes on disk
     fps           video frame rate (29.97, 30, 59.94 …)
     codec         video codec (h264, hevc, vp9, prores …) — or the image format
     audioCodec    aac, mp3, pcm_s16le, opus …
     audioChannels channel count of the first audio stream, 0 = no audio
     sampleRate    Hz
     bitrate       bits per second (whole file)
     favorite      true = starred in the bin
     tags          ["interview", "b-roll"]
   Metadata comes from ffprobe (parseProbe) — the server reads it, nobody
   types it. Collections are project-level: project.collections =
   [{id, name, media:[mediaId…]}], a media entry can be in any number of them. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else root.MontClipMedia = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const KINDS = ["video", "audio", "image", "svg"];
  /** Fields the server probes. Written back to the entry; never user-set. */
  const INFO_KEYS = ["size", "fps", "codec", "audioCodec", "audioChannels", "sampleRate", "bitrate"];
  const MAX_TAGS = 24, MAX_TAG_LEN = 32;
  const SORT_KEYS = ["name", "kind", "duration", "resolution", "fps", "codec", "audio", "size", "usage"];

  const ratio = (s) => {
    const [a, b] = String(s || "").split("/").map(Number);
    return b > 0 && a > 0 ? a / b : (a > 0 && !b && !String(s).includes("/") ? a : 0);
  };
  const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

  /** An MKV stream's DURATION tag, "HH:MM:SS.nnnnnnnnn", in seconds (0 when it is not one). */
  function tagSeconds(s) {
    const m = /^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/.exec(String(s || "").trim());
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  }
  /** How long a file plays, in seconds, or 0 when nothing in the probe says (JJ / Rea, 2026-11-04). A Matroska
   *  file's format.duration (and each stream's DURATION tag) is where its last timestamp ends, so the start time comes
   *  off: one whose timestamps start at 3600 s says 3620 s for 20 s. MP4, MOV and TS already give the length. A
   *  recording cut off mid-way may not say it in the header: then the streams' own durations, then the DURATION tags. */
  function probeDuration(fmt, streams) {
    const mkv = /\bmatroska\b|\bwebm\b/.test(String(fmt.format_name || ""));
    const less = (d, start) => (mkv && start > 0 && d > start ? d - start : d);
    const dur = less(Number(fmt.duration), Number(fmt.start_time) || 0);
    if (dur > 0) return dur;
    // from the earliest start to the latest end across the streams (QQ, #126): each stream less its own start would lose
    // the gap between them (video 0–20 s, audio 10–30 s plays 30 s, not 20 s)
    const av = streams.filter((s) => (s.codec_type === "video" || s.codec_type === "audio") && !(s.disposition && s.disposition.attached_pic));
    const span = (end) => {
      let first = Infinity, last = -Infinity;
      for (const s of av) {
        const start = Number(s.start_time) || 0, e = end(s, start);
        if (e > start) { first = Math.min(first, start); last = Math.max(last, e); }
      }
      return last > first ? last - first : 0;
    };
    // a stream's duration is its length; an MKV's DURATION tag is where its timestamps end (a length when it is shorter than the start)
    return span((s, start) => Number(s.duration) > 0 ? start + Number(s.duration) : 0) ||
      span((s, start) => { const d = tagSeconds(s.tags && (s.tags.DURATION || s.tags.duration)); return d > 0 ? (mkv && d > start ? d : start + d) : 0; });
  }
  const timed = (m) => m && m.kind !== "image" && m.kind !== "svg";
  const matroska = (m) => /\.(mkv|webm)$/i.test(String(m.src || "").split(/[?#]/)[0]) || /\.(mkv|webm)$/i.test(String(m.name || ""));
  /** Should the editor ask the server about this entry? One with no size yet (as always), and, once (durationChecked),
   *  an MKV / WebM (the browser counts the start of its timestamps: 3620 s for 20 s) or a recording with no usable length.
   *  Old projects and MCP imports already have a size, so the size alone never reached them (QQ, #126). */
  function needsInfo(m) {
    if (!m) return false;
    if (m.size == null) return true;
    if (!timed(m) || m.durationChecked) return false;
    return matroska(m) || !(Number.isFinite(m.duration) && m.duration > 0);
  }
  /** Take the server's length (info from parseProbe) into the entry: where the browser has none, or one more than a second
   *  longer (an MKV's start counted). Marks entries asked for their length so they are asked once.
   *  → {changed, unknown, length} — length: the entry's length itself changed (its clips then need fitClips) */
  function serverDuration(m, info) {
    const out = { changed: false, unknown: false, length: false };
    if (!timed(m) || !info) return out;
    const known = Number.isFinite(m.duration) && m.duration > 0;
    if (info.duration > 0 && (!known || m.duration - info.duration > 1)) { m.duration = info.duration; out.changed = out.length = true; }
    else if (info.durationUnknown && !known) out.unknown = true;
    if ((info.duration > 0 || info.durationUnknown) && !m.durationChecked && (matroska(m) || !(Number.isFinite(m.duration) && m.duration > 0) || out.unknown)) {
      m.durationChecked = true; out.changed = true;
    }
    return out;
  }
  /** Fit the clips of media m into its length, as a replaced file's clips are (in + duration×speed ≤ m.duration; a linked
   *  sound shares the media and its timing, so it fits the same). Pictures are left alone. → how many edges moved */
  function fitClips(m, clips) {
    let trimmed = 0;
    if (!timed(m) || !(m.duration > 0)) return 0;
    for (const c of clips || []) {
      if (c.mediaId !== m.id || c.kind === "image" || c.kind === "svg") continue;
      const speed = (c.props && +c.props.speed) || 1;
      const maxIn = Math.max(0, m.duration - 0.001);
      if ((+c.in || 0) > maxIn) { c.in = maxIn; trimmed++; }
      const maxDur = Math.max(0.05, (m.duration - (+c.in || 0)) / speed);
      if (c.duration > maxDur + 1e-6) { c.duration = maxDur; trimmed++; }
    }
    return trimmed;
  }

  /** ffprobe -show_format -show_streams -of json output → the INFO_KEYS (+ duration,
   *  width, height). `size` falls back to the stat size the caller passes. A video or a
   *  sound whose length nothing says gets durationUnknown: true (never duration 0). */
  function parseProbe(json, statSize) {
    const out = {};
    const streams = Array.isArray(json && json.streams) ? json.streams : [];
    const fmt = (json && json.format) || {};
    const v = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
    const a = streams.find((s) => s.codec_type === "audio");
    const size = Number(fmt.size) || Number(statSize) || 0;
    if (size > 0) out.size = size;
    const dur = probeDuration(fmt, streams);
    if (dur > 0) out.duration = round(dur, 3);
    const br = Number(fmt.bit_rate);
    if (br > 0) out.bitrate = Math.round(br);
    // stills (png/jpg/webp, gif) report 25/1 — not a frame rate anyone shot at
    const still = !!v && /^(png|mjpeg|jpeg|webp|bmp|tiff|gif)$/.test(String(v.codec_name || "")) && !(dur > 0 && Number(v.nb_frames) > 1);
    if (v) {
      if (v.codec_name) out.codec = String(v.codec_name);
      let w = Number(v.width) || 0, h = Number(v.height) || 0;
      const rot = Number(((v.side_data_list || []).find((d) => d.rotation != null) || {}).rotation ?? (v.tags && v.tags.rotate)) || 0;
      if (Math.abs(rot) % 180 === 90) [w, h] = [h, w];
      if (w > 0 && h > 0) { out.width = w; out.height = h; }
      const fps = ratio(v.avg_frame_rate) || ratio(v.r_frame_rate);
      if (!still && fps > 0 && fps < 1000) out.fps = round(fps, 3);
    }
    if (a) {
      if (a.codec_name) out.audioCodec = String(a.codec_name);
      const ch = Number(a.channels);
      if (ch > 0) out.audioChannels = ch;
      const sr = Number(a.sample_rate);
      if (sr > 0) out.sampleRate = sr;
    } else if (v && !still) out.audioChannels = 0;   // a video without sound says so; a picture has no audio to speak of
    if (!(dur > 0) && (a || (v && !still))) out.durationUnknown = true;
    return out;
  }

  /* ── formatting ── */
  function fmtSize(b) {
    if (!(b > 0)) return "";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0, n = b;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (i === 0 ? n : n < 10 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
  }
  function fmtFps(f) {
    if (!(f > 0)) return "";
    return String(round(f, 2));
  }
  function fmtRes(m) { return m && m.width > 0 && m.height > 0 ? `${m.width}×${m.height}` : ""; }
  function fmtAudio(m) {
    if (!m || m.audioChannels == null) return "";
    if (m.audioChannels === 0) return "no audio";
    const ch = m.audioChannels === 1 ? "mono" : m.audioChannels === 2 ? "stereo" : m.audioChannels === 6 ? "5.1" : m.audioChannels === 8 ? "7.1" : m.audioChannels + " ch";
    return ch + (m.sampleRate ? ` ${round(m.sampleRate / 1000, 1)} kHz` : "");
  }
  function fmtDur(t) {
    if (!(t > 0)) return "";
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const ss = s.toFixed(2).padStart(5, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  /** One-line summary: "1920×1080 · 29.97 fps · h264 · stereo 48 kHz · 45 MB". */
  function describe(m) {
    return [fmtRes(m), m.fps ? fmtFps(m.fps) + " fps" : "", m.codec || "", fmtAudio(m), fmtSize(m.size)]
      .filter(Boolean).join(" · ");
  }

  /* ── the canvas from a recording (N25: docs/decisions/2026-11-03-canvas-follows-source.md) ── */
  const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  /** A recording's average frame rate (VFR included) snapped to the nearest standard rate within 3 %; null when none is
   *  that near (the caller then uses 30). */
  function standardFps(avg) {
    const v = Number(avg);
    if (!(v > 0) || !Number.isFinite(v)) return null;
    let best = null;
    for (const f of STANDARD_FPS) if (Math.abs(v - f) / f <= 0.03 && (best == null || Math.abs(v - f) < Math.abs(v - best))) best = f;
    return best;
  }
  /** The canvas a recording gives: its own size (down to even numbers, never scaled), its snapped rate or 30.
   *  null until the server has read its size and rate. */
  function sourceCanvas(m) {
    if (!m || m.kind !== "video" || !(m.width >= 16) || !(m.height >= 16) || !(m.fps > 0)) return null;
    const fps = standardFps(m.fps);
    return { width: Math.floor(m.width / 2) * 2, height: Math.floor(m.height / 2) * 2, fps: fps || 30, fpsSnapped: fps != null };
  }
  // the canvases a project has when nobody chose one: a new project (1080p template) and the first-run project.json
  const DEFAULT_CANVASES = [[1920, 1080, 30], [1280, 720, 30]];
  /** An empty project whose canvas nobody chose takes the first recording's. Chosen: canvasUser (set by the canvas and
   *  frame-rate menus, a non-default template, an agent's setProject), or, for a project saved before canvasUser
   *  existed, a canvas no default has, or an export frame. Not empty: a clip, a picture in the bin, a comp, a second sequence. */
  function canvasFollowsSource(doc) {
    if (!doc || doc.canvasUser || doc.exportFrame) return false;
    if (!DEFAULT_CANVASES.some(([w, h, f]) => doc.width === w && doc.height === h && Number(doc.fps) === f)) return false;
    if ((doc.clips || []).length || (doc.comps || []).length) return false;
    if ((doc.media || []).some((m) => m && m.kind !== "audio")) return false;
    if ((doc.sequences || []).length > 1) return false;
    return true;
  }

  /* ── tags and collections ── */
  function normalizeTags(v) {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
    const out = [], seen = new Set();
    for (const t of list) {
      const s = String(t == null ? "" : t).replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LEN);
      if (!s || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      out.push(s);
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  }
  /** Every tag used in the project, sorted, each once (first spelling wins). */
  function allTags(media) {
    const seen = new Map();
    for (const m of media || []) for (const t of m.tags || []) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }
  function normalizeCollections(list, media) {
    if (!Array.isArray(list)) return [];
    const ids = media ? new Set(media.map((m) => m.id)) : null;
    const out = [], seen = new Set();
    for (const c of list) {
      if (!c || !c.id || seen.has(String(c.id))) continue;
      seen.add(String(c.id));
      const mem = [...new Set((Array.isArray(c.media) ? c.media : []).map(String))].filter((id) => !ids || ids.has(id));
      out.push({ id: String(c.id), name: String(c.name || "Collection").trim().slice(0, 80) || "Collection", media: mem });
    }
    return out;
  }

  /* ── usage ── */
  /** Where a media entry is placed: one entry per placement (a video and its
   *  linked audio stems count once), on the main timeline (comp: null) and
   *  inside every composition. Sorted main timeline first, then by time. */
  function placements(doc, mediaId) {
    const out = [];
    const scan = (clips, comp, seq) => {
      const groups = new Map();
      for (const c of clips || []) {
        if (c.mediaId !== mediaId) continue;
        const key = c.linkGroup ? "g:" + c.linkGroup : "c:" + c.id;
        const prev = groups.get(key);
        // the picture represents a placement; its stems fold into it
        if (!prev || (prev.kind !== "video" && c.kind === "video")) groups.set(key, c);
      }
      for (const c of groups.values())
        out.push({ clipId: c.id, comp: comp ? comp.id : null, compName: comp ? comp.name : null, track: c.track, start: +c.start || 0, duration: +c.duration || 0, kind: c.kind,
          ...(seq ? { sequence: seq.id, sequenceName: seq.name || seq.id } : {}) });
    };
    scan(doc && doc.clips, null);
    for (const comp of (doc && doc.comps) || []) scan(comp.clips, comp);
    for (const seq of otherSequences(doc)) scan(seq.clips, null, seq);
    const rank = (p) => (p.sequence ? 2 : p.comp ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || String(a.sequence || "").localeCompare(String(b.sequence || "")) ||
      String(a.comp || "").localeCompare(String(b.comp || "")) || a.start - b.start);
  }
  /** The sequences that aren't open (see sequences.js): their clips use media too. */
  function otherSequences(doc) {
    const list = doc && Array.isArray(doc.sequences) ? doc.sequences : [];
    const act = list.some((x) => x.id === doc.sequence) ? doc.sequence : list[0] && list[0].id;
    return list.filter((x) => x && x.id !== act && Array.isArray(x.clips));
  }
  /** mediaId → number of placements (see placements()). */
  function usageCounts(doc) {
    const n = new Map();
    for (const m of (doc && doc.media) || []) n.set(m.id, 0);
    const scan = (clips) => {
      const seen = new Set();
      for (const c of clips || []) {
        if (!c.mediaId) continue;
        // per file: a denoised stem shares its video's linkGroup but plays another file
        const key = (c.linkGroup ? "g:" + c.linkGroup : "c:" + c.id) + "|" + c.mediaId;
        if (seen.has(key)) continue;
        seen.add(key);
        n.set(c.mediaId, (n.get(c.mediaId) || 0) + 1);
      }
    };
    scan(doc && doc.clips);
    for (const comp of (doc && doc.comps) || []) scan(comp.clips);
    for (const seq of otherSequences(doc)) scan(seq.clips);
    return n;
  }

  /* ── search, filter, sort ── */
  const ext = (m) => (/\.([a-z0-9]+)$/i.exec(String(m.name || m.src || "")) || [])[1] || "";
  /** Search text: every word must match the name, kind, extension, codecs,
   *  resolution or a tag; "#word" matches tags only. */
  function matchesQuery(m, q) {
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const tags = (m.tags || []).map((t) => t.toLowerCase());
    const hay = [m.name, m.kind, ext(m), m.codec, m.audioCodec, fmtRes(m).replace("×", "x"), m.height ? m.height + "p" : ""]
      .filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => w.startsWith("#")
      ? tags.some((t) => t.includes(w.slice(1)))
      : hay.includes(w) || tags.some((t) => t.includes(w)));
  }
  /** filter: "" | "fav" | "used" | "unused" | "kind:<kind>" | "tag:<tag>" | "col:<collectionId>". */
  function matchesFilter(m, filter, ctx) {
    const f = String(filter || "");
    if (!f || f === "all") return true;
    const uses = ctx && ctx.usage ? ctx.usage.get(m.id) || 0 : 0;
    if (f === "fav") return m.favorite === true;
    if (f === "used") return uses > 0;
    if (f === "unused") return uses === 0;
    if (f.startsWith("kind:")) return m.kind === f.slice(5);
    if (f.startsWith("tag:")) { const t = f.slice(4).toLowerCase(); return (m.tags || []).some((x) => x.toLowerCase() === t); }
    if (f.startsWith("col:")) {
      const c = ((ctx && ctx.collections) || []).find((x) => x.id === f.slice(4));
      return !!c && c.media.includes(m.id);
    }
    if (ctx && typeof ctx.extraFilter === "function") return ctx.extraFilter(m, f);
    return true;
  }
  /** Sort value for a key; null sorts last whatever the direction. */
  function sortValue(m, key, ctx) {
    switch (key) {
      case "kind": return KINDS.indexOf(m.kind);
      case "duration": return m.duration > 0 ? m.duration : null;
      case "resolution": return m.width > 0 && m.height > 0 ? m.width * m.height : null;
      case "fps": return m.fps > 0 ? m.fps : null;
      case "codec": return m.codec || null;
      case "audio": return m.audioChannels != null ? m.audioChannels : null;
      case "size": return m.size > 0 ? m.size : null;
      case "usage": return ctx && ctx.usage ? ctx.usage.get(m.id) || 0 : 0;
      default: return null;
    }
  }
  function sortMedia(list, key, dir, ctx) {
    const sign = dir === "desc" ? -1 : 1;
    const byName = (a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base", numeric: true });
    return list.slice().sort((a, b) => {
      if (!key || key === "name") return sign * byName(a, b);
      const va = sortValue(a, key, ctx), vb = sortValue(b, key, ctx);
      if (va == null || vb == null) return va == null && vb == null ? byName(a, b) : va == null ? 1 : -1;
      const d = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return d ? sign * d : byName(a, b);
    });
  }
  /** search + filter + sort in one go. Favorites float to the top when asked. */
  function query(media, opts, ctx) {
    const o = opts || {};
    const hit = (media || []).filter((m) => matchesQuery(m, o.q) && matchesFilter(m, o.filter, ctx));
    return sortMedia(hit, o.sort || "name", o.dir || "asc", ctx);
  }

  const KIND_BY_EXT = {
    mp4: "video", webm: "video", mov: "video", mkv: "video", m4v: "video", avi: "video", flv: "video",
    mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", aac: "audio", flac: "audio", opus: "audio",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "svg",
  };
  /** video | audio | image | svg from a file name or src, or null. */
  function kindFromName(n) {
    const ext = (/\.([a-z0-9]+)$/i.exec(String(n || "").split("?")[0]) || [])[1];
    return (ext && KIND_BY_EXT[ext.toLowerCase()]) || null;
  }

  /* ── relink ── */
  const stem = (n) => String(n || "").replace(/\.[a-z0-9]{1,5}$/i, "").toLowerCase();
  /** Name of a /media/… or /library/… src, decoded. */
  function srcName(src) {
    const s = String(src || "").split("?")[0].split("/").pop() || "";
    try { return decodeURIComponent(s); } catch { return s; }
  }
  /** How likely `file` ({name, size}) is the missing media `m` ({name, src, size}).
   *  → {score, why}; 0 = not a candidate. Same file name beats same name with
   *  another extension beats a name containing the other; a matching size adds.
   *  With m.kind, files of another kind never qualify. */
  function relinkScore(m, file) {
    // only files that can stand in for this kind (an audio entry may sit in a video container)
    const fk = kindFromName(file.name);
    if (m.kind && fk && fk !== m.kind && !(m.kind === "audio" && fk === "video")) return { score: 0, why: "" };
    const names = [m.name, srcName(m.src)].filter(Boolean).map((n) => n.toLowerCase());
    const fn = String(file.name || "").toLowerCase(), fs = stem(fn);
    let score = 0, why = "";
    if (names.includes(fn)) { score = 100; why = "same name"; }
    else if (names.some((n) => stem(n) === fs && fs)) { score = 60; why = "same name, other type"; }
    else if (names.some((n) => { const a = stem(n); return a.length >= 3 && fs.length >= 3 && (fs.includes(a) || a.includes(fs)); })) { score = 30; why = "similar name"; }
    const sameSize = m.size > 0 && file.size > 0 && m.size === file.size;
    if (sameSize) { score += score ? 50 : 40; why = why ? why + " and size" : "same size"; }
    return { score, why };
  }

  /* An import in the bin (「正在导入… n%」): the copy into the project, then — for the files the server tidies with
     faststart (import-url.js FASTSTART_EXT) — the tidy, which writes about as many bytes again, so each is half. It
     stops at 99 until the file is in the bin. */
  const importTidies = (name) => /\.(mp4|mov|m4v)$/i.test(String(name || ""));
  function importPercent({ sent = 0, tidy = 0, tidies = false } = {}) {
    const f = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
    return Math.min(99, Math.floor(100 * (tidies ? f(sent) / 2 + f(tidy) / 2 : f(sent))));
  }

  return {
    importTidies, importPercent,
    KINDS, INFO_KEYS, SORT_KEYS, MAX_TAGS,
    srcName, relinkScore, kindFromName,
    parseProbe, needsInfo, serverDuration, fitClips, fmtSize, fmtFps, fmtRes, fmtAudio, fmtDur, describe,
    STANDARD_FPS, standardFps, sourceCanvas, canvasFollowsSource,
    normalizeTags, allTags, normalizeCollections,
    placements, usageCounts,
    matchesQuery, matchesFilter, sortValue, sortMedia, query,
  };
});
