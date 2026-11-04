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
  /** Where the exported files are (JJ's words): a sentence, with 打开文件夹 after it; the full path only in that
   *  button's hover text, with the data folder's own separator. */
  function exportsWhere(dataDir) {
    if (!dataDir) return { text: "", path: "" };
    const sep = String(dataDir).includes("\\") ? "\\" : "/";
    return { text: "导出的文件都存在 MontClip 自己的导出文件夹里。在聊天里让 AI 导出时，会先请你选一个文件夹，再另存一份到那里。",
      path: String(dataDir).replace(/[\\/]+$/, "") + sep + "exports" };
  }
  /** A failure in JJ's words: what went wrong and what to try; with an error, "还不行，把下面这行发给我们：" and the
   *  error on a small line of its own; without one, the sentence ends at what to try. */
  /** The raw error for the small line, without what is only this computer's business: paths, local ports, pids
   *  (the same as main.js's scrub, which the export card uses). */
  function scrub(raw) {
    return String(raw == null ? "" : raw)
      .replace(/\b[A-Za-z]:[\\/][^\s'"）)]*/g, "…")
      .replace(/(^|[\s('"=])\/(?:[^\s/'"]+\/)+[^\s'"）)]*/g, "$1…")
      .replace(/\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+/gi, "…")
      .replace(/\b(pid|port)\b[\s=:#]*\d+/gi, "$1 …")
      .trim().slice(0, 300);
  }
  function failure(head, tryThis, error) {
    const raw = scrub(error);
    return raw ? { text: head + tryThis + "；还不行，把下面这行发给我们：", detail: raw } : { text: head + tryThis + "。", detail: "" };
  }
  const FAILED = {
    load: (e) => failure("MontClip 没能读取项目。", "关掉这页再打开试试", e),
    openTask: (e) => failure("没能打开这个任务。", "这个任务可能已经删掉了", e),
    openFolder: (e) => failure("没能打开导出文件夹。", "再点一次试试", e),   // waiting for JJ
  };
  return { projectRows, exportRows, size, exportsWhere, failure, scrub, FAILED };
});
