/* Why ffmpeg did not install, in words the streamer can act on (pure; tested in Node). The raw error never leads: it
   goes on a small line of its own. Codes come from three places — Cindy's downloader (it reports a failed download
   without a code at 49fbcc4d, so that is DOWNLOAD_FAILED here), the worker's install (its own codes, and Node's errno
   codes such as ENOSPC or EACCES, passed back in the JSON-RPC error's data) and tar's own words when unpacking. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipFfmpegFailure = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const REASONS = {
    checksum: ["SHA256_MISMATCH", "CHECKSUM", "SIZE", "BAD_ARCHIVE"],
    interrupted: ["DOWNLOAD_FAILED", "NETWORK", "TIMEOUT", "HTTP_4XX", "HTTP_5XX", "ABORTED", "CANCELLED", "NO_ARCHIVE", "INVALID_REQUEST"],
    disk: ["ENOSPC", "EDQUOT", "DISK"],
    permission: ["EACCES", "EPERM", "EROFS", "PERMISSION_DENIED"],
  };
  /** checksum · interrupted · disk · permission · other */
  function reasonOf(code, message) {
    const c = String(code || "").toUpperCase();
    for (const [reason, codes] of Object.entries(REASONS)) if (codes.includes(c)) return reason;
    const m = String(message || "");
    if (/no space left|ENOSPC|disk (is )?full|磁盘空间|空间不足/i.test(m)) return "disk";
    if (/permission denied|access is denied|EACCES|EPERM|拒绝访问|权限/i.test(m)) return "permission";
    if (/SHA-?256|checksum|校验/i.test(m)) return "checksum";
    if (/下载已取消|下载失败|network|timed? ?out|ECONNRESET|ETIMEDOUT|socket hang up/i.test(m)) return "interrupted";
    return "other";
  }
  /* Drafts in VV's words (2026-11-04), waiting for JJ's final words. */
  const TEXT = {
    zh: {
      checksum: "下载的文件不完整，可能是网络断了一下。",
      interrupted: "下载断了，可能是网络不稳。",
      disk: "电脑上的空间不够了，腾出一些再试。",
      permission: "没有权限往 MontClip 的文件夹里写文件。",
      other: "ffmpeg 没装上。",
      again: "点「重试」再来一次。",
    },
    en: {
      checksum: "The downloaded file is incomplete; the connection may have dropped for a moment.",
      interrupted: "The download stopped; the connection may be unstable.",
      disk: "There isn't enough space on this computer. Free some up and try again.",
      permission: "MontClip isn't allowed to write files into its folder.",
      other: "ffmpeg didn't install.",
      again: "Click Retry to try again.",
    },
  };
  /** {reason, text, detail}: the sentence, then the raw error for its small line ("" when there is none). */
  function describe(code, message, lang) {
    const t = TEXT[lang === "en" ? "en" : "zh"];
    const reason = reasonOf(code, message);
    return { reason, text: t[reason] + t.again, detail: String(message == null ? "" : message).trim() };
  }
  return { reasonOf, describe, TEXT, REASONS };
});
