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
  const flv = {
    FLV_TRANSCODE_REQUIRED: ["这个 FLV 要先转一份兼容的 MP4 副本才能预览，可能改变画质，需要等一会儿。原片保持不变；取消就不导入这个文件。", "This FLV must first be converted to a compatible MP4 copy before it can be previewed; quality may change and it takes a while. The original stays unchanged. Cancel to skip importing this file."],
    FLV_PROBE_FAILED: ["读不了这个 FLV，可能还没录完或文件已损坏。原片未改动。", "This FLV could not be read. It may still be recording or may be damaged. The original is unchanged."],
    FLV_STREAMS_UNSUPPORTED: ["这个 FLV 的轨道组合暂不支持（例如多音轨）。原片未改动。", "This FLV track combination is not supported yet (for example, multiple audio tracks). The original is unchanged."],
    FLV_PREPARATION_FAILED: ["没能生成兼容副本，原片未改动。请再试一次。", "The compatible copy could not be created. The original is unchanged. Please try again."],
    FLV_COMPONENT_MISSING: ["程序缺少导入所需的组件。请重新解压完整的 MontClip 程序后再试，原片未改动。", "A component needed for import is missing. Extract the full MontClip app again and retry. The original is unchanged."],
    FLV_DISK_FULL: ["存储空间不足，没能完成导入。请腾出空间后重试，原片未改动。", "There is not enough storage space to finish importing. Free some space and retry. The original is unchanged."],
    FLV_SERVICE_UNAVAILABLE: ["无法连接编辑服务，本次导入未完成。请保留当前项目，恢复连接后重试。", "The editing service is unavailable; this import did not finish. Keep the current project and retry after reconnecting."],
    FLV_OPEN_FULL_APP: ["这种打开方式不能导入 FLV，请用完整的 MontClip 程序打开。", "FLV can't be imported this way; please open it in the full MontClip app."],
    FLV_PREVIEW_FAILED: ["兼容副本无法预览，未加入项目。原片未改动。", "The compatible copy cannot be previewed and was not added to the project. The original is unchanged."],
    UNKNOWN: ["没能完成这个 FLV 的导入，原片未改动。请再试一次。", "This FLV could not be imported. The original is unchanged. Please try again."],
  };
  function flvMessage(code, language) { return (Object.hasOwn(flv, code) ? flv[code] : flv.UNKNOWN)[language === "en" ? 1 : 0]; }
  // Copy selection only; not an authentication or feature-permission check.
  function flvDisconnectedCode({desktop, everConnected}) { return desktop || everConnected ? "FLV_SERVICE_UNAVAILABLE" : "FLV_OPEN_FULL_APP"; }
  return { create, text, KEY, flvMessage, flvDisconnectedCode };
});
