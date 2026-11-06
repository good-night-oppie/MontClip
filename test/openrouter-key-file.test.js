'use strict';
// The real-model tests' OpenRouter key (incident 2026-11-04, Deja): only ~/.openrouter-montclip or MONTCLIP_OPENROUTER_KEY_FILE,
// never the old ~/.openrouter-token; a file anyone else can read is refused; the key never reaches a reason or the report.
// Synthetic keys only.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const K = require('../real-tests/key-file.cjs');
const FAKE = 'sk-or-v1-synthetic-test-key-0000';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mc-key-'));
const posix = process.platform !== 'win32';

test('the key is looked for in ~/.openrouter-montclip, or where MONTCLIP_OPENROUTER_KEY_FILE says; nowhere else', () => {
  const home = tmp();
  a.equal(K.keyFilePath({}, home), path.join(home, '.openrouter-montclip'));
  a.equal(K.keyFilePath({ MONTCLIP_OPENROUTER_KEY_FILE: path.join(home, 'other') }, home), path.join(home, 'other'));
  // the old file is not a fallback
  fs.writeFileSync(path.join(home, '.openrouter-token'), FAKE, { mode: 0o600 });
  const r = K.readKey({ env: {}, home, platform: 'linux' });
  a.equal(r.key, undefined);
  a.match(r.skip, /no key file at .*\.openrouter-montclip/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'real-tests', 'openrouter.integration.cjs'), 'utf8');
  a.doesNotMatch(src, /openrouter-token/);
  a.match(src, /K\.readKey\(\)/);
});

test('a key file wider than 600 is refused, the tests are skipped and the reason says why (without the key)', () => {
  const home = tmp(), file = path.join(home, '.openrouter-montclip');
  fs.writeFileSync(file, FAKE + '\n');
  fs.chmodSync(file, 0o644);
  const r = K.readKey({ env: {}, home, platform: 'linux' });
  a.equal(r.key, undefined);
  a.match(r.skip, /wider than 600: not read/);
  a.ok(!r.skip.includes(FAKE));
  // where the mode cannot be checked (Windows), the file is not read either
  const w = K.readKey({ env: {}, home, platform: 'win32' });
  a.equal(w.key, undefined);
  a.match(w.skip, /cannot be checked on Windows/);
});

test('a key file another user owns is not read (QQ on #124)', () => {
  const home = tmp(), file = path.join(home, '.openrouter-montclip');
  fs.writeFileSync(file, FAKE, { mode: 0o600 });
  const r = K.readKey({ env: {}, home, platform: 'linux', uid: fs.statSync(file).uid + 1 });
  a.equal(r.key, undefined);
  a.match(r.skip, /belongs to another user: not read/);
  a.ok(!r.skip.includes(FAKE));
});

test('a 600 key file is read', { skip: !posix && 'Windows files have no owner-only mode' }, () => {
  const dir = tmp(), file = path.join(dir, 'k');
  fs.writeFileSync(file, FAKE + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  a.deepEqual(K.readKey({ env: { MONTCLIP_OPENROUTER_KEY_FILE: file }, home: dir, platform: process.platform }), { key: FAKE });
  fs.writeFileSync(file, '  \n');
  a.match(K.readKey({ env: { MONTCLIP_OPENROUTER_KEY_FILE: file }, home: dir, platform: process.platform }).skip, /is empty/);
});

test('the key never reaches the report: scrubbed text is written, a report holding it is refused and nothing is written', () => {
  const dir = tmp(), out = path.join(dir, 'report.json'), scrub = K.scrubber(FAKE);
  const reply = 'echo: ' + FAKE + ' and again ' + FAKE;
  const text = K.writeReport(out, { results: [{ name: 'x', reply: scrub(reply) }] }, FAKE);
  a.ok(!text.includes(FAKE));
  a.ok(!fs.readFileSync(out, 'utf8').includes(FAKE));
  a.match(fs.readFileSync(out, 'utf8'), /echo: <key> and again <key>/);
  const out2 = path.join(dir, 'leak.json');
  a.throws(() => K.writeReport(out2, { results: [{ reply }] }, FAKE), /key would be written to the report/);
  a.equal(fs.existsSync(out2), false);
});
