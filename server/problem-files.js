/* The size of a file a raw error names, for 〔复制问题信息〕's 「相关文件：一个 mp4 文件，1.2 GB」 (#161). Node only (the server).

   The name comes from the page, so it is never trusted as a path (QQ, #161): only its last part, the file name, is used,
   and only where the server itself keeps files — the project's media folder, the exports folder, and the files the
   project's media entries point at (/media/…, /library/…). C:\Windows\win.ini or /etc/passwd is never looked at; a name
   found nowhere there has no size (「大小不明」). Zero dependencies. */
"use strict";
const path = require("path");

/** The file name of `name`, whichever separator it was written with; "" for none. */
function fileName(name) {
  const base = String(name || "").split(/[\\/]/).pop().trim();
  return base === "." || base === ".." ? "" : base;
}
/** Where a file called like `name` may be: o = {mediaDir, exportsDir, srcs: the media entries' srcs, resolve(src) → file}. */
function candidates(name, o = {}) {
  const base = fileName(name);
  if (!base) return [];
  const out = [];
  // resolved and checked: a name that would land outside the folder (a drive prefix, a NUL…) is refused, not looked up
  const inside = (dir, f) => path.dirname(path.resolve(f)) === path.resolve(dir) && !/[\0]/.test(f);
  for (const dir of [o.mediaDir, o.exportsDir]) {
    if (!dir) continue;
    const f = path.join(dir, base);
    if (inside(dir, f)) out.push(f);
  }
  for (const src of o.srcs || []) {
    if (typeof src !== "string") continue;
    let srcBase;
    try { srcBase = fileName(decodeURIComponent(src.split(/[?#]/)[0])); } catch { continue; }
    if (srcBase !== base) continue;
    const f = o.resolve && o.resolve(src);
    if (f) out.push(f);
  }
  return [...new Set(out)];
}
/** Its size in bytes, or null. stat: fs.statSync (passed in, so a test can watch what is looked at). */
function sizeOf(name, o, stat) {
  for (const f of candidates(name, o)) {
    try { const st = stat(f); if (st.isFile()) return st.size; } catch { }
  }
  return null;
}

module.exports = { fileName, candidates, sizeOf };
