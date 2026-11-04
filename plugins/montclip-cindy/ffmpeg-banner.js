/* The export tool (ffmpeg) banner's words (JJ's final words, 2026-11-04; pure, tested in Node): the progress, and
   why an install failed in words the streamer can act on. Codes come from three places — Cindy's downloader (it
   reports a failed download without a code at 49fbcc4d, so that is DOWNLOAD_FAILED, or CANCELLED when its progress
   said so), the worker's install (its own codes, and Node's errno codes such as ENOSPC or EACCES, passed back in the
   JSON-RPC error's data) and tar's own words when unpacking. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipFfmpegBanner = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const REASONS = {
    checksum: ["SHA256_MISMATCH", "BAD_ARCHIVE"],
    interrupted: ["DOWNLOAD_FAILED"],
    disk: ["ENOSPC", "EDQUOT"],
    permission: ["EACCES", "EPERM"],
    unpack: ["UNPACK_FAILED"],
    cancelled: ["CANCELLED"],
    unsupported: ["UNSUPPORTED_PLATFORM"],
    hostOld: ["HOST_TOO_OLD"],
  };
  /** checksum · interrupted · disk · permission · unpack · cancelled · unsupported · hostOld · other */
  function reasonOf(code, message) {
    const c = String(code || "").toUpperCase();
    for (const [reason, codes] of Object.entries(REASONS)) if (codes.includes(c)) return reason;
    // no code of its own (a generic one, or an older host): what the message says
    const m = String(message || "");
    if (/no space left|ENOSPC/i.test(m)) return "disk";
    if (/permission denied|access is denied|EACCES|EPERM/i.test(m)) return "permission";
    return "other";
  }
  /** About how much to free, rounded up: whole MB under 1 GB, else GB to one place. */
  function aboutSize(b) {
    const mb = Math.max(1, Math.ceil((+b || 0) / 1048576));
    return mb < 1024 ? mb + " MB" : (Math.ceil(b / 107374182.4) / 10).toFixed(1) + " GB";
  }
  const TEXT = {
    zh: {
      first: "导出视频和降噪，要先装一个免费的导出工具 ffmpeg（约 160 MB，只装一次）。",
      firstNote: "从 GitHub（github.com）下载，下载时可能会转到 GitHub 存文件的网站。不会发送你的任何内容。",
      changed: "导出工具的文件被改过，建议重新安装。",
      install: "下载并安装", reinstall: "重新安装", retry: "重试", later: "以后再说",
      queued: "正在准备下载导出工具…",
      downloading: (pct, got, total, speed) => "正在下载导出工具：" + pct + "%（" + got + " / " + total + " MB" + (speed ? "，" + speed + " MB/s" : "") + "）",
      downloadingNoSize: "正在下载导出工具…",
      retrying: "网络断了一下，正在重试…",
      verifying: "下载完了，正在检查文件是不是完整…",
      installing: "正在安装，并检查版本对不对…",
      installed: "导出工具装好了，现在可以导出了。",
      again: "点重试再来一次。",
      checksum: "下载下来的文件不完整，没有安装。",
      interrupted: "下载断了，没下完。检查一下网络。",
      disk: (need) => "磁盘空间不够，删掉一些不要的文件，空出大约 " + need + "。",
      permission: "MontClip 没法往自己的文件夹里写文件，可能被杀毒软件挡住了。",
      permissionAgain: "点重试再来一次；还不行，重启电脑再试。",
      unpack: "解压没成功。",
      other: "没装上。",
      otherAgain: "点重试再来一次；还不行，把下面这行发给我们：",
      cancelled: "下载取消了，没有安装。",
      unsupported: "这台电脑的系统暂时没有对应的导出工具，导出和降噪用不了。",
      hostOld: "Cindy 版本太旧，装不了导出工具。先把 Cindy 更新到最新，再回来点下载。",
    },
    en: {
      first: "To export videos and reduce noise, first install a free export tool, ffmpeg (about 160 MB, once).",
      firstNote: "It downloads from GitHub (github.com) and may be redirected to the site where GitHub stores files. Nothing of yours is sent.",
      changed: "The export tool's files have been changed. Reinstall it.",
      install: "Download and install", reinstall: "Reinstall", retry: "Retry", later: "Not now",
      queued: "Getting ready to download the export tool…",
      downloading: (pct, got, total, speed) => "Downloading the export tool: " + pct + "% (" + got + " / " + total + " MB" + (speed ? ", " + speed + " MB/s" : "") + ")",
      downloadingNoSize: "Downloading the export tool…",
      retrying: "The connection dropped for a moment; trying again…",
      verifying: "Downloaded. Checking that the file is complete…",
      installing: "Installing, and checking it is the right version…",
      installed: "The export tool is installed. You can export now.",
      again: "Click Retry to try again.",
      checksum: "The downloaded file is incomplete, so it wasn't installed.",
      interrupted: "The download stopped before it finished. Check your connection.",
      disk: (need) => "There isn't enough disk space. Delete some files you don't need to free about " + need + ".",
      permission: "MontClip can't write files into its own folder; antivirus software may be blocking it.",
      permissionAgain: "Click Retry to try again; if that doesn't help, restart the computer and try again.",
      unpack: "Unpacking didn't work.",
      other: "It didn't install.",
      otherAgain: "Click Retry to try again; if that doesn't help, send us the line below:",
      cancelled: "The download was cancelled, so nothing was installed.",
      unsupported: "There is no export tool for this computer's system yet, so exporting and noise reduction aren't available.",
      hostOld: "This Cindy is too old to install the export tool. Update Cindy to the latest version, then come back and click download.",
    },
  };
  const t = (lang) => TEXT[lang === "en" ? "en" : "zh"];
  /** The progress line for a download / install phase ("" for one that has none). */
  function progressText(m, lang) {
    const w = t(lang);
    if (m.phase === "queued") return w.queued;
    if (m.phase === "downloading") {
      if (!m.total) return w.downloadingNoSize;
      const mb = (n) => (n / 1048576).toFixed(0);
      return w.downloading(Math.floor((m.loaded / m.total) * 100), mb(m.loaded), mb(m.total), m.speedBps ? (m.speedBps / 1048576).toFixed(1) : "");
    }
    if (m.phase === "retrying") return w.retrying;
    if (m.phase === "verifying") return w.verifying;
    if (m.phase === "installing") return w.installing;
    if (m.phase === "installed") return w.installed;
    return "";
  }
  /** A failed install: {reason, text, detail, button}. `detail` is the raw error for the small line (only where the
   *  sentence points to it); `button` is retry · install (下载并安装) · null (nothing to try again). `need` is the
   *  bytes to free for ENOSPC: the worker works it out from the archive, its unpacked size and the free space. */
  function describe(code, message, opts, lang) {
    const w = t(lang), need = opts && opts.need;
    const reason = reasonOf(code, message);
    const raw = scrub(message);   // the small line: no paths, local ports or pids
    switch (reason) {
      case "checksum": return { reason, text: w.checksum + w.again, detail: "", button: "retry" };
      case "interrupted": return { reason, text: w.interrupted + w.again, detail: "", button: "retry" };
      case "disk": return { reason, text: w.disk(aboutSize(need)) + w.again, detail: "", button: "retry" };
      case "permission": return { reason, text: w.permission + w.permissionAgain, detail: "", button: "retry" };
      case "unpack": return { reason, text: w.unpack + w.again, detail: "", button: "retry" };
      case "cancelled": return { reason, text: w.cancelled, detail: "", button: "install" };
      case "unsupported": return { reason, text: w.unsupported, detail: "", button: null };
      case "hostOld": return { reason, text: w.hostOld, detail: "", button: null };
      default: return raw ? { reason, text: w.other + w.otherAgain, detail: raw, button: "retry" }
        : { reason, text: w.other + w.again, detail: "", button: "retry" };
    }
  }
  /** The raw error for the small line, without what is only this computer's business: paths, local ports, pids (the
   *  same scrub as frame.js's and the export card's). */
  function scrub(raw) {
    return String(raw == null ? "" : raw)
      .replace(/\b[A-Za-z]:[\\/][^\s'"）)]*/g, "…")
      .replace(/(^|[\s('"=])\/(?:[^\s/'"]+\/)+[^\s'"）)]*/g, "$1…")
      .replace(/\b(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+/gi, "…")
      .replace(/\b(pid|port)\b[\s=:#]*\d+/gi, "$1 …")
      .trim().slice(0, 300);
  }
  return { reasonOf, describe, progressText, aboutSize, scrub, TEXT, REASONS };
});
