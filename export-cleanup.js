"use strict";
/* Stopping export sessions: ffmpeg first, then the half-finished files and each export's fablecut-XXXX folder.
   On Windows ffmpeg holds its output open without delete sharing, so a file cannot be deleted until ffmpeg has
   exited; deleting right after kill() (the old cleanup) could leave it behind. Each path is tried at once, then
   again as the processes exit, until timeoutMs; what is still there is returned (and passed to log). Finished
   exports are never in a session's paths: /api/export/end clears partPath once the file is renamed into place. */
const fs = require("node:fs");

const exited = (p) => p.exitCode !== null && p.exitCode !== undefined || p.signalCode !== null && p.signalCode !== undefined;

async function stopSessions(sessions, { timeoutMs = 3000, rm = (p) => fs.rmSync(p, { recursive: true, force: true }), log = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  const procs = [], paths = [];
  for (const s of sessions || []) {
    if (!s) continue;
    for (const p of [s.proc, ...(s.outputs || []).map((o) => o && o.proc)]) if (p) procs.push(p);
    for (const o of s.outputs || []) if (o && o.partPath) paths.push(o.partPath);
    if (s.partPath) paths.push(s.partPath);
    if (s.dir) paths.push(s.dir);
  }
  for (const p of procs) { try { p.kill(); } catch {} }
  const ended = Promise.all(procs.map((p) => exited(p) ? null : new Promise((r) => { try { p.once("exit", r); } catch { r(); } })));
  let left = paths;
  const sweep = () => { left = left.filter((p) => { try { rm(p); return fs.existsSync(p); } catch { return true; } }); };
  // ffmpeg first: wait (up to the limit) until it has exited, so nothing is still writing when the files go
  await Promise.race([ended, new Promise((r) => setTimeout(r, Math.max(0, deadline - Date.now())))]);
  sweep();
  while (left.length && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 100)); sweep(); }
  if (left.length) { try { log(left.slice()); } catch {} }
  return { left };
}

module.exports = { stopSessions };
