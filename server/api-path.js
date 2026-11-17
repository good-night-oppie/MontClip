"use strict";
/* One plain spelling for /api/ paths (QQ, #326 review 5927365621; Deja): the server and the desktop main process both decide with this one
   function, so neither can read a path differently from the other. A request that could mean an /api/ route — after percent-decoding,
   backslashes as slashes, dot segments and case are taken into account — must already be written as the plain path: lower case, no
   encoding, no "//", no "." or ".." segment, no backslash. Anything else is refused, never tidied: nothing is guessed.
   Takes the request target as written (path and query, e.g. req.url); the query is not looked at. */
function nonCanonicalApi(rawUrl) {
  const raw = String(rawUrl || "").split(/[?#]/)[0];
  if (raw.startsWith("//") || raw.includes("\\")) return true;   // "//api/…" is read as a host by URL parsers; a backslash is a slash to some
  let d = raw;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(d); i++) { try { d = decodeURIComponent(d); } catch { return /\/api/i.test(raw); } }
  const norm = require("node:path").posix.normalize(d.replace(/\\/g, "/")).toLowerCase();
  let parsed = "";
  try { parsed = decodeURIComponent(new URL(raw, "http://localhost").pathname).toLowerCase(); } catch { parsed = ""; }
  const apiIsh = norm === "/api" || norm.startsWith("/api/") || parsed.startsWith("/api/") || /^\/+api(\/|\\|$)/i.test(d);
  return apiIsh && !/^\/api(\/(?!\.\.?(?:\/|$))[a-z0-9_.-]+)+\/?$/.test(raw);
}

module.exports = { nonCanonicalApi };
