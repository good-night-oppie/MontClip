'use strict';
/* The 「AI 助手」 switch in 设置 (QQ via Deja, 2026-11-04): switched off, the assistant sends nothing at all — the main
   process refuses every request (AI_OFF) whatever the page asks. Kept by the main process
   (userData/agent-switch-v1.json: {version:1, enabled}), so it holds across launches. On unless switched off.
   Fixed IPC: montclip:agent:switchGet / switchSet (a boolean, nothing else). */
const NAME = 'agent-switch-v1.json';

function createStore(root, fs = require('node:fs')) {
  const path = require('node:path'), { randomUUID } = require('node:crypto'), file = path.join(root, NAME);
  const read = () => {
    try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && Object.keys(v).sort().join(',') === 'enabled,version' && v.version === 1 && typeof v.enabled === 'boolean' ? v.enabled : true; }
    catch { return true; }
  };
  return {
    get() { return { ok: true, enabled: read() }; },
    set(enabled) {
      if (typeof enabled !== 'boolean') return { ok: false, code: 'SWITCH_INVALID' };
      const tmp = file + '.' + randomUUID() + '.tmp';
      try { fs.writeFileSync(tmp, JSON.stringify({ version: 1, enabled }), { flag: 'wx', mode: 0o600 }); fs.renameSync(tmp, file); }
      catch { try { fs.unlinkSync(tmp); } catch {} return { ok: false, code: 'SWITCH_WRITE_FAILED', enabled: read() }; }
      return this.get();
    },
  };
}
module.exports = { NAME, createStore };
