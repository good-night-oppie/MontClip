/* What leaves the computer when the streamer presses 〔复制问题信息〕 (JJ v2, 2026-11-04; QQ): a log line with no
 * user folder, no key or token, and no viewer name or uid. One set of rules for Node (the server, external-ffmpeg.js)
 * and the page, so both give the same result for the same home folder. Pure: the home folder and the platform are
 * passed in (Node: os.homedir(), process.platform; the server answers the page with them, POST /api/problem-details). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MontClipRedact = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  /* A path can carry the user's name (C:\Users\<name>\…): it becomes %USERPROFILE% (Windows) or ~. */
  const SHARED_PROFILES = /^(public|default|default user|all users)$/i;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function maskUserPath(s, { home = "", platform = "" } = {}) {
    if (typeof s !== "string") return s;
    let out = s;
    const win = platform === "win32";
    if (home && home.length > 3) {
      const pattern = home.split(/[\\/]/).map(escapeRe).join("[\\\\/]") + "(?=[\\\\/]|$|\\s)";
      out = out.replace(new RegExp(pattern, win ? "gi" : "g"), win ? "%USERPROFILE%" : "~");
    }
    out = out.replace(/\b[A-Za-z]:([\\/])Users[\\/]([^\\/:*?"<>|\r\n]+)(?=[\\/]|$)/gi,
      (m, sep, name) => (SHARED_PROFILES.test(name) ? m : "%USERPROFILE%"));
    out = out.replace(/(^|[\s("'=])\/(?:home|Users)\/[^/\s]+(?=\/|$)/g, "$1~");
    return out;
  }
  // viewers: 录播姬 XML (<d p="…,uid hash,…" user="…" uid="…">, <gift user="…" uid="…">), Bilibili live JSON
  // ("uid":…, "uname":"…", "user":{…}), key=value logs, and Chinese labels (用户名：…)
  const VIEWER = "uid|mid|uname|user|username|user_name|nickname|nick|nick_name|face|uface|sender";
  const RULES = [
    // keys and tokens
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 …"],
    [/\bsk-[A-Za-z0-9_-]{6,}/g, "sk-…"],
    [/\b(authorization|x-api-key|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, "$1$2…"],
    // viewers
    [new RegExp(`"(${VIEWER})"\\s*:\\s*\\{[^{}]*\\}`, "gi"), "\"$1\":\"…\""],
    [new RegExp(`"(${VIEWER})"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|-?\\d+)`, "gi"), "\"$1\":\"…\""],
    [new RegExp(`\\b(${VIEWER})\\s*=\\s*("[^"]*"|'[^']*')`, "gi"), "$1=\"…\""],
    [new RegExp(`\\b(${VIEWER})\\s*[=:]\\s*[^\\s,;&|"'<>]+`, "gi"), "$1=…"],
    [/\bp\s*=\s*"[^"]*"/g, "p=\"…\""],
    [/(用户名|用户|昵称|观众|粉丝)\s*[:：]\s*[^\s，。,;；、)）\]】"']+/g, "$1：…"],
  ];
  /** The text with viewers, keys and user folders taken out. */
  function redactProblem(s, opts = {}) {
    let out = String(s == null ? "" : s);
    for (const [re, to] of RULES) out = out.replace(re, to);
    return maskUserPath(out, opts);
  }
  return { maskUserPath, redactProblem };
});
