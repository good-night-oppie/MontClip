/* Durable receipts for bounded tool calls. An interrupted mutation is never replayed automatically. */
"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const canonical = x => JSON.stringify(x && typeof x === 'object' ? Array.isArray(x) ? x.map(v => JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(x).sort().map(k => [k, JSON.parse(canonical(x[k]))])) : x);
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
function createToolTasks({ dir }) {
  const live = new Map();
  const save = record => {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, record.taskId + '.json'), tmp = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(record), { flag: 'wx' }); fs.renameSync(tmp, file); }
    finally { fs.rmSync(tmp, { force: true }); }
  };
  const view = r => { const { fingerprint, key, ...out } = r; return out; };
  async function call({ scope, name, args, key, taskId, wait_ms = 6000, waitForCompletion = false }, run) {
    if (key != null && (typeof key !== 'string' || !key.length || key.length > 256)) throw new Error('idempotency_key must be 1–256 characters');
    const fingerprint = hash(canonical(args));
    const id = taskId || 't_' + hash(canonical([scope, name, key || fingerprint]));
    if (!/^t_[a-f0-9]{64}$/.test(id)) throw new Error('invalid taskId');
    let entry = live.get(id), record = entry?.record;
    if (!record) {
      try { record = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (record?.status === 'running') {
        record.status = 'interrupted'; record.error = 'The worker stopped. Results may already exist; this operation will not be repeated. Inspect the project and saved transcripts.'; save(record);
      }
    }
    if (record) {
      if (record.scope !== scope || record.name !== name) throw new Error('task scope does not match');
      if (!taskId && record.fingerprint !== fingerprint) throw new Error('idempotency key already used with different arguments');
    } else {
      if (taskId) throw new Error('no such taskId');
      record = { taskId: id, scope, name, key, fingerprint, status: 'running', progress: { done: 0, total: null } };
      // Exclusive claim also prevents two MCP processes starting the same mutation together.
      fs.mkdirSync(dir, { recursive: true });
      try { fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(record), { flag: 'wx' }); }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        return call({ scope, name, args, key, taskId, wait_ms, waitForCompletion }, run);
      }
      entry = { record }; live.set(id, entry);
      entry.finished = Promise.resolve().then(() => run(progress => { record.progress = progress; save(record); }))
        .then(result => { record.status = 'complete'; record.result = result; }, error => {
          record.status = 'failed'; record.error = String(error.message || error); record.code = error.code || 'TASK_FAILED';
          if (error.saved) record.saved = error.saved;
        }).then(() => save(record));
      // Persistence failures remain visible to a waiting/repeated caller; never an unhandled rejection.
      entry.finished.catch(() => {});
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
