/* One writer per data folder. The standalone Windows app and the Cindy plugin run the same engine
   (server.js); pointed at the same data folder, two of them would both save project.json and
   undo each other's edits. The first engine to start holds <data dir>/.montclip-writer.lock
   ({pid, shell, port, started}); another one finds it held by a live process and refuses to start.
   A lock left by a process that is gone (a crash, a kill) is taken over. Dotfiles are never served. */
"use strict";
const fs = require("fs");
const path = require("path");

const LOCK_NAME = ".montclip-writer.lock";

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }   // there, but not ours to signal
}

function readLock(file) {
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); return j && typeof j === "object" ? j : null; }
  catch { return null; }
}

/** Take the lock for `dir`, or throw DATA_DIR_IN_USE naming its holder.
 *  Returns {file, update(fields), release()}; release also runs when the process exits. */
function acquire(dir, { shell = "server", port = null, pid = process.pid } = {}) {
  const file = path.join(dir, LOCK_NAME);
  let info = { pid, shell, port, started: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx");
      try { fs.writeSync(fd, JSON.stringify(info)); } finally { fs.closeSync(fd); }
      const lock = {
        file,
        update(fields) {
          info = { ...info, ...fields };
          if (readLock(file)?.pid === pid) try { fs.writeFileSync(file, JSON.stringify(info)); } catch {}
        },
        release() {
          process.removeListener("exit", lock.release);
          if (readLock(file)?.pid === pid) try { fs.rmSync(file, { force: true }); } catch {}
        },
      };
      process.on("exit", lock.release);
      return lock;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const holder = readLock(file);
      if (holder && holder.pid !== pid && alive(holder.pid)) {
        const where = holder.port ? ` on port ${holder.port}` : "";
        throw Object.assign(new Error(`Another MontClip (${holder.shell || "server"}, pid ${holder.pid}${where}) is already editing ${dir}. ` +
          "Close it first, or give this one its own data folder (FABLECUT_DATA_DIR)."), { code: "DATA_DIR_IN_USE", holder });
      }
      try { fs.rmSync(file, { force: true }); } catch {}   // stale: its process is gone
    }
  }
  throw Object.assign(new Error(`Could not take the writer lock ${file}`), { code: "DATA_DIR_IN_USE" });
}

/** Who holds the lock for `dir` now: {pid, shell, port, started} of a live holder, else null. */
function holder(dir) {
  const h = readLock(path.join(dir, LOCK_NAME));
  return h && alive(h.pid) ? h : null;
}

module.exports = { acquire, holder, LOCK_NAME };
