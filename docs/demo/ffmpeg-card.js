/* The "FFmpeg not found" card (JJ P1, 2026-11-04): its text and its controls come from one model, so every 「X」 the text
   tells the user to click is a control in the same card. One state for the desktop app, web / server mode and the Cindy
   plugin (GET /api/ffmpeg); only the controls differ by platform and by whether a file dialog exists (`picker`).
   No automatic download, no configuration files, no variables in anything the user reads. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipFfmpegCard = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // zh-CN Linux card and result lines: JJ, final (2026-11-04, via Deja), word for word.
  // Everything marked DRAFT is for JJ to finalise: the English, the Windows card, the macOS command, the no-H.264 lines
  // and the path box. The Linux body is JJ's sentence in two parts (notFound + install), joined word for word.
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
      // DRAFT
      bodyWin: "预览和导出视频要用到免费工具 FFmpeg，这台电脑上还没找到它。如果已经装好，点「选择 ffmpeg.exe」告诉我它在哪。",
      chooseWin: "选择 ffmpeg.exe",
      stillMissingWin: "还是没找到。如果装在别处，点『选择 ffmpeg.exe』告诉我它在哪。",
      // 「还不能导出 MP4」: JJ, final (2026-11-05, via Deja) — title, body and the Linux line, word for word
      noH264Title: "还不能导出 MP4",
      noH264: "这台电脑上的 FFmpeg 少了导出 MP4 要用的部分（H.264 编码）。片段照常能浏览、能标，导出要换一个完整版的 FFmpeg。",
      noH264Linux: "打开终端运行 `sudo apt install ffmpeg`，装好后点「重新检测」。",
      noH264Result: "这台电脑上的 FFmpeg 少了导出 MP4 要用的部分（H.264 编码）。",
      // DRAFT
      noH264Mac: "打开终端运行 `brew install ffmpeg`，装好后点「重新检测」。",
      noH264Win: "点「选择 ffmpeg.exe」，选一个完整版的 FFmpeg。",
      unavailableH264: "现在不能导出 MP4：这台电脑上的 FFmpeg 少了 H.264 编码。",
      pathLabel: "FFmpeg 在哪（完整路径）",
      pathUse: "用这个",
      unavailable: "现在不能导出：还差 FFmpeg。",
    },
    en: {
      // DRAFT (all English)
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
      bodyWin: "Previewing and exporting video need FFmpeg, a free tool, and it isn't on this computer yet. If it's installed, click “Choose ffmpeg.exe” and show me where.",
      chooseWin: "Choose ffmpeg.exe",
      stillMissingWin: "Still not found. If it's installed elsewhere, click “Choose ffmpeg.exe” and show me where.",
      noH264Title: "Can't export MP4 yet",
      noH264: "The FFmpeg on this computer is missing the part MP4 export needs (H.264 encoding). Clips can still be browsed and marked; to export, switch to a full version of FFmpeg.",
      noH264Linux: "Open a terminal and run `sudo apt install ffmpeg`, then click “Check again”.",
      noH264Result: "The FFmpeg on this computer is missing the part MP4 export needs (H.264 encoding).",
      noH264Mac: "Open a terminal and run `brew install ffmpeg`, then click “Check again”.",
      noH264Win: "Click “Choose ffmpeg.exe” and pick a full version of FFmpeg.",
      unavailableH264: "Can't export MP4 now: the FFmpeg on this computer has no H.264 encoding.",
      pathLabel: "Where FFmpeg is (full path)",
      pathUse: "Use this",
      unavailable: "Export is unavailable: FFmpeg is missing.",
    },
  };
  const COMMANDS = { linux: "sudo apt install ffmpeg", darwin: "brew install ffmpeg" };   // darwin: DRAFT
  const lang = (l) => (text[l] ? l : "en");

  /** What was found → ready · missing (no ffmpeg) · noProbe (ffmpeg without ffprobe) · noH264 (no MP4 export). */
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
    if (status.state === "noH264") { title = t.noH264Title; body = t.noH264; howto = win ? t.noH264Win : platform === "darwin" ? t.noH264Mac : t.noH264Linux; }
    else if (status.state === "noProbe") body = win ? t.noProbe : t.noProbe + sp + t.install;
    else body = win ? t.bodyWin : t.notFound + sp + t.install;
    return {
      state: status.state, title, body, howto, command, copy: command ? t.copy : null,
      buttons: win ? [choose, detect] : [detect, choose],
      // no file dialog here (web / server, a plugin host without one): 「手动选择」 opens a path box instead
      input: status.picker ? null : { label: t.pathLabel, placeholder: win ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "/usr/local/bin/ffmpeg", button: t.pathUse },
      status: null,
    };
  }
  return { text, state, model, results, COMMANDS };
});
