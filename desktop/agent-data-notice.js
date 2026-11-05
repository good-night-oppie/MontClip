'use strict';
/* The 「AI 数据说明」 (QQ via DD and Deja, 2026-11-04): DeepSeek's open-platform terms 3.5 and 5.5 ask that the end user is
   told how her personal information is handled before she uses the AI, and 8.1 that its output is marked as AI-made.
   The pane shows the notice before the first request; once she has read it and chosen to go on, that is kept here, in
   the main process (userData/agent-data-notice-v1.json), so it holds across launches — the page's own storage follows
   its port, which changes on every launch. A new NOTICE_VERSION (the wording changed) shows it again.
   The file holds the version she accepted and when; nothing else. Fixed IPC: montclip:agent:noticeGet / noticeAck. */
const NOTICE_VERSION = 3;   // 2: JJ's v3 (2026-11-04) — what DeepSeek does with it, how to turn it off, the policy versions
                            // 3: 「发了什么」 also names the singing parts and the loudness a second (JJ via Deja, 2026-11-05)
const NAME = 'agent-data-notice-v1.json';

function createStore(root, fs = require('node:fs')) {
  const path = require('node:path'), { randomUUID } = require('node:crypto'), file = path.join(root, NAME);
  const read = () => {
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8'));
      return v && Object.keys(v).sort().join(',') === 'accepted,at,version' && v.version === 1 && Number.isSafeInteger(v.accepted) && typeof v.at === 'string' ? v : null;
    } catch { return null; }
  };
  return {
    /** {ok, version, accepted}: accepted is true only for the notice shown now. */
    get() { const v = read(); return { ok: true, version: NOTICE_VERSION, accepted: !!v && v.accepted === NOTICE_VERSION }; },
    /** She read this version and chose to go on. Takes the version shown; an old one is refused. */
    ack(version) {
      if (version !== NOTICE_VERSION) return { ok: false, code: 'NOTICE_VERSION' };
      const tmp = file + '.' + randomUUID() + '.tmp';
      try { fs.writeFileSync(tmp, JSON.stringify({ version: 1, accepted: NOTICE_VERSION, at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 }); fs.renameSync(tmp, file); }
      catch { try { fs.unlinkSync(tmp); } catch {} return { ok: false, code: 'NOTICE_WRITE_FAILED' }; }
      return this.get();
    },
  };
}
module.exports = { NOTICE_VERSION, NAME, createStore };
