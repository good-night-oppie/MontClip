/* The capability table (Deja, 2026-11-03; docs/decisions/2026-11-03-unified-backend-architecture.md): what the buttons, the
   AI and MCP may do, in one list. Each capability has an input schema, a risk level and one plain sentence.
   Risk levels are fixed here; the desktop main process holds this table and gives the page a read-only copy, so neither
   the page nor the AI can change them. A tool that can do several things takes the risk of the riskiest one.
     read      — only looks (the project, a frame, a measurement)
     undoable  — changes the project; one step in its undo history
     sensitive — writes, deletes or replaces files, or switches what is open: cannot be taken back by Undo
     external  — sends something to, or fetches from, the network
   Names not in the table are blocked. BLOCKED lists what no mode may ever allow. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./mcp-tools"));
  else root.MontClipCapabilities = factory(root.MontClipMcpTools || []);
})(typeof globalThis !== "undefined" ? globalThis : this, function (TOOLS) {
  "use strict";
  const RISKS = Object.freeze(["read", "undoable", "sensitive", "external"]);
  const BLOCKED = Object.freeze(["delete_or_rewrite_source", "send_outside_allowlist", "write_outside_workspace", "overwrite_existing_file"]);
  const range = { type: "object", additionalProperties: false, required: ["clipId", "from", "to"], properties: {
    clipId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,128}$" }, from: { type: "number", minimum: 0 }, to: { type: "number" },
    label: { type: "string", minLength: 1, maxLength: 80 } } };
  const PROPOSALS = {
    keep_ranges: { type: "object", additionalProperties: false, required: ["type", "output_mode", "ranges"], properties: {
      type: { const: "keep_ranges" }, output_mode: { enum: ["one_file", "per_range"] },
      ranges: { type: "array", minItems: 1, maxItems: 100, items: range } } },
    keep_sentences: { type: "object", additionalProperties: false, required: ["type", "ranges"], properties: {
      type: { const: "keep_sentences" },
      ranges: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: false,
        required: ["clipId", "sourceCaptionId", "from", "to"], properties: { clipId: { type: "string" }, sourceCaptionId: { type: "string" },
          from: { type: "number", minimum: 0 }, to: { type: "number" } } } } } },
  };
  // name: [risk, 中文, English]
  const SPEC = {
    keep_ranges: ["undoable", "按时间保留几段录像，拼成一条或各成一条切片", "Keep parts of the recording by time, joined or as separate clips"],
    keep_sentences: ["undoable", "只保留选中的几句字幕对应的片段", "Keep only the parts with the chosen subtitle sentences"],
    fablecut_status: ["read", "看编辑器是否在运行、项目概况", "See whether the editor runs and what the project holds"],
    fablecut_docs: ["read", "读使用说明", "Read the manual"],
    fablecut_get_project: ["read", "读当前项目", "Read the open project"],
    fablecut_patch_project: ["undoable", "按步骤修改当前项目", "Change the open project step by step"],
    fablecut_set_project: ["undoable", "整份替换当前项目（先存一个版本）", "Replace the open project as a whole (a version is kept first)"],
    fablecut_frame: ["read", "看某一时刻的画面", "Look at the picture at a moment"],
    fablecut_analyze_reference: ["undoable", "分析参考视频的节奏，并把它的音乐加进素材", "Analyse a reference video's pace and add its music to the media"],
    // undoable for a file on this computer; a web address is blocked (riskOf reads the arguments, Deja on #83)
    fablecut_import_media: ["undoable", "从这台电脑导入素材文件", "Import a media file from this computer"],
    fablecut_encode_profiles: ["read", "查看导出设置", "List the export settings"],
    fablecut_normalize_audio: ["undoable", "把几段的音量调得一样大", "Make several clips equally loud"],
    fablecut_auto_duck: ["undoable", "有人说话时自动压低音乐", "Lower the music while someone speaks"],
    fablecut_silence: ["undoable", "找出并剪掉说话里的停顿", "Find and cut the pauses in speech"],
    fablecut_beats: ["undoable", "找出音乐的节拍，按拍子剪", "Find the music's beat and cut on it"],
    fablecut_reframe: ["undoable", "做一份竖屏或方形的版本，画面跟着人走", "Make a vertical or square version where the picture follows the person"],
    fablecut_highlights: ["undoable", "从长录像里挑精彩片段，剪成一个新序列", "Cut the best moments of long footage into a new sequence"],
    fablecut_danmaku: ["undoable", "给一场录像导入录播姬或 B 站的弹幕文件，也可以移除已经导入的弹幕", "Import BililiveRecorder or Bilibili danmaku for a recording, or remove them"],
    fablecut_songs: ["undoable","找出录像里可能在唱歌的段落，标出估的地方", "Find the parts of a recording that are possibly singing, marking the guessed spots"],
    fablecut_transcribe: ["undoable", "把说话听写成带时间的文字，可按文字剪", "Turn speech into timed words; cut by text"],
    fablecut_captions: ["sensitive", "加字幕、导入字幕，或把字幕导出成文件", "Add or import captions, or export them as a file"],
    fablecut_denoise: ["undoable", "降低片段的背景噪音", "Reduce background noise on clips"],
    fablecut_repair_media: ["undoable", "把没录完整或剪不了的视频修成可以剪的 MP4，原文件不动", "Repair or convert a video into an MP4 you can cut; the original stays as it is"],
    fablecut_projects: ["sensitive", "新建、打开、归档或删除项目", "Create, open, archive or delete projects"],
    fablecut_versions: ["sensitive", "保存、比较、恢复或删除项目版本", "Save, compare, restore or delete project versions"],
    fablecut_proxy: ["undoable", "做或删掉预览用的小文件，让预览更流畅", "Make or delete small preview files so the preview plays smoothly"],
    fablecut_export: ["sensitive", "把时间线导出成视频文件", "Export the timeline to a video file"],
    fablecut_scopes: ["read", "测量画面的亮度和色彩", "Measure the picture's levels and colour"],
    // the sends the host makes itself (not MCP tools); P4: each external capability carries its caps (LIMITS below)
    assistant_request: ["external", "把聊天消息发给 AI 服务", "Send the chat to the AI service"],
    song_lookup: ["external", "按歌词联网查歌名（只发两三句歌词）", "Look up the song's name online from two or three lyric lines"],
    cloud_transcribe: ["external", "把录音分段发到云端听写", "Send the recording in parts to a cloud service to transcribe"],
    // the 「自动出切片」 card edits (the owner / Deja, 2026-11-03): the streamer's buttons and the AI, the same capabilities
    set_segment_kind: ["undoable", "改一张候选卡的类型：唱歌、互动、聊天、整活、普通高光或其他", "Change a candidate card's kind: singing, interaction, chat, stunt, highlight or other"],
    add_segment: ["undoable", "用 IN–OUT 补一张候选卡，带上类型", "Add a candidate card from IN–OUT, with its kind"],
    fablecut_blur_region: ["undoable", "给画面里的一块打码，片段放大、移动时码会跟着走", "Hide an area of the picture with a solid black block that follows the clip when it zooms or moves"],
    fablecut_track: ["undoable", "跟着画面里的人或物体动，让马赛克、贴纸也跟着它走", "Follow a person or thing in the picture, so a mosaic or sticker moves with it"],
  };
  // External caps (Deja, 2026-11-03, on #83): per capability, fixed here with the risk levels, in bytes. perSend is one send
  // (for audio: one part); perScope is everything sent in one scope — a chat, or a project while it is open. Over either cap
  // a send is refused, saying by how much; it is never cut down to fit. cloud_transcribe's caps hold its place: not wired yet.
  const TEXT = { kind: "text", perSend: 131072, perScope: 4194304, scope: "chat" };
  const AUDIO = { kind: "audio", perSend: 26214400, perScope: 2147483648, scope: "project-open" };
  const LIMITS = { assistant_request: TEXT, song_lookup: TEXT, cloud_transcribe: AUDIO };
  const HOST = ["assistant_request", "song_lookup", "cloud_transcribe"];
  // What the facts block of an assistant_request may carry about the sound (JJ via Deja, 2026-11-05; QQ's five on #169):
  // numbers only, never the sound, a file name or a path. singingParts — parts that may be singing ({clipId, from, to},
  // seconds); loudnessValues — whole numbers 0–100, one a second, one every few seconds when the clips together are longer
  // than 2400 s: 40 min one a second, 2 h one every 3 s, 4 h one every 6 s, 8 h one every 12 s. Whole numbers at most
  // one a second say how loud a stretch is, not what it sounds like: no waveform can be rebuilt from them.
  // loudnessSeconds — the longest the clips may be together (8 h); longer, neither is attached that time and the review box
  // says so (JJ定稿, 2026-11-05). Over the other caps the send is refused (FACTS_LIMIT). Never cut down. 2400 values, not 7200: a message is at most 16000 characters (the desktop
  // service checks it), and a value takes up to four ("100,").
  const FACTS = { singingParts: 100, loudnessValues: 2400, loudnessSeconds: 28800 };
  const freeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) freeze(v); } return o; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const table = new Map();
  for (const t of TOOLS) if (SPEC[t.name]) table.set(t.name, { source: "mcp", schema: clone(t.inputSchema) });
  for (const [name, schema] of Object.entries(PROPOSALS)) table.set(name, { source: "proposal", schema: clone(schema) });
  // the host's own sends (#83): no arguments of their own
  for (const name of HOST) table.set(name, { source: "host", schema: { type: "object" } });
  // the host's card edits (segment-edits.js, from main), with their argument shapes
  const KIND = { type: "string", enum: ["song", "interaction", "chat", "stunt", "moment", "other"] };
  const HOST_EDITS = {
    set_segment_kind: { type: "object", additionalProperties: false, required: ["id", "kind"],
      properties: { id: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,160}$" }, kind: KIND } },
    add_segment: { type: "object", additionalProperties: false, required: ["mediaId", "from", "to", "kind"],
      properties: { mediaId: { type: "string", pattern: "^[A-Za-z0-9_.-]{1,128}$" }, from: { type: "number", minimum: 0 }, to: { type: "number", minimum: 0 }, kind: KIND } },
  };
  for (const [name, schema] of Object.entries(HOST_EDITS)) table.set(name, { source: "host", schema: clone(schema) });
  for (const [name, entry] of table) {
    const [risk, zh, en] = SPEC[name];
    if (risk === "external" && !LIMITS[name]) throw new Error("capabilities: " + name + " sends out but has no caps");
    table.set(name, freeze({ name, source: entry.source, risk, summary: { "zh-CN": zh, en }, schema: entry.schema, limits: risk === "external" ? { ...LIMITS[name] } : null }));
  }
  const get = (name) => (typeof name === "string" && table.has(name) ? table.get(name) : null);
  /* A capability whose risk depends on what it is asked to do (Deja, 2026-11-03, on #83): fablecut_import_media downloads
     when its path is a web address (any "scheme://"), or reads a network share (\\server or //server) — not among the
     network exceptions the owner approved, so blocked in every mode — and imports a file from this computer otherwise.
     Arguments it cannot read are blocked. */
  const BY_ARGS = {
    fablecut_import_media(args) {
      if (!args || typeof args !== "object" || Array.isArray(args) || "url" in args) return "blocked";
      const p = args.path;
      if (typeof p !== "string" || !p.trim()) return "blocked";
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(p.trim()) || /^(\\\\|\/\/)/.test(p.trim()) ? "blocked" : "undoable";
    },
  };
  /** The risk of a capability (for one that depends on its arguments, of this call); "blocked" for anything else. */
  const riskOf = (name, args) => (!get(name) ? "blocked" : BY_ARGS[name] ? BY_ARGS[name](args) : get(name).risk);
  const list = () => [...table.values()];
  /** An external capability's caps ({kind, perSend, perScope, scope}, frozen); null for any other name. */
  const limits = (name) => (get(name) ? get(name).limits : null);
  /** What the approval box and the plan list show for a capability (JJ, 2026-11-03): its plain sentence in the interface
   *  language (English for any other), never its internal name — also for a name the table does not have. */
  const UNKNOWN = Object.freeze({ "zh-CN": "AI 想做一件软件不认识的操作，已经拦下，什么都没改。", en: "The AI asked for an action MontClip doesn't know. It was blocked; nothing changed." });
  const label = (name, language) => { const c = get(name), l = language === "zh-CN" ? "zh-CN" : "en"; return c ? c.summary[l] : UNKNOWN[l]; };
  return Object.freeze({ RISKS, BLOCKED, FACTS: freeze(FACTS), get, riskOf, list, label, limits });
});
