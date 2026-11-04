/* What a streamer may copy and send us when something goes wrong (JJ v2, 2026-11-04, section 1, rule 2).
   The Cindy plugin's own copy of the engine's problem-details.js (#132): its pages are served from the plugin folder
   and cannot load the engine's file. test/cindy-problem.test.js keeps the two alike once both are there.

   The page never shows a raw error or a code: it says what happened and what she can do (app.js showProblem). The
   〔复制问题信息〕 button copies copyLine(): the time, the code and the raw error, scrubbed — a path is cut to its file
   name (the folders may carry her user name), and keys and tokens are removed. The console keeps logLine(), raw.
   Viewer names and uids do not occur in the errors this is used for. Pure; browser global MontClipProblem, and a
   CommonJS module for the tests. */
(function (root) {
  "use strict";
  const REMOVED = "[removed]";
  /* a folder part of a path: everything up to the last separator, so the file name after it stays. A folder name may
     have spaces (直播 回放) but stops at ; , % — what sits between two items in an error line, not in a folder name */
  const SEG = "[^\\\\/:*?\"<>|;,%\\r\\n]*";
  // a drive letter starts a word (not the "p:" of "http:")
  const WIN_DIR = new RegExp(`(?:(?<![A-Za-z0-9])[A-Za-z]:|%[A-Za-z_]+%|\\\\\\\\${SEG})[\\\\/](?:${SEG}[\\\\/])*`, "g");
  const POSIX_DIR = /(^|[\s("'=,;])(?:~|\/(?:home|Users|root|tmp|var|private|mnt|media|Volumes|opt|data|srv|run))\/(?:[^/\s"'<>]*\/)*/g;
  function scrub(text) {
    let s = String(text == null ? "" : text);
    s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer " + REMOVED);
    s = s.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, REMOVED);
    s = s.replace(/\b(token|access_token|api_key|apikey|api-key|key|secret|password|session|sig|signature)=([^&\s"'#]+)/gi, `$1=${REMOVED}`);
    s = s.replace(/\b[0-9a-fA-F]{64}\b/g, REMOVED);
    s = s.replace(WIN_DIR, "");
    s = s.replace(POSIX_DIR, "$1");
    return s;
  }
  const stamp = (at) => (at instanceof Date ? at : new Date()).toISOString();
  /** The line for the console: everything, as it came. */
  function logLine(problem, at) {
    const p = problem || {};
    return `[MontClip] ${stamp(at)} ${p.code || "UNKNOWN"}: ${String(p.error == null ? "" : p.error)}`;
  }
  /** The line the button copies: the same line, scrubbed. */
  function copyLine(problem, at) {
    const p = problem || {};
    return `[MontClip] ${stamp(at)} ${p.code || "UNKNOWN"}: ${scrub(p.error)}`;
  }
  const api = { scrub, logLine, copyLine };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MontClipProblem = api;
})(typeof window !== "undefined" ? window : globalThis);
