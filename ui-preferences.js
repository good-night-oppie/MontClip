/* View preferences only: no project, history, media or network ownership. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./ui-terms"));
  else root.MontClipView = factory(root.MontClipTerms);
})(typeof globalThis !== "undefined" ? globalThis : this, function (terms) {
  "use strict";
  const KEY = "montclip-view-v1";
  const text = {
    "zh-CN": { simple: "简单", advanced: "高级", language: "界面语言", undo: "撤销", redo: "重做", assistant: "助手", close: "收起", unavailable: "尚未连接 AI 服务。手动剪辑不受影响。", pending: "AI 服务接入尚未完成，当前不会发送任何内容。", mode: "编辑模式" },
    en: { simple: "Simple", advanced: "Advanced", language: "Interface language", undo: "Undo", redo: "Redo", assistant: "Assistant", close: "Hide", unavailable: "No AI service connected. Manual editing is available.", pending: "AI service integration is not ready. Nothing is sent.", mode: "Editing mode" },
  };
  // MontClip's own wording for keyed strings the terms SPEC does not cover.
  const own = {
    "needs-server": ["Needs the MontClip server", "需要 MontClip 服务"],
    "add-title": ["+ Title", "+ 标题"],
    "add-adjust": ["+ Adjust", "+ 调节层"],
    "add-adjust-title": ["Add an adjustment layer (grades everything below it)", "添加调节层（调节它下面的所有画面）"],
    "add-import": ["+ Import", "+ 导入"],
    "add-url": ["+ URL", "+ 网址"],
    "import-url-title": ["Download media from an HTTPS URL into the project", "从 HTTPS 网址下载素材到项目"],
    "fit": ["Fit", "适配"],
    "or-click": ["or click", "或点击"],
    "lift-title": ["Lift (;) — remove IN→OUT on targeted tracks, leave the gap", "提起（;）— 删除目标轨道上入点到出点的内容，留下空隙"],
    "extract-title": ["Extract (') — remove IN→OUT on targeted tracks and close the gap", "提取（'）— 删除目标轨道上入点到出点的内容，并补上空隙"],
    "inspector-empty": ["Select a clip to edit its transform, effects & audio.", "选中一个片段以编辑它的画面、特效与音频。"],
    "exporting-pct": ["Exporting… {pct}%", "正在导出… {pct}%"],
    "rendering-pct": ["Rendering… {pct}%", "正在渲染… {pct}%"],
    "encoding": ["Encoding…", "正在编码…"],
    "encoding-pct": ["Encoding… {pct}%", "正在编码… {pct}%"],
    "mixing-audio": ["Mixing audio…", "正在混音…"],
    "finishing": ["Finishing…", "正在收尾…"],
  };
  for (const [k, [en, zh]] of Object.entries((terms && terms.rows) || {})) { text.en["term." + k] = en; text["zh-CN"]["term." + k] = zh; }
  for (const [k, [en, zh]] of Object.entries(own)) { text.en["own." + k] = en; text["zh-CN"]["own." + k] = zh; }
  /** Keyed lookup: the language's string, else the English one, else "" (never the key). */
  function t(language, key, vars) {
    const s = (text[language] && text[language][key]) ?? text.en[key] ?? "";
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  }
  /** Rewrite only elements that carry data-i18n markers; nothing else on the page. */
  const MARKS = [["[data-i18n]", "i18n", null], ["[data-i18n-title]", "i18nTitle", "title"],
    ["[data-i18n-placeholder]", "i18nPlaceholder", "placeholder"], ["[data-i18n-aria-label]", "i18nAriaLabel", "aria-label"]];
  function applyI18n(rootEl, language) {
    for (const [sel, key, attr] of MARKS) for (const el of rootEl.querySelectorAll(sel)) {
      const s = t(language, el.dataset[key]);
      if (!s) continue;
      if (attr) el.setAttribute(attr, s); else el.textContent = s;
    }
    // icon buttons: keep the icon, rewrite the label text after it
    for (const el of rootEl.querySelectorAll("[data-i18n-tail]")) {
      const s = t(language, el.dataset.i18nTail), node = [...el.childNodes].reverse().find(n => n.nodeType === 3 && n.data.trim());
      if (s && node) node.data = (node.data.match(/^\s*/)[0]) + s;
    }
  }
  // FLV import failures (JJ, 2026-11-02): the server sends a reason code, the page says it here.
  // The first three are JJ's wording; flvNeedsConvert, flvUploadFailed and flvComponentMissing are for JJ to review.
  Object.assign(text["zh-CN"], {
    flvTimingUnverified: "这个 FLV 这次没导进来：MontClip 没法确认它的时间是否完整。换一个录完整的文件，或者先把它转成 MP4 再导入。",
    flvNeedsDesktop: "导入 FLV 需要用 MontClip 桌面版打开。",
    flvDiskFull: "电脑空间不够，这个文件没导进来。清理一些空间后再试。",
    flvNeedsConvert: "这个 FLV 这次没导进来：它的编码 MontClip 现在不能直接用。先把它转成 MP4 再导入。",
    flvUploadFailed: "这个 FLV 没导进来：MontClip 处理这个文件时出了问题。再试一次；还不行就先把它转成 MP4 再导入。",
    flvComponentMissing: "MontClip 缺少处理 FLV 的组件，这个文件没导进来。请重新安装 MontClip。",
  });
  Object.assign(text.en, {
    flvTimingUnverified: "This FLV was not imported: MontClip could not confirm its timing is complete. Try a fully recorded file, or convert it to MP4 first.",
    flvNeedsDesktop: "Importing FLV needs the MontClip desktop app.",
    flvDiskFull: "There is not enough space on this computer, so the file was not imported. Free up some space and try again.",
    flvNeedsConvert: "This FLV was not imported: MontClip cannot use its encoding directly yet. Convert it to MP4 first.",
    flvUploadFailed: "This FLV was not imported: something went wrong while MontClip was handling it. Try again; if it still fails, convert it to MP4 first.",
    flvComponentMissing: "MontClip is missing the component that handles FLV, so the file was not imported. Reinstall MontClip.",
  });
  // A readable-range or timestamp problem is "timing unverified": the consent screens are deferred, so
  // nothing here asks for permission the user has nowhere to give. Unknown codes read as a failed import.
  const FLV_REASONS = { FLV_TIMELINE_GAP: "flvTimingUnverified", FLV_READABLE_CONSENT_REQUIRED: "flvTimingUnverified",
    FLV_DISK_FULL: "flvDiskFull", NO_SERVER: "flvNeedsDesktop", FLV_TRANSCODE_REQUIRED: "flvNeedsConvert",
    FLV_STREAMS_UNSUPPORTED: "flvNeedsConvert", FLV_COMPONENT_MISSING: "flvComponentMissing" };
  function flvImportMessage(language, code) {
    const t = text[language] || text.en;
    return t[Object.hasOwn(FLV_REASONS, code) ? FLV_REASONS[code] : "flvUploadFailed"];
  }
  Object.assign(text['zh-CN'], { paneNew:'新建会话', paneSearch:'搜索本项目会话', paneDraft:'输入消息（仅本次打开保留）', paneSend:'发送', paneCancel:'取消', paneConfig:'助手设置', paneModel:'模型', paneNone:'未配置服务', paneWidth:'面板宽度', paneEmpty:'暂无消息。未连接服务，不会发送内容。', paneTools:'暂无工具执行', paneLocal:'会话和草稿仅保留到本次窗口关闭，不会自动附加项目内容。', paneLimit:'会话或输入已达本次窗口上限，请保留当前草稿。', paneSaveFailed:'面板宽度未能记住，下次打开可能恢复默认。' });
  Object.assign(text.en, { paneNew:'New session', paneSearch:'Search project sessions', paneDraft:'Message (kept for this window only)', paneSend:'Send', paneCancel:'Cancel', paneConfig:'Assistant settings', paneModel:'Model', paneNone:'Service not configured', paneWidth:'Pane width', paneEmpty:'No messages. No service is connected; nothing will be sent.', paneTools:'No tool activity', paneLocal:'Sessions and drafts last until this window closes. Project content is not attached automatically.', paneLimit:'Session or input limit reached for this window. Keep your current draft.', paneSaveFailed:'Pane width could not be saved; the next launch may use the default.' });
  Object.assign(text['zh-CN'], { paneProjectRef:'引用项目标识', paneCaptionRef:'引用所选字幕', paneRangeRef:'引用工作区间', paneRemoveRef:'移除引用', paneNoReference:'没有可引用的已识别项目、字幕或有效区间。', paneReferences:'本次明确引用（尚未发送）', paneStale:'引用来自较早版本，请移除后重新选择。' });
  Object.assign(text.en, { paneProjectRef:'Reference project identity', paneCaptionRef:'Reference selected captions', paneRangeRef:'Reference work range', paneRemoveRef:'Remove reference', paneNoReference:'No identified project, selected caption or valid range is available.', paneReferences:'Explicit references (not sent)', paneStale:'References are from an earlier version. Remove and select them again.' });
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
  return { create, desktopStorage, text, KEY, t, applyI18n, flvImportMessage };
});
