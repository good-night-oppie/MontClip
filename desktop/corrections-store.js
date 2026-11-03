'use strict';
/* The streamer's corrections, on this computer (Deja, 2026-11-03; corrections.js says what a record holds). Main process
   only: <userData>/corrections/<scope>.json and settings.json beside it. Never in the project file, never in the MCP
   server's context, never sent. The page reaches them through fixed channels (desktop/main.js), with no path.
   - append(record): checked by corrections.js and kept, newest last, at most `max` (the oldest go); refused when off;
   - records(): the kept ones when on, null when off (so the search uses nothing);
   - status(): {enabled, count}; setEnabled(on): remembered; clear(): every scope emptied in one go.
   A scope is one streamer's file. MontClip has no streamer of its own yet, so the page uses one scope, "default", until a
   way to tell streamers apart is decided; a scope is a short id or a hex digest, never a path. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Corrections = require('../corrections');
const SCOPE = /^(default|[a-f0-9]{8,64})$/;

function create({ dir, scope = 'default', max = 5000 } = {}) {
  if (!dir) throw Error('dir is required');
  if (!SCOPE.test(scope)) throw Error('scope must be "default" or a hex digest');
  const home = path.join(dir, 'corrections'), file = path.join(home, scope + '.json'), settings = path.join(home, 'settings.json');
  const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
  // written to a new file of its own, then put in place
  const write = (f, value) => {
    fs.mkdirSync(home, { recursive: true });
    const tmp = f + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value), { flag: 'wx' });
    try { fs.renameSync(tmp, f); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  };
  const enabled = () => readJson(settings, { enabled: true }).enabled !== false;
  // only what corrections.js accepts is read back: a damaged or hand-edited file adds nothing
  const kept = () => { const v = readJson(file, null); return v && v.v === 1 && Array.isArray(v.records) ? v.records.filter((r) => { try { Corrections.record(r); return true; } catch { return false; } }) : []; };
  return {
    status: () => ({ enabled: enabled(), count: kept().length }),
    records: () => (enabled() ? kept() : null),
    append(input) {
      if (!enabled()) return { ok: false, code: 'CORRECTIONS_OFF' };
      let r; try { r = Corrections.record(input); } catch { return { ok: false, code: 'CORRECTION_INVALID' }; }
      const list = kept(); list.push(r);
      write(file, { v: 1, records: list.slice(-max) });
      return { ok: true };
    },
    setEnabled(on) { write(settings, { enabled: on === true }); return { ok: true, enabled: on === true }; },
    clear() {
      let names = []; try { names = fs.readdirSync(home); } catch { }
      for (const n of names) if (n !== 'settings.json' && /\.json$/.test(n)) fs.unlinkSync(path.join(home, n));
      return { ok: true };
    },
  };
}
module.exports = { create, SCOPE };
