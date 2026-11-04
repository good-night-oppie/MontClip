'use strict';
/* A private test package's one-time key (Deja, 2026-11-04; the owner: 「配置好再打包，私下打包，不发布」).
   desktop/package-win.cjs --private-seed puts one streamer's DeepSeek key in resources/montclip-seed-v1.json:
     {"version":1,"provider":"deepseek","model":"<id given at packaging>","apiKey":"<the key>"}
   On the first launch the main process seals it into agent-connection-v1.json through the AI service's own
   configure() (Electron safeStorage), then deletes the seed and checks that it is gone.
   - safeStorage unavailable: nothing is written, the seed stays for a later launch, and the streamer is told in plain
     words. The key is never saved in plain text anywhere else.
   - A connection already saved: it is kept; the seed is deleted unused.
   - The seed is read once, never logged; results carry codes and paths only, never the key or any part of it. */
const SEED_NAME = 'montclip-seed-v1.json';
const SEED_MAX_BYTES = 8192;
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
 *  NO_SEED · SEALED · ALREADY_CONFIGURED (deleted unused) · NOT_DELETED (sealed or unused, but the file could not be removed:
 *  the streamer is asked to delete it) · NO_ENCRYPTION (nothing written, the seed kept) · SEED_INVALID (kept, untouched) ·
 *  CONFIG_FAILED (the service refused it; the seed kept). */
function importSeed({ file, fs = require('node:fs'), service, encryptionAvailable }) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return { code: e && e.code === 'ENOENT' ? 'NO_SEED' : 'SEED_INVALID', file }; }
  const remove = () => {
    try { fs.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') return false; }
    return !fs.existsSync(file);
  };
  const seed = parseSeed(raw);
  raw = null;
  if (!seed) return { code: 'SEED_INVALID', file };
  const now = service.get();
  if (now && now.configured) return { code: remove() ? 'ALREADY_CONFIGURED' : 'NOT_DELETED', file };
  if (!encryptionAvailable()) return { code: 'NO_ENCRYPTION', file };
  const r = service.configure({ provider: seed.provider, model: seed.model, apiKey: seed.apiKey });
  seed.apiKey = null;
  if (!r || r.ok === false || !r.configured) return { code: 'CONFIG_FAILED', file };
  return { code: remove() ? 'SEALED' : 'NOT_DELETED', file };
}

module.exports = { SEED_NAME, parseSeed, seedText, importSeed };
