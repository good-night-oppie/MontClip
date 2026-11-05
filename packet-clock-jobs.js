/* Read-only background diagnostics. Never write project.json or change a clip's clock. */
"use strict";
const fs = require("node:fs"), Clock = require("./packet-clock");
const error = code => Object.assign(new Error(code), { code });
function createClockJobs({ concurrency = 2, maxJobs = 128, stat = fs.promises.stat,
  scan = async (file, options) => Clock.coverage(await Clock.scanFile(file, options)) } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxJobs) || maxJobs < 1) throw new Error("invalid clock queue limits");
  const jobs = new Map();
  let queue = [], active = 0, closed = false;
  const keyOf = s => {
    if (s.isFile && !s.isFile()) throw error("CLOCK_NOT_FILE");
    return [s.dev ?? 0, s.ino ?? 0, s.size, s.mtimeMs, s.ctimeMs ?? 0].join(":");
  };
  const snapshot = job => job ? structuredClone({ key: job.key, state: job.state,
    ...(job.result ? { result: job.result } : {}), ...(job.code ? { code: job.code } : {}) }) : { state: "none" };
  const invalidate = job => { job.state = "stale"; delete job.result; job.ctrl.abort(); };
  function pump() {
    queue = queue.filter(job => job.state === "queued");
    while (!closed && active < concurrency && queue.length) {
      const job = queue.shift(); job.state = "running"; active++;
      (async () => {
        try {
          const result = await scan(job.file, { signal: job.ctrl.signal });
          if (job.state !== "running" || jobs.get(job.file) !== job) return;
          if (keyOf(await stat(job.file)) !== job.key) { invalidate(job); return; }
          if (job.state !== "running") return;
          job.result = result; job.state = "done";
        } catch {
          if (job.state === "running") { job.state = "failed"; job.code = "CLOCK_SCAN_FAILED"; }
        } finally { active--; pump(); }
      })();
    }
  }
  async function get(file) {
    const job = jobs.get(file);
    if (job && job.state !== "stale") {
      try { if (keyOf(await stat(file)) !== job.key) invalidate(job); }
      catch { invalidate(job); }
    }
    return snapshot(job);
  }
  async function start(file) {
    if (closed) throw error("CLOCK_SHUTDOWN");
    const key = keyOf(await stat(file));
    if (closed) throw error("CLOCK_SHUTDOWN");
    const old = jobs.get(file);
    if (old && old.key === key && ["queued", "running", "done"].includes(old.state)) return snapshot(old);
    if (old) { invalidate(old); jobs.delete(file); }
    if (jobs.size >= maxJobs) {
      const available = [...jobs.values()].find(job => !["queued", "running"].includes(job.state));
      if (!available) throw error("CLOCK_QUEUE_FULL");
      jobs.delete(available.file);
    }
    const job = { file, key, state: "queued", ctrl: new AbortController() };
    jobs.set(file, job); queue.push(job); pump();
    return snapshot(job);
  }
  function cancel(file) {
    const job = jobs.get(file);
    if (job && ["queued", "running"].includes(job.state)) {
      job.state = "cancelled"; job.ctrl.abort(); pump();
    }
    return snapshot(job);
  }
  function shutdown() { closed = true; for (const file of jobs.keys()) cancel(file); }
  return { start, get, cancel, shutdown };
}
module.exports = { createClockJobs };
