"use strict";
/* #369 (QQ, review 5928897982 and its follow-up) and #366 (QQ 6929724632): the MCP client proves itself with a key no page can read.
   It is what makes a request an agent's at /api/review/ (nothing else does), and what /api/frame?path= needs. The server draws a fresh one each time it starts
   and writes it to a file in the data folder; the MCP server (same machine, same data folder) reads that file and sends it as
   X-MontClip-Mcp. The file is never served: the data folder's root is not a static folder, and only media/, library/, exports/,
   previews/ and proxies are. A page, an injected script included, can set any header but cannot know this one.
   The old X-FableCut-Client: mcp header no longer counts. */
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");

const HEADER = "X-MontClip-Mcp";
const FILE = ".montclip-mcp-key";
const fileOf = (dataDir) => path.join(dataDir, FILE);

/** a new key for this server run, written atomically (a new file renamed into place, owner-only where the system allows) */
function issue(dataDir) {
  const key = crypto.randomBytes(32).toString("hex");
  const tmp = fileOf(dataDir) + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  fs.writeFileSync(tmp, key, { mode: 0o600, flag: "wx" });
  try { fs.renameSync(tmp, fileOf(dataDir)); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  return key;
}

/** the key the running server wrote, or null */
function read(dataDir) {
  try { const k = fs.readFileSync(fileOf(dataDir), "utf8").trim(); return /^[a-f0-9]{64}$/.test(k) ? k : null; } catch { return null; }
}

/** does this request carry the key? (constant-time compare) */
function matches(req, key) {
  const h = req && req.headers && req.headers[HEADER.toLowerCase()];
  if (!key || typeof h !== "string" || h.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(key));
}

module.exports = { HEADER, FILE, fileOf, issue, read, matches };
