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
  /* What is copied (JJ, #161): the streamer can see at a glance that nothing of hers is in it. No raw error, call stack or
     path. Five kinds of line: HEADER; the version (MontClip's and the system's family, nothing more); what happened, in the
     plain words she saw (errorText's `what`: not what to do, not the button); each file only as its type and size
     (「一个 mp4 文件，1.2 GB」); the error code alone, for developers. */
  const WORDS = {
    "zh-CN": { version: "版本：", unknown: "版本不明", dev: "给开发者看（不用管）：", file: "相关文件：", one: (ext, size) => `一个 ${ext} 文件，${size || "大小不明"}` },
    en: { version: "Version: ", unknown: "version unknown", dev: "For developers (you can ignore this): ", file: "File: ", one: (ext, size) => `${/^[aefhilmnorsx]/.test(ext) ? "an" : "a"} ${ext} file, ${size || "size unknown"}` },
  };
  /** The system as the version line says it (JJ, #161): Windows 11 / Windows 10 / macOS / Linux — never a build number,
   *  host or user name, path or locale. platform: process.platform (or the page's navigator.platform); release: os.release(). */
  function systemName(platform, release) {
    const p = String(platform || "").toLowerCase();
    if (/^win/.test(p)) {
      const m = /^10\.0\.(\d{5})(?:\D|$)/.exec(String(release || "").trim());
      return m ? (Number(m[1]) >= 22000 ? "Windows 11" : "Windows 10") : "Windows";
    }
    if (/^(darwin|mac)/.test(p)) return "macOS";
    if (/linux|x11/.test(p)) return "Linux";
    return null;
  }
  /** 「版本：MontClip 1.18.0 · Windows 11」: a version that is a version (1.18.0, 1.18.0-rc.1), else 「版本不明」; the system's
   *  family only (systemName). app: {version, platform, release}. */
  function versionLine(app, language = "zh-CN") {
    const w = WORDS[language] || WORDS["zh-CN"];
    const v = String((app && app.version) || "").trim(), os = systemName(app && app.platform, app && app.release);
    const version = /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z]{1,12}(\.[0-9A-Za-z]{1,12}){0,3})?$/.test(v) ? "MontClip " + v : "MontClip " + w.unknown;
    return w.version + version + (os ? " · " + os : "");
  }
  const FILE_EXT = "mp4|m4v|mov|mkv|webm|flv|avi|ts|mts|m2ts|wmv|mp3|wav|aac|m4a|flac|ogg|opus|wma|png|jpe?g|gif|webp|bmp|svg|srt|vtt|ass|lrc|xml|json|txt";
  /** The files a raw error names (paths or bare names): [{name, ext}] — the name only to look its size up, never copied. */
  function fileMentions(log) {
    const out = [], seen = new Set();
    const re = new RegExp(`(?:"([^"\\r\\n]+?\\.(?:${FILE_EXT}))"|'([^'\\r\\n]+?\\.(?:${FILE_EXT}))'|([^\\s"'<>()=,;]+?\\.(?:${FILE_EXT})))(?=$|[\\s"'<>():,;.])`, "gi");
    for (const m of String(log || "").matchAll(re)) {
      const name = m[1] || m[2] || m[3];
      const ext = /\.([A-Za-z0-9]+)$/.exec(name)[1].toLowerCase();
      if (!seen.has(name)) { seen.add(name); out.push({ name, ext }); }
    }
    return out;
  }
  function fmtBytes(b) {
    if (!(b > 0)) return "";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0, n = b;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (i === 0 ? n : n < 10 ? n.toFixed(1) : Math.round(n)) + " " + u[i];
  }
  /** A file name or a sentence with file names in it: each name as its type (「一个 mp4 文件」), the rest redacted. */
  function plain(s, w, opts) {
    const re = new RegExp(`[^\\s"'<>()=,;：，。、「」“”]+?\\.(${FILE_EXT})(?=$|[\\s"'<>():,;.，。、」”])`, "gi");
    return redactProblem(String(s || "").replace(re, (m, ext) => w.one(ext.toLowerCase(), "").replace(/[，,]\s*(大小不明|size unknown)$/, "")), opts);
  }
  /** Everything 〔复制问题信息〕 copies. p: {text: what happened, in the plain words the streamer saw (errorText's `what`),
   *  code, log: the raw error (read only for the files it names, never copied), files?: [{ext, size}] (the server's, with
   *  sizes), app?: {version, platform, release}}; opts: {language, home, platform, user}. Lines: HEADER; versionLine; what
   *  happened; 「相关文件：一个 mp4 文件，1.2 GB」 per file; 「给开发者看（不用管）：<code>」. */
  function problemDetails(p, opts = {}) {
    const language = HEADER[opts.language] ? opts.language : "zh-CN", w = WORDS[language];
    const lines = [HEADER[language], versionLine((p && p.app) || {}, language)];
    for (const l of String((p && p.text) || "").split(/\r?\n/)) if (l.trim()) lines.push(plain(l.trim(), w, opts));
    const files = (p && Array.isArray(p.files) ? p.files : fileMentions(p && p.log).map((f) => ({ ext: f.ext })));
    for (const f of files.slice(0, 8)) if (f && /^[a-z0-9]{1,5}$/i.test(f.ext)) lines.push(w.file + w.one(f.ext.toLowerCase(), fmtBytes(f.size)));
    // a code is an identifier; anything else (a path, a message where a code should be) is not copied
    const raw = String((p && p.code) || "").trim(), code = redactProblem(raw, opts).trim();
    if (raw) lines.push(w.dev + (/^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : "UNKNOWN"));
    return lines.join("\n");
  }
  return { maskUserPath, redactProblem, problemDetails, fileMentions, fmtBytes, systemName, versionLine, HEADER };
});
