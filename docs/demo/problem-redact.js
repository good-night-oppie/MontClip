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
  // accounts (#161, JJ: 「账号已经去掉」): an account's name, mail or phone under its key
  const ACCOUNT = "account|account_?id|login|email|e-mail|mail|phone|mobile|tel";
  const RULES = [
    // keys and tokens: a whole Cookie / Set-Cookie header, then the shapes keys come in
    [/\b(Set-Cookie|Cookie)\s*:[^\r\n]*/gi, "$1: …"],
    [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 …"],
    [/\bsk-[A-Za-z0-9_-]{6,}/g, "sk-…"],
    [/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g, "$1…"],
    [/\bxox[abposr]-[A-Za-z0-9-]{8,}/g, "xox…"],
    [/\bAIza[0-9A-Za-z_-]{20,}/g, "AIza…"],
    [/\bAKIA[0-9A-Z]{12,}/g, "AKIA…"],
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "eyJ…"],   // a JWT
    [/\b(authorization|x-api-key|x-goog-api-key|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|client[_-]?secret|password|passwd|pwd|key|sig|signature|session|sessdata|bili_jct|csrf)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi, "$1$2…"],
    // accounts
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>"],
    [/(^|[^\d])1[3-9]\d{9}(?!\d)/g, "$1<phone>"],
    [new RegExp(`"(${ACCOUNT})"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|-?\\d+)`, "gi"), "\"$1\":\"…\""],
    [new RegExp(`\\b(${ACCOUNT})\\s*[=:]\\s*[^\\s,;&|"'<>]+`, "gi"), "$1=…"],
    [/(账号|帐号|账户|手机号|手机|邮箱)\s*[:：]\s*[^\s，。,;；、)）\]】"']+/g, "$1：…"],
    // viewers
    [new RegExp(`"(${VIEWER})"\\s*:\\s*\\{[^{}]*\\}`, "gi"), "\"$1\":\"…\""],
    [new RegExp(`"(${VIEWER})"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|-?\\d+)`, "gi"), "\"$1\":\"…\""],
    [new RegExp(`\\b(${VIEWER})\\s*=\\s*("[^"]*"|'[^']*')`, "gi"), "$1=\"…\""],
    [new RegExp(`\\b(${VIEWER})\\s*[=:]\\s*[^\\s,;&|"'<>]+`, "gi"), "$1=…"],
    [/\bp\s*=\s*"[^"]*"/g, "p=\"…\""],
    [/(用户名|用户|昵称|观众|粉丝)\s*[:：]\s*[^\s，。,;；、)）\]】"']+/g, "$1：…"],
  ];
  /* Paths on this computer (#161, JJ: 「文件路径已经去掉」): none leaves it, not even with the user's folder masked — a folder
     name says who and what. A path becomes <path>, keeping only the file's extension (<path .flv>), which helps and says
     nothing about the person. MontClip's own srcs (/media/x.mp4, /library/…, /exports/…) are not paths on the computer. */
  const ext = (p) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(p.replace(/[\\/]+$/, "")); return m ? `<path .${m[1].toLowerCase()}>` : "<path>"; };
  const POSIX = /(^|[\s("'=:,[])((?:~|\/(?:home|Users|root|tmp|var|private|mnt|Volumes|opt|srv|run|media|data|etc|usr|Library|Applications|System|snap|workspace))\/[^\s"'<>]*)/g;
  const OWN_SRC = /^\/(media|library|exports)\/[^/]*$/;
  function removePaths(s) {
    let out = s;
    // quoted: the whole quoted text, spaces included
    out = out.replace(/(["'])((?:[A-Za-z]:[\\/]|\\\\[^\\/\s]|~[\\/]|\/(?:home|Users|root|Volumes|mnt|tmp|var|private|media|data|opt|srv)\/)[^"'\r\n]*)\1/g,
      (m, q, p) => (OWN_SRC.test(p) ? m : q + ext(p) + q));
    out = out.replace(/\bfile:\/\/\/?[^\s"'<>]+/gi, (p) => ext(p));
    out = out.replace(/\b[A-Za-z]:[\\/][^\s"'<>|*?]*/g, (p) => ext(p));                       // C:\… D:/…
    out = out.replace(/(^|[\s("'=:,[])\\\\[^\\/\s]+[\\/][^\s"'<>|*?]*/g, (m, b) => b + ext(m.slice(b.length)));   // \\server\share
    out = out.replace(POSIX, (m, b, p) => (OWN_SRC.test(p) ? m : b + ext(p)));
    // what is left of a path with spaces in it (C:\My Videos\a b.flv): any word that still holds a backslash
    out = out.replace(/[^\s"'<>]*\\[^\s"'<>]*/g, (p) => (/^<path/.test(p) ? p : ext(p)));
    return out;
  }
  /** The text with viewers, keys, accounts and paths on this computer taken out. opts: {home, platform, user} — the
   *  computer's user name (and the last folder of its home), when known — the server knows them, the page alone does
   *  not — is taken out wherever it is left after that (alice-PC, a mail's name part). */
  function redactProblem(s, opts = {}) {
    let out = String(s == null ? "" : s);
    for (const [re, to] of RULES) out = out.replace(re, to);
    out = removePaths(out);
    const names = [opts.user, opts.home && String(opts.home).split(/[\\/]/).filter(Boolean).pop()]
      .filter((n) => typeof n === "string" && n.trim().length >= 3 && !/^(home|users|root|public|default)$/i.test(n.trim()));
    for (const n of new Set(names)) out = out.replace(new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRe(n.trim())}(?=$|[^\\p{L}\\p{N}_])`, "giu"), "$1<user>");
    return out;
  }
  /** The first line of what 〔复制问题信息〕 copies (#161, JJ): the mail watcher knows a report by it. */
  const HEADER = { "zh-CN": "MontClip 问题信息 v1", en: "MontClip problem details v1" };
  /** Everything 〔复制问题信息〕 copies: HEADER in the interface language, then the redacted text. */
  function problemDetails(s, opts = {}) {
    return (HEADER[opts.language] || HEADER["zh-CN"]) + "\n" + redactProblem(s, opts);
  }
  return { maskUserPath, redactProblem, problemDetails, HEADER };
});
