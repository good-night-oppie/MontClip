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
  text["zh-CN"].modeHelp = "简单模式保留常用操作；需要更多工具和快捷键时，可切到高级模式。";
  text.en.modeHelp = "Simple mode keeps the common controls. Switch to Advanced mode for more tools and shortcuts.";
  text["zh-CN"].advancedOnly = "仅高级模式";
  text.en.advancedOnly = "Advanced mode only";
  text["zh-CN"].liftExtractHelp = "删除目标轨道入点到出点之间的内容：分号保留空隙；单引号连同空隙删除";
  text.en.liftExtractHelp = "Lift / Extract IN→OUT on targeted tracks: Lift leaves the gap; Extract closes it";
  return { create, text, KEY, advancedControls, advancedShortcut };
});
