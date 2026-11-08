/* Durable receipts for bounded tool calls. An interrupted mutation is never replayed automatically. */
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { toolError } = require('./tool-error');
const canonical = x => JSON.stringify(x && typeof x === 'object' ? Array.isArray(x) ? x.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(x).sort().map(k => [k, JSON.parse(canonical(x[k]))])) : x);
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const ownerExists = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
};
function createToolTasks({ dir, dataDir = path.resolve(dir, '../..') }) {
  const live = new Map();
  const readerBusy = e => ['EPERM', 'EACCES', 'EBUSY'].includes(e.code);
  const save = record => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, record.taskId + '.json'), tmp = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(record), { flag: 'wx' }); fs.renameSync(tmp, file); }
    finally { fs.rmSync(tmp, { force: true }); }
  };
  const view = r => {
    const { fingerprint, key, pid, scope, privacyVersion, ...out } = r;
    return out.error ? { ...out, ...toolError({ error: out.error, code: out.code,
      ...(out.saved ? { saved: out.saved } : {}) }, { dataDir }) } : out;
  };
  async function call({ scope, name, args, key, taskId, wait_ms = 6000, waitForCompletion = false }, run) {
    if (key != null && (typeof key !== 'string' || !key.length || key.length > 256)) throw new Error('idempotency_key must be 1–256 characters');
    const fingerprint = hash(canonical(args));
    const id = taskId || 't_' + hash(canonical([scope, name, key || fingerprint]));
    if (!/^t_[a-f0-9]{64}$/.test(id)) throw new Error('invalid taskId');
    let entry = live.get(id), record = entry?.record;
    if (!record) {
      try { record = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    if (record) {
      if (record.scope !== scope || record.name !== name) throw new Error('task scope does not match');
      if (!taskId && record.fingerprint !== fingerprint) throw new Error('idempotency key already used with different arguments');
      if (record.privacyVersion !== 1) {
        // Old successful envelopes can contain warnings too. Scrub before any replay,
        // and migrate terminal receipts before returning them; never replay the mutation.
        const safe = { ...record, ...toolError(view(record), { dataDir, legacy: true }), privacyVersion: 1 };
        if (record.status !== 'running') save(safe);
        record = safe;
      }
      if (!entry && record.status === 'running' && !ownerExists(record.pid)) {
        // Readers must not overwrite an owner's concurrent terminal save. Keep the
        // on-disk claim: an uncertain result must never start the mutation again.
        record.status = 'interrupted'; record.error = 'The execution owner is unavailable. Results may already exist; this operation will not be repeated. Inspect the project and saved transcripts.';
      }
    } else {
      if (taskId) throw new Error('no such taskId');
      record = { taskId: id, scope, name, key, fingerprint, pid: process.pid, privacyVersion: 1, status: 'running', progress: { done: 0, total: null } };
      // Exclusive claim also prevents two MCP processes starting the same mutation together.
      fs.mkdirSync(dir, { recursive: true });
      try { fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(record), { flag: 'wx' }); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        return call({ scope, name, args, key, taskId, wait_ms, waitForCompletion }, run);
      }
      entry = { record }; live.set(id, entry);
      entry.finished = Promise.resolve().then(() => run(progress => {
        record.progress = progress;
        try { save(record); } catch (e) {
          // Windows readers can briefly prevent replacing the receipt. Keep the last
          // durable progress; this observation must not cancel the actual operation.
          if (!readerBusy(e)) throw Object.assign(new Error('Task progress could not be saved.'), {code:'TASK_PROGRESS_SAVE_FAILED'});
        }
      }))
        .then(result => ({ ...record, status: 'complete', result: toolError(result, { dataDir, result: true }) }), error => ({
          ...record, status: 'failed', ...toolError({ error: String(error.message || error),
            code: error.code || 'TASK_FAILED', ...(error.saved ? {saved:error.saved} : {}) }, { dataDir }),
        })).then(async terminal => {
          try {
            for (let attempt = 0; ; attempt++) {
              try { save(terminal); break; }
              catch (e) {
                if (!readerBusy(e) || attempt === 4) throw e;
                await new Promise(r => setTimeout(r, 20));
              }
            }
            // Never advertise completion before its result is durable.
            Object.assign(record, terminal);
          }
          catch {
            record.status = 'interrupted'; record.code = 'TASK_RECEIPT_SAVE_FAILED';
            record.error = 'The result receipt could not be saved. The operation may already have completed; it will not be repeated. Inspect the project and saved transcripts.';
            delete record.result;
          }
        });
    }
    const wait = Number.isFinite(wait_ms) ? Math.max(0, Math.min(15000, wait_ms)) : 6000;
    if (entry && waitForCompletion) await entry.finished;
    else if (entry && record.status === 'running' && wait) {
      let timer;
      try { await Promise.race([entry.finished, new Promise(r => { timer = setTimeout(r, wait); })]); }
      finally { clearTimeout(timer); }
    }
    return view(record);
  }
  return { call };
}
module.exports = { createToolTasks };
