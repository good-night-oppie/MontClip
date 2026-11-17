/* #375 (#370 fact list row 6; QQ: a consistency fix, not a new way out): "import from a URL" is refused wherever the
   desktop app is the engine — the same one judgment for the server's /api/import-url and MCP's fablecut_import_media.
   The desktop app is the engine when this process runs as it (MONTCLIP_DESKTOP=1), or when the data folder's writer lock
   is held by a live desktop engine (writer-lock.js: shell "desktop") — an MCP process pointed at the desktop app's data
   folder. Nothing is sent before this answers: it reads an environment variable and one local file.

   #375 item 2 (PG 6937788935): embedded in Cindy, the assistant's URL import asks the streamer first, on her task's editor
   window, for each URL ("下载" / "不要", focus on "不要"). That card is a job on the editor's queue (export-jobs.js kind
   "importurl"); the answers are remembered by the caller for its session (a yes is not asked again, a no is not asked again
   and stays a no). */
"use strict";
const WriterLock = require("./writer-lock");

const REFUSAL = Object.freeze({ status: 403, code: "NETWORK_DISABLED", error: "Offline mode: import a local file." });

/** Is the desktop app the engine here? env: the process environment; dataDir: the data folder (optional). */
function desktopEngine({ env = process.env, dataDir = null } = {}) {
  if (env.MONTCLIP_DESKTOP === "1") return true;
  if (!dataDir) return false;
  const h = WriterLock.holder(dataDir);
  return !!(h && h.shell === "desktop");
}

/** The refusal for a URL import here ({status, code, error}), or null when it may go ahead. */
function urlImportRefusal(opts) { return desktopEngine(opts) ? { ...REFUSAL } : null; }

/** The host a URL import would reach, shown on the card (the site's name, not the whole address). null: not https. */
function importHost(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  return u.protocol === "https:" && u.hostname ? u.hostname : null;
}

/** Embedded in Cindy, does the assistant's URL import need the streamer's yes first? */
const confirmNeeded = (env = process.env) => env.MONTCLIP_HOST === "cindy";

module.exports = { desktopEngine, urlImportRefusal, importHost, confirmNeeded, REFUSAL };
