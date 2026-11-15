'use strict';
// Where the Meta real-model test finds its key: ~/.meta-montclip (on europa, mode 600, written there by the owner over
// SSH), or the file MONTCLIP_META_KEY_FILE names. The rules are #124's (dev/real-tests/key-file.cjs for OpenRouter): no other
// place is looked in; a file anyone but its owner can read is refused and the test is skipped with the reason; so is a
// file another user owns, and a system whose files have no owner-only mode (Windows). The key, or any part of it, is
// never printed, logged or written: reasons name the file, never what is in it.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const DEFAULT_NAME = '.meta-montclip';

function keyFilePath(env = process.env, home = os.homedir()) {
  return env.MONTCLIP_META_KEY_FILE ? path.resolve(env.MONTCLIP_META_KEY_FILE) : path.join(home, DEFAULT_NAME);
}

/** {key, file} or {skip: reason}. */
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
  return key ? { key, file } : { skip: file + ' is empty' };
}

/** Every occurrence of the key in a string becomes <key>. */
const scrubber = (key) => (s) => (key ? String(s).split(key).join('<key>') : String(s));

module.exports = { DEFAULT_NAME, keyFilePath, readKey, scrubber };
