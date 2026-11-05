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
  /** A failure (JJ v2, 2026-11-04, section 1, rule 2): what went wrong and what to try, in plain words — never the
   *  raw error. With an error, the sentence ends at 〔复制问题信息〕 (the page's button copies it for us, scrubbed by
   *  problem-details.js; the log keeps all of it); without one, at what to try. → {text, problem} */
  function failure(head, tryThis, error, code) {
    const raw = error == null ? "" : String(error).trim();
    return raw ? { text: head + tryThis + "；还不行，点「复制问题信息」发给我们。", problem: { code: code || "UNKNOWN", error: raw } }
      : { text: head + tryThis + "。", problem: null };
  }
  /** The copy button's words: JJ v2, finalised (the same as the editor's, ui-preferences.js). */
  const COPY = {
    button: "复制问题信息", note: "复制的内容不含你的文件夹路径、密钥和观众信息。",
    done: "已经复制好了，粘贴到发给我们的消息里就行。", failed: "这次没能复制，再点一次按钮试试。",
  };
  const FAILED = {
    // the sentences with 〔复制问题信息〕 are drafts (before v2 they ended with the raw error on a small line)
    load: (e, code) => failure("MontClip 没能读取项目。", "关掉这页再打开试试", e, code),
    // JJ, final (2026-11-04): the sentence reads on from "may have been deleted"
    openTask: (e, code) => {
      const raw = e == null ? "" : String(e).trim();
      return raw ? { text: "没能打开这个任务，它可能已经被删掉了。如果没删，点「复制问题信息」发给我们。", problem: { code: code || "UNKNOWN", error: raw } }
        : { text: "没能打开这个任务。这个任务可能已经删掉了。", problem: null };
    },
    openFolder: (e, code) => failure("没能打开导出文件夹。", "再点一次试试", e, code),   // waiting for JJ
  };
  return { projectRows, exportRows, size, exportsWhere, failure, COPY, FAILED };
});
