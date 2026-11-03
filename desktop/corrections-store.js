'use strict';
/* The streamer's corrections, on this computer (Deja, 2026-11-03; corrections.js says what a record holds). Main process
   only: <userData>/corrections/default.json and settings.json beside it. Never in the project file, never in the MCP
   server's context, never sent. The page reaches them through fixed channels (desktop/main.js), with no path.
   - append(record): checked by corrections.js and kept, newest last, at most `max` (the oldest go); refused when off;
   - records(): the kept ones when on, null when off (so the search uses nothing);
   - status(): {enabled, count, byType}; undo(id): one record taken back; setEnabled(on): remembered; clear(): every
     records deleted in one go.
   One file per MontClip profile (Deja, 2026-11-03): a MontClip on a computer is one streamer's, so the corrections are not
   split by folder or anything else. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Corrections = require('../corrections');

function create({ dir, max = 5000, ...rest } = {}) {
  if (!dir) throw Error('dir is required');
  if (Object.keys(rest).length) throw Error('one file per MontClip profile: no other option');
  const home = path.join(dir, 'corrections'), file = path.join(home, 'default.json'), settings = path.join(home, 'settings.json');
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
    // the settings page: how many, and how many of each kind of change (挪开头结尾 · 不要这条 · 改类型 · 补一段)
    status: () => { const k = kept(), byType = {}; for (const t of ["trim", "remove", "kind", "add"]) byType[t] = k.filter((r) => r.type === t).length; return { enabled: enabled(), count: k.length, byType }; },
    records: () => (enabled() ? kept() : null),
    append(input) {
      if (!enabled()) return { ok: false, code: 'CORRECTIONS_OFF' };
      const id = crypto.randomBytes(8).toString('hex');
      let r; try { r = Corrections.record(input && typeof input === 'object' && !Array.isArray(input) ? { ...input, id } : input); } catch { return { ok: false, code: 'CORRECTION_INVALID' }; }
      const list = kept(); list.push(r);
      write(file, { v: 1, records: list.slice(-max) });
      return { ok: true, id };
    },
    // undoing an edit takes its record back (v11): by the id append gave
    undo(id) {
      if (typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id)) return { ok: false, code: 'CORRECTION_UNKNOWN' };
      const list = kept(), left = list.filter((r) => r.id !== id);
      if (left.length === list.length) return { ok: false, code: 'CORRECTION_UNKNOWN' };
      write(file, { v: 1, records: left });
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
module.exports = { create };
