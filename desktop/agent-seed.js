'use strict';
/* A private test package's one-time key (Deja, 2026-11-04; the owner: 「配置好再打包，私下打包，不发布」).
   desktop/package-win.cjs --private-seed puts one streamer's DeepSeek key in resources/montclip-seed-v1.json:
     {"version":1,"provider":"deepseek","model":"<id given at packaging>","apiKey":"<the key>"}
   On the first launch the main process seals it into agent-connection-v1.json through the AI service's own
   configure() (Electron safeStorage; on Windows that is DPAPI, bound to this Windows user: another computer or another
   Windows account has to set the AI up again). QQ's order (2026-11-04), so that the key is never lost and never twice:
     1. write the connection file (configure: a temporary file renamed into place, the temporary removed on failure);
     2. read it back from disk and unseal it: the same provider, model and key (service.matches);
     3. only then overwrite the seed's bytes, then delete it, and check that it is gone.
   A failure at 1 leaves no connection file and keeps the seed; at 2 the connection file is removed again
   (deleteConnection) and the seed kept. If rollback cannot remove the connection, both files stay for recovery;
   a later launch must verify the saved connection before it can remove the seed. The leftover is recorded beside the
   seed (montclip-seed-v1.json.leftover: the SHA-256 of the connection file's sealed bytes, never the key), so that
   later launches report it as a failed sealing (SEAL_FAILED_LEFTOVER: the seed kept, the AI paused) and never as a
   connection the streamer chose herself (QQ on #131).
   - safeStorage unavailable: nothing is written, the seed stays for a later launch, and the streamer is told in plain
     words. The key is never saved in plain text anywhere else.
   - A connection already saved: delete the seed only if provider, model and key match; otherwise keep both files
     and report SEED_CONFLICT (or SEAL_FAILED_LEFTOVER when it is the recorded leftover). Do not overwrite a different connection or silently discard the recovery copy.
   - The seed is read once, never logged; results carry codes and paths only, never the key or any part of it. */
const SEED_NAME = 'montclip-seed-v1.json';
const SEED_MAX_BYTES = 8192;
const LEFTOVER_SUFFIX = '.leftover';
const HEX64 = /^[0-9a-f]{64}$/;
const MODEL_RE = /^[a-zA-Z0-9_.:/-]{1,100}$/;

/** The seed's fields, or null when it is not a seed this version writes. */
function parseSeed(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > SEED_MAX_BYTES) return null;
    const v = JSON.parse(raw);
    if (!v || Object.keys(v).sort().join(',') !== 'apiKey,model,provider,version' || v.version !== 1) return null;
    if (v.provider !== 'deepseek' || typeof v.model !== 'string' || !MODEL_RE.test(v.model)) return null;
    if (typeof v.apiKey !== 'string' || !v.apiKey || v.apiKey.length > 4096 || /[\s]/.test(v.apiKey)) return null;
    return { provider: v.provider, model: v.model, apiKey: v.apiKey };
  } catch { return null; }
}

/** The seed file's text for package-win.cjs (the one place it is written). */
function seedText({ model, apiKey }) {
  const text = JSON.stringify({ version: 1, provider: 'deepseek', model, apiKey });
  if (!parseSeed(text)) throw Error('SEED_INVALID');
  return text;
}

/** Seal the seed, if there is one. → {code, file?}:
 *  NO_SEED · SEED_CLEANED (previously wiped seed deleted) · SEALED · ALREADY_CONFIGURED (verified matching connection) · SEED_CONFLICT (different or unverifiable
 *  saved connection, both files kept) · NOT_DELETED (verified, but the file could not be removed:
 *  the streamer is asked to delete it) · NO_ENCRYPTION (nothing written, the seed kept) · SEED_INVALID (kept, untouched) ·
 *  CONFIG_FAILED (the service refused it; nothing written; the seed kept) · VERIFY_FAILED (written but not read back the same:
 *  the connection file removed again, the seed kept) · VERIFY_FAILED_NOT_UNDONE (and it could not be removed; recorded as a leftover) ·
 *  SEAL_FAILED_LEFTOVER (a later launch: the saved connection is still that leftover; both files kept, the AI paused). */
function importSeed({ file, fs = require('node:fs'), service, encryptionAvailable }) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return { code: e && e.code === 'ENOENT' ? 'NO_SEED' : 'SEED_INVALID', file }; }
  // its bytes overwritten first (zeros, flushed), then the file deleted; checked gone. On an SSD the old blocks may
  // stay until the drive reuses them: overwriting is a best effort, deleting is what is checked.
  const remove = () => {
    try { const fd = fs.openSync(file, 'r+'); try { const n = fs.fstatSync(fd).size; fs.writeSync(fd, Buffer.alloc(n, 0), 0, n, 0); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch {}
    try { fs.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') return false; }
    return !fs.existsSync(file);
  };
  // the leftover a failed rollback left behind (see above): what is recorded, whether the saved connection is it, forgetting it
  const record = file + LEFTOVER_SUFFIX;
  const recorded = () => { try { const v = JSON.parse(fs.readFileSync(record, 'utf8')); return v && v.version === 1 && HEX64.test(v.connection) ? v.connection : null; } catch { return null; } };
  const isLeftover = () => { const at = recorded(), now = service.fingerprint(); return !!at && at === now; };
  const forget = () => { try { fs.unlinkSync(record); } catch {} };
  const sealedOrNot = (removed, code) => { if (removed) forget(); return { code: removed ? code : 'NOT_DELETED', file }; };
  // A prior successful wipe followed by failed unlink is cleanup, not an unreadable configuration.
  if (raw.length > 0 && raw.length <= SEED_MAX_BYTES && /^\0+$/.test(raw)) return sealedOrNot(remove(), 'SEED_CLEANED');
  const seed = parseSeed(raw);
  raw = null;
  if (!seed) return { code: 'SEED_INVALID', file };
  const now = service.get();
  // already paused this run: say again which it is
  if (now && now.code === 'SEED_CONFLICT') { seed.apiKey = null; return { code: isLeftover() ? 'SEAL_FAILED_LEFTOVER' : 'SEED_CONFLICT', file }; }
  if (now && now.configured) {
    const same = service.matches(seed);
    seed.apiKey = null;
    // not the seed's: never ALREADY_CONFIGURED, never the seed deleted. The recorded leftover of a failed sealing has its own
    // code; any other connection is one she set up herself (SEED_CONFLICT).
    if (!same) { service.blockSeedConnection(); return { code: isLeftover() ? 'SEAL_FAILED_LEFTOVER' : 'SEED_CONFLICT', file }; }
    return sealedOrNot(remove(), 'ALREADY_CONFIGURED');
  }
  forget();   // no connection saved: an old record names nothing any more
  if (!encryptionAvailable()) return { code: 'NO_ENCRYPTION', file };
  const r = service.configure({ provider: seed.provider, model: seed.model, apiKey: seed.apiKey });
  if (!r || r.ok === false || !r.configured) { seed.apiKey = null; return { code: 'CONFIG_FAILED', file }; }
  const same = service.matches({ provider: seed.provider, model: seed.model, apiKey: seed.apiKey });
  seed.apiKey = null;
  if (!same) {
    const undone = service.deleteConnection();
    if (undone && undone.code === 'CONNECTION_DELETED') return { code: 'VERIFY_FAILED', file };
    service.blockSeedConnection();
    // best effort: without the record a later launch still keeps the seed and pauses the AI, only as SEED_CONFLICT
    const at = service.fingerprint();
    if (at) { try { fs.writeFileSync(record, JSON.stringify({ version: 1, connection: at })); } catch {} }
    return { code: 'VERIFY_FAILED_NOT_UNDONE', file };
  }
  return sealedOrNot(remove(), 'SEALED');
}

module.exports = { SEED_NAME, LEFTOVER_SUFFIX, parseSeed, seedText, importSeed };
