/* The main view's rows (pure; tested in Node): projects newest first, each with the task it belongs to, and the
   exported files. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipOverview = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const dur = (s) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
  /** A file size: bytes under 1 KB (in words: 字节), then KB, MB, GB (1024 each; KB whole, MB and GB to one place). */
  function size(b) {
    b = Math.max(0, Math.round(+b || 0));
    if (b < 1024) return b + " 字节";
    if (Math.round(b / 1024) < 1024) return Math.round(b / 1024) + " KB";   // 1048575 bytes is 1.0 MB, not 1024 KB
    if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
    return (b / 1073741824).toFixed(1) + " GB";
  }
  const day = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "");
  function projectRows(overview) {
    return (overview.projects || []).slice().sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")))
      .map((p) => ({ id: p.id, name: p.name || p.id, task: p.task,
        meta: [p.clips != null ? `${p.clips} 段` : "", dur(p.duration), day(p.modified)].filter(Boolean).join(" · "),
        action: p.task ? "open-task" : null }));
  }
  function exportRows(overview) {
    return (overview.exports || []).map((e) => ({ name: e.name, meta: [size(e.bytes || 0), day(e.modified)].filter(Boolean).join(" · ") }));
  }
  return { projectRows, exportRows, size };
});
