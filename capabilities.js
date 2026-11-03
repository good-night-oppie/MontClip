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
    fablecut_import_media: ["external", "导入本机文件，或从网址下载素材", "Import a local file, or download media from a web address"],
    fablecut_encode_profiles: ["read", "查看导出设置", "List the export settings"],
    fablecut_normalize_audio: ["undoable", "把几段的音量调得一样大", "Make several clips equally loud"],
    fablecut_auto_duck: ["undoable", "有人说话时自动压低音乐", "Lower the music while someone speaks"],
    fablecut_silence: ["undoable", "找出并剪掉说话里的停顿", "Find and cut the pauses in speech"],
    fablecut_beats: ["undoable", "找出音乐的节拍，按拍子剪", "Find the music's beat and cut on it"],
    fablecut_reframe: ["undoable", "做一份竖屏或方形的版本，画面跟着人走", "Make a vertical or square version where the picture follows the person"],
    fablecut_highlights: ["undoable", "从长录像里挑精彩片段，剪成一个新序列", "Cut the best moments of long footage into a new sequence"],
    fablecut_songs: ["undoable", "找出录像里每首歌从哪开始、到哪结束，标出估的地方", "Find where each song in a recording starts and ends, marking the guessed spots"],
    fablecut_transcribe: ["undoable", "把说话听写成带时间的文字，可按文字剪", "Turn speech into timed words; cut by text"],
    fablecut_captions: ["sensitive", "加字幕、导入字幕，或把字幕导出成文件", "Add or import captions, or export them as a file"],
    fablecut_denoise: ["undoable", "降低片段的背景噪音", "Reduce background noise on clips"],
    fablecut_projects: ["sensitive", "新建、打开、归档或删除项目", "Create, open, archive or delete projects"],
    fablecut_versions: ["sensitive", "保存、比较、恢复或删除项目版本", "Save, compare, restore or delete project versions"],
    fablecut_proxy: ["undoable", "做或删掉预览用的小文件，让预览更流畅", "Make or delete small preview files so the preview plays smoothly"],
    fablecut_export: ["sensitive", "把时间线导出成视频文件", "Export the timeline to a video file"],
    fablecut_scopes: ["read", "测量画面的亮度和色彩", "Measure the picture's levels and colour"],
    fablecut_track: ["undoable", "跟着画面里的人或物体动，让马赛克、贴纸也跟着它走", "Follow a person or thing in the picture, so a mosaic or sticker moves with it"],
  };
  const freeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) freeze(v); } return o; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const table = new Map();
  for (const t of TOOLS) if (SPEC[t.name]) table.set(t.name, { source: "mcp", schema: clone(t.inputSchema) });
  for (const [name, schema] of Object.entries(PROPOSALS)) table.set(name, { source: "proposal", schema: clone(schema) });
  for (const [name, entry] of table) {
    const [risk, zh, en] = SPEC[name];
    table.set(name, freeze({ name, source: entry.source, risk, summary: { "zh-CN": zh, en }, schema: entry.schema }));
  }
  const get = (name) => (typeof name === "string" && table.has(name) ? table.get(name) : null);
  const riskOf = (name) => (get(name) ? get(name).risk : "blocked");
  const list = () => [...table.values()];
  /** What the approval box and the plan list show for a capability (JJ, 2026-11-03): its plain sentence in the interface
   *  language (English for any other), never its internal name — also for a name the table does not have. */
  const UNKNOWN = Object.freeze({ "zh-CN": "一项不认识的操作，已拦下", en: "An unknown action, blocked" });
  const label = (name, language) => { const c = get(name), l = language === "zh-CN" ? "zh-CN" : "en"; return c ? c.summary[l] : UNKNOWN[l]; };
  return Object.freeze({ RISKS, BLOCKED, get, riskOf, list, label });
});
