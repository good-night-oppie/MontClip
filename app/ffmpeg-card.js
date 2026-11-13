/* The "FFmpeg not found" card (JJ P1, 2026-11-04): its text and its controls come from one model, so every 「X」 the text
   tells the user to click is a control in the same card. One state for the desktop app, web / server mode and the Cindy
   plugin (GET /api/ffmpeg); only the controls differ by platform and by whether a file dialog exists (`picker`).
   No automatic download, no configuration files, no variables in anything the user reads. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipFfmpegCard = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // zh-CN: JJ, final, word for word — the Linux card and result lines (2026-11-04), the 「还不能导出 MP4」 card, the
  // Windows card, the path box, the Export tooltips and the macOS card (2026-11-05). The Linux body is JJ's sentence in
  // two parts (notFound + install). The Windows / macOS cards name buttons 〔…〕 (JJ); the Linux lines keep JJ's 「」.
  // en: only the 「还不能导出 MP4」 title and body are final; the rest is a DRAFT for JJ.
  const text = {
    "zh-CN": {
      title: "还差一个剪辑工具",
      notFound: "预览和导出视频要用到免费工具 FFmpeg，这台电脑上还没找到它。",
      install: "打开终端运行下面这行，装好后点「重新检测」：",
      copy: "复制",
      detect: "重新检测",
      chooseLinux: "我装在别处了，手动选择",
      found: "找到了，现在可以预览和导出了。",
      stillMissingLinux: "还是没找到。如果装在别处，点『手动选择』告诉我它在哪。",
      notFfmpeg: "这个文件不是 FFmpeg。请选名字叫 ffmpeg 的那个文件。",
      noProbe: "FFmpeg 找到了，但还缺它自带的 ffprobe。一般重新安装 FFmpeg 就会一起装上。",
      bodyWin: "预览和导出视频要用到免费工具 FFmpeg，这台电脑上还没找到它。如果已经装好了，点〔选择 ffmpeg.exe〕，选中它就行。",
      chooseWin: "选择 ffmpeg.exe",
      stillMissingWin: "还是没找到。如果装在别的地方，点〔选择 ffmpeg.exe〕，选中它就行。",
      installMac: "打开「终端」，粘贴下面这一行，按回车。装好后回到这里点〔重新检测〕。",
      // 「还不能导出 MP4」: JJ, final (2026-11-05, via Deja) — title, body and the Linux line, word for word
      noH264Title: "还不能导出 MP4",
      noH264: "这台电脑上的 FFmpeg 少了导出 MP4 要用的部分（H.264 编码）。片段照常能浏览、能标，导出要换一个完整版的 FFmpeg。",
      noH264Linux: "打开终端运行 `sudo apt install ffmpeg`，装好后点「重新检测」。",
      noH264Result: "这台电脑上的 FFmpeg 少了导出 MP4 要用的部分（H.264 编码）。",
      noH264Win: "点〔选择 ffmpeg.exe〕，选一个完整版的 FFmpeg。",   // only 「」→〔〕 changed (JJ's rule); its wording is not one JJ listed
      unavailableH264: "现在还不能导出 MP4：这台电脑上的 FFmpeg 做不了 MP4（缺 H.264 编码）。",
      // JJ, final (2026-11-05): advanced mode, beside each MP4 (H.264) choice in the export dialog
      h264Option: "这台电脑上的 FFmpeg 做不了 MP4（缺 H.264 编码）。",
      // DRAFT for JJ: no bundled build, and the FFmpeg found is too old to run what MontClip uses
      tooOldTitle: "这个 FFmpeg 太旧了",
      // DRAFT for JJ, the too old card (Deja 2026-11-05): the reason first — the version found and the 6.0 needed, or the missing options
      tooOldVersion: "预览和导出要用到 FFmpeg。这台电脑上找到的是 {v} 版，太旧了：MontClip 需要 {min} 或更新的版本。",
      tooOldOptions: "预览和导出要用到 FFmpeg。这台电脑上找到的那个缺 MontClip 要用的功能（测响度、找歌），用不了。",
      tooOldLinux: "请装一个新一点的完整版 FFmpeg，装好后点〔重新检测〕；如果装在别的地方，点〔我装在别处了，手动选择〕。",
      tooOldWin: "请换一个新一点的完整版 FFmpeg，点〔选择 ffmpeg.exe〕，选中它就行。",
      pathLabel: "FFmpeg 放在哪（完整路径）",
      pathUse: "用这个",
      unavailable: "现在还不能导出：缺少 FFmpeg。",
    },
    en: {
      // DRAFT for JJ — everything here except noH264Title / noH264 (JJ, final 2026-11-05)
      title: "One editing tool is missing",
      notFound: "Previewing and exporting video need FFmpeg, a free tool, and it isn't on this computer yet.",
      install: "Open a terminal, run the line below, then click “Check again”:",
      copy: "Copy",
      detect: "Check again",
      chooseLinux: "It's installed elsewhere — choose it",
      found: "Found it. You can preview and export now.",
      stillMissingLinux: "Still not found. If it's installed elsewhere, click “choose it” and show me where.",
      notFfmpeg: "This file isn't FFmpeg. Choose the file named ffmpeg.",
      noProbe: "FFmpeg was found, but its ffprobe is missing. Reinstalling FFmpeg usually brings it back.",
      bodyWin: "Previewing and exporting video need FFmpeg, a free tool, and it isn't on this computer yet. If it's already installed, click “Choose ffmpeg.exe” and select it.",
      chooseWin: "Choose ffmpeg.exe",
      stillMissingWin: "Still not found. If it's installed somewhere else, click “Choose ffmpeg.exe” and select it.",
      installMac: "Open “Terminal”, paste the line below and press Return. When it's done, come back here and click “Check again”.",
      noH264Title: "Can't export MP4 yet",
      noH264: "The FFmpeg on this computer can't make MP4 files (it's missing H.264 encoding). You can still browse and mark clips. To export, switch to a full version of FFmpeg.",
      noH264Linux: "Open a terminal and run `sudo apt install ffmpeg`, then click “Check again”.",
      noH264Result: "The FFmpeg on this computer can't make MP4 files (it's missing H.264 encoding).",
      noH264Win: "Click “Choose ffmpeg.exe” and pick a full version of FFmpeg.",
      unavailableH264: "Can't export MP4 yet: the FFmpeg on this computer can't make MP4 files (it's missing H.264 encoding).",
      h264Option: "The FFmpeg on this computer can't make MP4 (missing H.264 encoding).",   // JJ, final
      tooOldTitle: "This FFmpeg is too old",
      tooOldVersion: "Previewing and exporting need FFmpeg. The one on this computer is version {v}, which is too old: MontClip needs {min} or newer.",
      tooOldOptions: "Previewing and exporting need FFmpeg. The one on this computer lacks features MontClip uses (measuring loudness, finding songs).",
      tooOldLinux: "Install a newer full version of FFmpeg, then click “Check again”; if it's somewhere else, click “It's installed elsewhere — choose it”.",
      tooOldWin: "Get a newer full version of FFmpeg, then click “Choose ffmpeg.exe” and select it.",
      pathLabel: "Where FFmpeg is (full path)",
      pathUse: "Use this",
      unavailable: "Can't export yet: FFmpeg is missing.",
    },
  };
  const COMMANDS = { linux: "sudo apt install ffmpeg", darwin: "brew install ffmpeg" };
  const MIN_VERSION = "6.0";   // ffmpeg-path.js MIN_VERSION: the oldest FFmpeg MontClip can use when it has no bundled build
  const lang = (l) => (text[l] ? l : "en");

  /** What was found → ready · missing (no ffmpeg) · noProbe (ffmpeg without ffprobe) · noH264 (no MP4 export).
      The server also says tooOld: no bundled build, and the FFmpeg found fails the gate (ffmpeg-path.js). */
  function state({ ffmpeg, ffprobe, h264 }) {
    if (!ffmpeg) return "missing";
    if (!ffprobe) return "noProbe";
    return h264 ? "ready" : "noH264";
  }
  /** Result lines after 「重新检测」 / a choice, in this platform's words. English quotes use “…”; the test reads 「」『』. */
  function results(language, platform = "linux") {
    const t = text[lang(language)], win = platform === "win32";
    return { found: t.found, stillMissing: win ? t.stillMissingWin : t.stillMissingLinux, notFfmpeg: t.notFfmpeg,
      noProbe: t.noProbe, noH264: t.noH264Result };
  }
  /** The card for a status ({state, platform, picker}); null when ready (no notice at all). */
  function model(status, language) {
    if (!status || status.state === "ready") return null;
    const t = text[lang(language)], platform = status.platform, win = platform === "win32";
    const command = win ? null : COMMANDS[platform] || COMMANDS.linux;
    const choose = { id: "choose", label: win ? t.chooseWin : t.chooseLinux };
    const detect = { id: "detect", label: t.detect };
    const sp = lang(language) === "en" ? " " : "";
    let title = t.title, body, howto = null;
    // 「还不能导出 MP4」: the command sits inside JJ's sentence (`…`); the page shows it as code with 〔复制〕 after it
    // macOS (JJ, 2026-11-05): the sentence above the command box, the command in the box with 〔复制〕 beside it
    const mac = platform === "darwin", install = mac ? t.installMac : t.install;
    if (status.state === "tooOld") {
      const f = status.ffmpeg || {}, why = f.why === "version" && f.version
        ? t.tooOldVersion.replace("{v}", f.version).replace("{min}", MIN_VERSION) : t.tooOldOptions;
      title = t.tooOldTitle; body = why + sp + (win ? t.tooOldWin : t.tooOldLinux);
    }
    else if (status.state === "noH264") { title = t.noH264Title; body = t.noH264; howto = win ? t.noH264Win : mac ? t.installMac : t.noH264Linux; }
    else if (status.state === "noProbe") body = win ? t.noProbe : t.noProbe + sp + install;
    else body = win ? t.bodyWin : t.notFound + sp + install;
    return {
      state: status.state, title, body, howto, command, copy: command ? t.copy : null,
      buttons: win ? [choose, detect] : [detect, choose],
      // no file dialog here (web / server, a plugin host without one): 「手动选择」 opens a path box instead
      input: status.picker ? null : { label: t.pathLabel, placeholder: win ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "/usr/bin/ffmpeg", button: t.pathUse },
      status: null,
    };
  }
  /* JJ (2026-11-05), by interface mode: with no H.264, simple mode greys the whole Export button; advanced mode keeps it
     and disables only the MP4 (H.264) choices, each with h264Option beside it, so Archive still exports. With no
     FFmpeg at all (missing · noProbe · tooOld) nothing exports, in either mode. */
  function exportButton(status, mode, language) {
    const t = text[lang(language)], st = status && status.state;
    if (st === "missing" || st === "noProbe" || st === "tooOld") return { disabled: true, title: t.unavailable };
    if (st === "noH264" && mode !== "advanced") return { disabled: true, title: t.unavailableH264 };
    return { disabled: false, title: null };
  }
  function exportOption(status, mode, isH264, language) {
    return status && status.state === "noH264" && mode === "advanced" && isH264
      ? { disabled: true, note: text[lang(language)].h264Option } : { disabled: false, note: null };
  }
  return { text, state, model, results, COMMANDS, exportButton, exportOption };
});
