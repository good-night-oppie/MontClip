/* View preferences only: no project, history, media or network ownership. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "montclip-view-v1";
  const advancedControls = ["btnMarkIn", "btnMarkOut", "btnInsert", "btnReplace", "btnCloseGap", "btnNextGap", "btnLift", "btnExtract", "btnSnap", "btnSnapMenu", "btnMarkers"];
  function advancedShortcut(event) {
    if (event.ctrlKey || event.metaKey) return false;
    if (event.code === "KeyM" && event.shiftKey) return true;
    return !event.altKey && [";", "'", ",", ".", "g", "i", "o", "n", "m"].includes(String(event.key).toLowerCase());
  }
  const text = {
    "zh-CN": { simple: "简单", advanced: "高级", language: "界面语言", undo: "撤销", redo: "重做", assistant: "助手", close: "收起", unavailable: "尚未连接 AI 服务。手动剪辑不受影响。", pending: "AI 服务接入尚未完成，当前不会发送任何内容。", mode: "编辑模式" },
    en: { simple: "Simple", advanced: "Advanced", language: "Interface language", undo: "Undo", redo: "Redo", assistant: "Assistant", close: "Hide", unavailable: "No AI service connected. Manual editing is available.", pending: "AI service integration is not ready. Nothing is sent.", mode: "Editing mode" },
  };
  function create(storage) {
    let saved; try { saved = JSON.parse(storage.getItem(KEY)); } catch {}
    let value = { mode: saved?.mode === "advanced" ? "advanced" : "simple", language: saved?.language === "en" ? "en" : "zh-CN" };
    return {
      get: () => ({ ...value }),
      set(patch) {
        const next = { ...value, ...patch };
        if (!["simple", "advanced"].includes(next.mode) || !text[next.language]) throw new Error("Invalid view preference");
        value = { mode: next.mode, language: next.language };
        try { storage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
      },
    };
  }
  text["zh-CN"].modeHelp = "简单模式停用：IN/OUT、插入/替换、查找/关闭空隙、Lift/Extract、吸附和标记快捷键。切到高级模式可使用。";
  text.en.modeHelp = "Simple mode disables IN/OUT, insert/replace, find/close gap, lift/extract, snapping and marker shortcuts. Switch to Advanced to use them.";
  return { create, text, KEY, advancedControls, advancedShortcut };
});
