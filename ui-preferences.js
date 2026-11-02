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
  // The server and the desktop main process send reason codes; these say them (JJ, 2026-11-02).
  Object.assign(text["zh-CN"], {
    h264Title: "H.264 导出",
    h264Using: "现在用：{encoder}。",
    h264None: "这台电脑上没有可用的 H.264 编码器。",
    h264External: "已使用你选的本机 FFmpeg（x264）：{path}",
    h264ExternalFailed: "你选的本机 FFmpeg 不能用，已改回内置编码：{reason}",
    h264Hint: "默认会用你的显卡或 Windows 自带的编码器导出，不用设置也能正常导出。想要画质更好，可以另外选一个你电脑上带 x264 的 FFmpeg：它只用来导出 H.264，预览和其他格式还用内置的。MontClip 不会去网上下载，也不会自己到处找。",
    h264Choose: "选择本机 FFmpeg…",
    h264Clear: "不再使用这个 FFmpeg",
    h264NoneWin: "这台电脑上找不到能用的 H.264 编码器：显卡编码器没有响应，Windows 自带的编码器也用不了。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。",
    h264NoneOther: "这台电脑上找不到能用的 H.264 编码器。你可以在下面选一个带 x264 的 FFmpeg，或者导出时换一种格式。",
    h264NeedFeaturePack: "你的 Windows 好像是不带媒体组件的「N 版」。请在 Windows 设置 › 应用 › 可选功能里安装「媒体功能包」（Media Feature Pack），然后重新打开 MontClip。",
    extNotFullPath: "请选 FFmpeg 程序文件本身（ffmpeg.exe）。",
    extGone: "之前选的 FFmpeg 已经不在原来的位置了。请重新选一次，或者点「不再使用这个 FFmpeg」。",
    extNotFfmpeg: "选的程序打不开，或者它不是 FFmpeg。请重新选。",
    extNoX264: "这个 FFmpeg 里没有 x264，用它导出画质不会更好。可以换一个带 x264 的，或者直接用内置编码。",
    extSettingBad: "之前保存的 FFmpeg 设置读不出来了。请在设置里重新选一次。",
    frameTooSmall: "导出的画面太小（{w}×{h}），这台电脑的显卡编码器处理不了。请把导出尺寸调大一点，或者换一种格式。",
    extNotUsedNote: "这次没用你选的 FFmpeg（{reason}），改用了 {encoder}。",
    ffmpegMissing: "MontClip 自带的 FFmpeg 找不到了，导出和预览用不了。请重新安装 MontClip。",
    // not in JJ's list: for JJ to review
    extNeeded: "这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg。也可以改用导出预设，用显卡或 Windows 自带的编码器。",
    extSaveFailed: "这次的选择没能保存，请再选一次。",
    extRemoveFailed: "没能取消这个 FFmpeg，请再试一次。",
  });
  Object.assign(text.en, {
    h264Title: "H.264 export",
    h264Using: "Now using: {encoder}.",
    h264None: "This computer has no H.264 encoder MontClip can use.",
    h264External: "Using the FFmpeg you chose (x264): {path}",
    h264ExternalFailed: "The FFmpeg you chose cannot be used, so the built-in encoders are used instead: {reason}",
    h264Hint: "By default MontClip exports with your graphics card or Windows' built-in encoder, so export works without any setup. For better quality you can also choose an FFmpeg on this computer that has x264: it is used only for H.264 export, and preview and other formats keep the built-in one. MontClip does not download anything or search for it.",
    h264Choose: "Choose local FFmpeg…",
    h264Clear: "Stop using this FFmpeg",
    h264NoneWin: "This computer has no H.264 encoder MontClip can use: no graphics-card encoder answered, and Windows' built-in encoder is not available. You can choose an FFmpeg with x264 below, or export in another format.",
    h264NoneOther: "This computer has no H.264 encoder MontClip can use. You can choose an FFmpeg with x264 below, or export in another format.",
    h264NeedFeaturePack: " Your Windows looks like an \"N\" edition without media components. Install the Media Feature Pack in Windows Settings › Apps › Optional features, then open MontClip again.",
    extNotFullPath: "Choose the FFmpeg program file itself (ffmpeg.exe).",
    extGone: "The FFmpeg you chose is no longer where it was. Choose it again, or click \"Stop using this FFmpeg\".",
    extNotFfmpeg: "The chosen program could not be started, or it is not FFmpeg. Choose again.",
    extNoX264: "This FFmpeg has no x264, so exporting with it would not improve quality. Choose one with x264, or use the built-in encoders.",
    extSettingBad: "The saved FFmpeg setting could not be read. Choose it again in Settings.",
    frameTooSmall: "The exported picture is too small ({w}×{h}) for this computer's graphics-card encoder. Export a larger size, or choose another format.",
    extNotUsedNote: "The FFmpeg you chose was not used this time ({reason}); {encoder} was used instead.",
    ffmpegMissing: "MontClip's built-in FFmpeg cannot be found, so export and preview are unavailable. Reinstall MontClip.",
    extNeeded: "This export setting uses x264: first choose an FFmpeg with x264 in Settings, or use a delivery preset, which exports with your graphics card or Windows' built-in encoder.",
    extSaveFailed: "The choice could not be saved. Choose again.",
    extRemoveFailed: "The FFmpeg could not be removed. Try again.",
  });
  // encoders by name: plain words in Chinese, the technical names (delivery.js labels) in English
  const ENCODER_NAMES = {
    "zh-CN": { h264_nvenc: "显卡编码（NVIDIA）", h264_mf: "Windows 自带编码", h264_qsv: "显卡编码（Intel）", h264_amf: "显卡编码（AMD）",
      libx264: "你选的 FFmpeg（x264）", h264_videotoolbox: "硬件编码（Apple）" },
    en: { h264_nvenc: "NVIDIA NVENC", h264_mf: "Windows Media Foundation", h264_qsv: "Intel Quick Sync", h264_amf: "AMD AMF",
      libx264: "x264 (your FFmpeg)", h264_videotoolbox: "Apple Silicon VideoToolbox" },
  };
  const lang = (l) => (text[l] ? l : "en");
  function h264Encoder(language, id) { return ENCODER_NAMES[lang(language)][id] || id; }
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  /** A reason code from the server or the desktop main process, in the interface language; null when unknown. */
  function h264Message(language, r) {
    const t = text[lang(language)];
    if (!r || typeof r.code !== "string" || !/^(h264|ext|frame|ffmpeg)[A-Za-z0-9]+$/.test(r.code) || typeof t[r.code] !== "string") return null;
    const p = r.params || {};
    let s = t[r.code];
    if (r.code === "extNotUsedNote") s = fill(s, { reason: (h264Message(language, { code: p.reason }) || "").replace(/[。.]$/, ""), encoder: h264Encoder(language, p.encoder) });
    else s = fill(s, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])));
    if (/^h264None/.test(r.code) && r.featurePack) s += t.h264NeedFeaturePack;
    return s;
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
  return { create, desktopStorage, text, KEY, h264Message, h264Encoder };
});
