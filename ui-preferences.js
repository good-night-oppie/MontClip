/* View preferences only: no project, history, media or network ownership. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "montclip-view-v1";
  const text = {
    "zh-CN": { simple: "简单", advanced: "高级", language: "界面语言", undo: "撤销", redo: "重做", assistant: "助手", close: "收起", unavailable: "尚未连接 AI 服务。手动剪辑不受影响。", pending: "AI 服务接入尚未完成，当前不会发送任何内容。", mode: "编辑模式" },
    en: { simple: "Simple", advanced: "Advanced", language: "Interface language", undo: "Undo", redo: "Redo", assistant: "Assistant", close: "Hide", unavailable: "No AI service connected. Manual editing is available.", pending: "AI service integration is not ready. Nothing is sent.", mode: "Editing mode" },
  };
  // H.264 export (Settings): the bundled LGPL FFmpeg has no libx264; a user may pick their own FFmpeg.
  Object.assign(text["zh-CN"], {
    h264Title: "H.264 导出",
    h264Using: "现在用：{encoder}。",
    h264None: "这台电脑上没有可用的 H.264 编码器。",
    h264External: "已使用你选的本机 FFmpeg（libx264）：{path}",
    h264ExternalFailed: "你选的本机 FFmpeg 不能用，已改回内置编码：{reason}",
    h264Hint: "想要更好的画质，可以选择你电脑上带 libx264 的 FFmpeg。它只用于导出 H.264，预览和其他导出仍用内置的 FFmpeg。不会联网下载，也不会自动查找。",
    h264Choose: "选择本机 FFmpeg…",
    h264Clear: "不再使用",
  });
  Object.assign(text.en, {
    h264Title: "H.264 export",
    h264Using: "Now using: {encoder}.",
    h264None: "This computer has no H.264 encoder MontClip can use.",
    h264External: "Using the FFmpeg you chose (libx264): {path}",
    h264ExternalFailed: "The FFmpeg you chose cannot be used, so the built-in encoders are used instead: {reason}",
    h264Hint: "For better quality you can choose an FFmpeg on this computer that has libx264. It is used only for H.264 export; preview and other exports keep the built-in FFmpeg. Nothing is downloaded and nothing is searched for.",
    h264Choose: "Choose local FFmpeg…",
    h264Clear: "Stop using it",
  });
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
  function desktopStorage(bridge) {
    return { getItem() { const r=bridge.get(); if(!r?.ok) throw Error('View settings unavailable'); return JSON.stringify(r.value); },
      setItem(_key, raw) { if(!bridge.set(JSON.parse(raw))?.ok) throw Error('View settings not saved'); } };
  }
  return { create, desktopStorage, text, KEY };
});
