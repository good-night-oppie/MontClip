/* Desktop FLV import (main process). The FLV the user chose is checked where it is and hashed before anything is
 * copied. Only once the user has agreed (to a re-encode, or to a file whose end could not be confirmed) is it copied
 * into media/ — as a stream, never whole in memory — and the copy's hash must equal the original's. The compatible
 * MP4 is then made from that copy by prepareMedia. A cancel or a failure removes only the files this import made;
 * nothing else in media/ is looked at. finish() hands the files over to the project. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { inspectFlv, prepareMedia } = require("../prepare-media");

const GAP_LIMIT = 0.005;   // as prepareMedia: clock quantization, not an A/V quality claim
const fail = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code });

function createFlvImports({ mediaDir, inspect = (file, o) => inspectFlv(file, { ...o, readableRange: true }), prepare = prepareMedia,
  chunk = 1 << 20, ttl = 15 * 60 * 1000 } = {}) {
  const jobs = new Map();
  /** sha256 of a file, read in pieces; `progress(bytes)` after each. */
  async function hashFile(file, signal, progress) {
    const h = crypto.createHash("sha256");
    for await (const piece of fs.createReadStream(file, { highWaterMark: chunk, signal })) { h.update(piece); progress && progress(piece.length); }
    return h.digest("hex");
  }
  /** Removes this import's own files. A file that can't be removed is kept on the list for the next try. */
  function clean(job) {
    job.owned = job.owned.filter((f) => { try { fs.rmSync(f, { force: true }); return false; } catch { return true; } });
    if (job.owned.length) throw fail("FLV_CLEANUP_FAILED");
  }
  function drop(id, job) { clearTimeout(job.timer); jobs.delete(id); clean(job); }
  function arm(id, job) {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => { try { drop(id, job); } catch { /* retried at shutdown */ } }, ttl);
    job.timer.unref?.();
  }
  const get = (id) => { const job = jobs.get(id); if (!job) throw fail("FLV_IMPORT_EXPIRED"); return job; };
  const aborted = (job) => job.controller.signal.aborted;

  return {
    async inspect(file, { id = crypto.randomUUID() } = {}) {
      let real;
      try { real = await fs.promises.realpath(String(file)); } catch { throw fail("FLV_NOT_FOUND"); }
      const st = await fs.promises.stat(real);
      if (!st.isFile() || path.extname(real).toLowerCase() !== ".flv") throw fail("FLV_NOT_FLV");
      const job = { file: real, size: st.size, mtimeMs: st.mtimeMs, owned: [], controller: new AbortController(), phase: "inspect", done: 0, busy: true };
      jobs.set(id, job);
      try {
        const { compatible, range } = await inspect(real, { signal: job.controller.signal });
        if (range && range.maxGap > GAP_LIMIT) throw fail("FLV_TIMELINE_GAP");
        job.phase = "hash";
        job.hash = await hashFile(real, job.controller.signal, (n) => { job.done += n; });
        if (aborted(job)) throw fail("FLV_IMPORT_CANCELED");
        Object.assign(job, { compatible: !!compatible, needsReadableConsent: !!(range && range.needsConsent), range, phase: "ready", busy: false });
        arm(id, job);
        return { id, name: path.basename(real), size: st.size, sha256: job.hash, compatible: job.compatible,
          needsReadableConsent: job.needsReadableConsent, ...(range ? { range } : {}) };
      } catch (error) {
        jobs.delete(id);
        throw aborted(job) ? fail("FLV_IMPORT_CANCELED", error) : error;
      }
    },
    async prepare(id, { allowTranscode = false, acceptReadable = false } = {}) {
      const job = get(id);
      if (job.busy || job.result) throw fail("FLV_IMPORT_BUSY");
      // the user's answer comes first: nothing is copied without it
      if (!job.compatible && allowTranscode !== true) throw fail("FLV_TRANSCODE_REQUIRED");
      if (job.needsReadableConsent && acceptReadable !== true) throw fail("FLV_READABLE_CONSENT_REQUIRED");
      job.busy = true; clearTimeout(job.timer);
      const signal = job.controller.signal;
      try {
        fs.mkdirSync(mediaDir, { recursive: true });
        const stem = path.basename(job.file, path.extname(job.file)).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "recording";
        const target = path.join(mediaDir, `${stem}-${crypto.randomUUID().slice(0, 8)}.flv`);
        const out = await fs.promises.open(target, "wx");   // a new file of our own, never an existing one
        job.owned.push(target);
        job.phase = "copy"; job.done = 0;
        const h = crypto.createHash("sha256");
        try {
          for await (const piece of fs.createReadStream(job.file, { highWaterMark: chunk, signal })) {
            h.update(piece);
            let off = 0;
            while (off < piece.length) off += (await out.write(piece, off, piece.length - off)).bytesWritten;
            job.done += piece.length;
          }
        } finally { await out.close(); }
        if (h.digest("hex") !== job.hash) throw fail("FLV_SOURCE_CHANGED");   // the original changed since inspection
        job.phase = "verify"; job.done = 0;
        if (await hashFile(target, signal, (n) => { job.done += n; }) !== job.hash) throw fail("FLV_COPY_MISMATCH");
        job.phase = "prepare";
        const result = await prepare(target, { allowTranscode: allowTranscode === true, acceptReadable: acceptReadable === true, signal });
        if (result && typeof result.src === "string" && result.src.startsWith("/media/"))
          job.owned.push(path.join(mediaDir, decodeURIComponent(result.src.slice("/media/".length))));
        if (aborted(job)) throw fail("FLV_IMPORT_CANCELED");
        job.result = { ...result, sha256: job.hash, size: job.size };
        job.phase = "done";
        return job.result;
      } catch (error) {
        const canceled = aborted(job) || error.name === "AbortError" || error.code === "ABORT_ERR";
        jobs.delete(id); clearTimeout(job.timer);
        try { clean(job); } catch (cleanup) { job.cleanupError = cleanup; jobs.set(id, job); }
        throw canceled ? fail("FLV_IMPORT_CANCELED", error) : error;
      } finally {
        job.busy = false;
        if (jobs.get(id) === job && job.result) arm(id, job);
      }
    },
    /** Where an import is: phase inspect / hash / copy / verify / prepare / ready / done, bytes done of size. */
    status(id) { const job = jobs.get(id); return job ? { phase: job.phase, done: job.done, size: job.size } : null; },
    /** The files now belong to the project (the page has registered the media). */
    finish(id) {
      const job = get(id);
      if (!job.result || job.busy) throw fail("FLV_IMPORT_BUSY");
      clearTimeout(job.timer); jobs.delete(id);
    },
    /** Stop an import and remove its own files (a running step removes them as it stops). */
    cancel(id) {
      const job = jobs.get(id);
      if (!job) return;
      job.controller.abort();
      if (!job.busy) drop(id, job);
    },
    /** On quit: stop every import that isn't finished and remove its files. */
    async shutdown() {
      for (const job of jobs.values()) job.controller.abort();
      for (let i = 0; i < 200 && [...jobs.values()].some((j) => j.busy); i++) await new Promise((r) => setTimeout(r, 25));
      let failed = false;
      for (const [id, job] of [...jobs]) { try { drop(id, job); } catch { failed = true; } }
      if (failed) throw fail("FLV_CLEANUP_FAILED");
    },
  };
}
module.exports = { createFlvImports };
