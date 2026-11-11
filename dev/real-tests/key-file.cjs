'use strict';
// Where the real-model tests find the OpenRouter key, and how its report is written (incident 2026-11-04, Deja).
// The key is in ~/.openrouter-montclip (on europa, mode 600), or in the file MONTCLIP_OPENROUTER_KEY_FILE names. There is
// no other place it is looked for. A file anyone but its owner can read is refused, and the tests are skipped with the
// reason; so is a file another user owns, and a system whose files have no owner-only mode (Windows): the real-model
// tests run on europa only. MONTCLIP_OPENROUTER_KEY_FILE is only for a local override on europa.
// Neither the key nor any part of it is ever printed, logged or written: reasons name the file, never what is in it.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const DEFAULT_NAME = '.openrouter-montclip';

function keyFilePath(env = process.env, home = os.homedir()) {
  return env.MONTCLIP_OPENROUTER_KEY_FILE ? path.resolve(env.MONTCLIP_OPENROUTER_KEY_FILE) : path.join(home, DEFAULT_NAME);
}

/** {key} or {skip: reason}. */
function readKey({ env = process.env, home = os.homedir(), platform = process.platform,
  uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  const file = keyFilePath(env, home);
  let st;
  try { st = fs.statSync(file); } catch { return { skip: 'no key file at ' + file }; }
  if (!st.isFile()) return { skip: file + ' is not a file' };
  if (platform === 'win32') return { skip: 'the key file\'s permissions cannot be checked on Windows; the real-model tests run on europa' };
  if (uid != null && st.uid !== uid) return { skip: file + ' belongs to another user: not read' };
  const mode = st.mode & 0o777;
  if (mode & 0o077) return { skip: file + ' is mode ' + mode.toString(8) + ', wider than 600: not read (chmod 600 ' + file + ')' };
  let key;
  try { key = fs.readFileSync(file, 'utf8').trim(); } catch (e) { return { skip: file + ' could not be read (' + (e.code || 'error') + ')' }; }
  return key ? { key } : { skip: file + ' is empty' };
}

/** Every occurrence of the key in a string becomes <key>. */
const scrubber = (key) => (s) => (key ? String(s).split(key).join('<key>') : String(s));

/** Writes the report as JSON; refuses (throws, writes nothing) if the key would be in it. */
function writeReport(file, report, key) {
  const text = JSON.stringify(report, null, 1);
  if (key && text.includes(key)) throw new Error('key would be written to the report');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text + '\n');
  return text;
}

module.exports = { DEFAULT_NAME, keyFilePath, readKey, scrubber, writeReport };
