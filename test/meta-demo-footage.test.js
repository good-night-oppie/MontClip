'use strict';
/* dev/real-tests/meta-demo-footage.cjs records the Muse Spark demo takes. It must never carry or leak a
   key: the only source is dev/real-tests/meta-key-file.cjs (same rules as #124), every line out is
   scrubbed, and nothing runs without an explicit MONTCLIP_REAL_MODELS=1 plus a fresh profile. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const FILE = path.join(__dirname, '..', 'dev/real-tests', 'meta-demo-footage.cjs');

test('the demo footage script is present and parses', () => {
  a.ok(fs.existsSync(FILE), 'dev/real-tests/meta-demo-footage.cjs is committed');
  new Function(fs.readFileSync(FILE, 'utf8'));
});

test('the key comes only from meta-key-file.cjs and is scrubbed from everything written', () => {
  const s = fs.readFileSync(FILE, 'utf8');
  a.match(s, /require\('\.\/meta-key-file\.cjs'\)\.readKey\(\)/, 'the only key source');
  a.ok(!/process\.env\.[A-Z_]*KEY|api[_-]?key\s*[:=]\s*['"][^'"]/i.test(s), 'no key from an env var or a literal');
  a.match(s, /hide=s=>String\(s\)\.split\(KEY\)\.join\('<key>'\)/, 'every output goes through the scrubber');
  a.match(s, /hide\(JSON\.stringify\(result,null,1\)\)/, 'the result file is scrubbed');
  a.match(s, /hide\(lines\.join\('\\n'\)\)/, 'the shotlist is scrubbed');
});

test('it runs only on an explicit real-models flag with a fresh profile, and never records the settings', () => {
  const s = fs.readFileSync(FILE, 'utf8');
  a.match(s, /process\.env\.MONTCLIP_REAL_MODELS!=='1'\)throw Error\('Explicit run with MONTCLIP_REAL_MODELS=1 required'\)/);
  a.match(s, /A fresh --user-data-dir is required/);
  a.match(s, /if\(await read\(`!!document\.querySelector\('\.cindy-config'\)`\)\)return;/, 'no frame while the settings are open');
  a.match(s, /keyEmpty/, 'asserts the key field is empty before anything is typed');
});
