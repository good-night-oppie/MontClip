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
    // batch 2: the Transcript panel and the top bar status (JJ to review). Chinese transcripts
    // carry sentence times only, so the Chinese never counts or cuts words.
    "transcribe": ["Transcribe", "听写"],
    "transcribe-selected": ["Transcribe selected ({n})", "听写所选（{n}）"],
    "transcribe-file": ["Transcribe {n} file", "听写 {n} 个文件"],
    "transcribe-files": ["Transcribe {n} files", "听写 {n} 个文件"],
    "found": ["{n} found", "找到 {n} 处"],
    "cut-all": ["Cut all", "全部剪切"],
    "cut-n": ["Cut {n}", "剪切 {n} 处"],
    "copy": ["Copy", "复制"],
    "select-sentences": ["Select sentences", "按句选段"],
    "mapping": ["Mapping", "时间映射"],
    "caption-last": ["Caption last: a cut through a caption doesn't re-time its words, so add captions again after changing the edit.", "字幕最后再加：剪辑穿过字幕时，字幕的时间不会跟着重排，改完剪辑后请重新添加字幕。"],
    "tr-empty": ["Import an SRT subtitle file and the transcript will show here. Chinese transcription on this computer is still in progress.", "先导入 SRT 字幕，这里会显示文稿。本机中文听写还在做。"],
    "tr-missing": ["No transcript yet: {names}", "还没有文稿：{names}"],
    "tr-more": [" +{n} more", " 等 {n} 个"],
    "loading": ["Loading…", "加载中…"],
    "tr-no-words": ["No words in these clips.", "这些片段里没有听写出文字。"],
    "tr-module-missing": ["Transcript module missing — reload the editor.", "文稿模块缺失，请重新加载编辑器。"],
    "tr-downloading-model": ["Downloading the speech model (once)… {pct}%", "正在下载语音模型（只需一次）… {pct}%"],
    "tr-transcribing": ["Transcribing {name}… {pct}%", "正在听写 {name}… {pct}%"],
    "tr-transcribing-of": ["Transcribing {name} ({i} of {n})… {pct}%", "正在听写 {name}（第 {i} 个，共 {n} 个）… {pct}%"],
    "tr-selection": ["{n} words · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    "tr-selection-one": ["1 word · {s} s · “{text}”", "已选 {s} 秒 · “{text}”"],
    "connected": ["local service running", "本机服务正常"],
    "local-session": ["local session only", "仅本地会话"],
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
