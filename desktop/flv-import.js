"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {randomUUID, createHash} = require("node:crypto");
const {pipeline} = require("node:stream/promises");
const {inspectFlv, prepareMedia} = require("../prepare-media");
const fail = code => Object.assign(new Error(code), {code});
async function digest(file, signal) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file, {signal})) hash.update(chunk);
  return hash.digest("hex");
}
// Only files allocated by this instance enter owned. Never scan/delete user media.
function createFlvImports(mediaDir) {
  const jobs = new Map();
  const inspections = new Map();
  const importedHashes = new Set(); // Advisory duplicate prompt; never a cross-project reuse index.
  const clean = job => {
    job.owned = job.owned.filter(file => { try { fs.rmSync(file, {force:true}); return false; } catch { return true; } });
    if (job.owned.length) throw fail("FLV_CLEANUP_FAILED");
  };
  const get = id => { const job = jobs.get(id); if (!job) throw fail("FLV_IMPORT_EXPIRED"); return job; };
  const expire = (id, job) => {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => { try { clean(job); jobs.delete(id); } catch { /* retain failed cleanup for shutdown retry */ } }, 15 * 60 * 1000);
    job.timer.unref();
  };
  return {
    async inspect(file, id = randomUUID()) {
      if (jobs.has(id) || inspections.has(id)) throw fail("FLV_IMPORT_BUSY");
      const controller = new AbortController();
      let done;
      controller.done = new Promise(resolve => {done=resolve;}); inspections.set(id, controller);
      try {
      file = await fs.promises.realpath(file);
      if (path.extname(file).toLowerCase() !== ".flv" || !(await fs.promises.stat(file)).isFile()) throw fail("FLV_PROBE_FAILED");
      const {compatible} = await inspectFlv(file, {signal:controller.signal});
      const job = {file, hash:await digest(file, controller.signal), owned:[], controller, busy:false};
      jobs.set(id, job); expire(id,job);
      return {id, compatible, duplicate:importedHashes.has(job.hash)};
      } finally { inspections.delete(id); done(); }
    },
    async prepare(id, allowTranscode) {
      const job = get(id);
      if (job.busy || job.result) throw fail("FLV_IMPORT_BUSY");
      job.busy = true;
      clearTimeout(job.timer);
      let done;
      job.done = new Promise(resolve => {done=resolve;});
      const signal = job.controller.signal;
      try {
        fs.mkdirSync(mediaDir, {recursive:true});
        const target = path.join(mediaDir, "source-" + randomUUID() + ".flv");
        // Exclusive creation plus streaming avoids a whole-file memory buffer.
        const handle = await fs.promises.open(target, "wx");
        job.owned.push(target);
        await pipeline(fs.createReadStream(job.file), handle.createWriteStream(), {signal});
        if (await digest(target, signal) !== job.hash) throw fail("FLV_SOURCE_CHANGED");
        const result = await prepareMedia(target, {allowTranscode:allowTranscode === true, signal});
        job.owned.push(path.join(mediaDir, decodeURIComponent(result.src.slice("/media/".length))));
        if (signal.aborted) throw fail("FLV_IMPORT_CANCELED");
        job.result = result;
        return result;
      } catch (error) {
        clearTimeout(job.timer); clean(job); jobs.delete(id);
        throw signal.aborted ? fail("FLV_IMPORT_CANCELED") : error;
      } finally { job.busy = false; if(jobs.has(id)) expire(id,job); done(); }
    },
    finish(id) {
      const job = get(id);
      if (!job.result || job.busy) throw fail("FLV_IMPORT_BUSY");
      importedHashes.add(job.hash);
      clearTimeout(job.timer); jobs.delete(id); // Registered media becomes persistent.
    },
    cancel(id) {
      inspections.get(id)?.abort();
      const job = jobs.get(id); if (!job) return;
      job.controller.abort(); clearTimeout(job.timer);
      if (!job.busy) { clean(job); jobs.delete(id); }
    },
    async shutdown() {
      const pending = [...inspections.values()].map(controller => controller.done).concat([...jobs.values()].map(job=>job.done));
      for (const controller of inspections.values()) controller.abort();
      for (const job of jobs.values()) { job.controller.abort(); clearTimeout(job.timer); }
      await Promise.allSettled(pending);
      for (const [id,job] of jobs) {clean(job); jobs.delete(id);}
    },
  };
}
module.exports = {createFlvImports};
