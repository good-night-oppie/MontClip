'use strict';
// QQ, review of #26 c52b1457 (2026-11-02): review-body-smoke.cjs could run without --user-data-dir, and its
// configure() would then overwrite the user's own saved key with a dummy. Every script that starts the app
// (require('./main')) or writes settings (configure, view settings) must refuse to run without a fresh profile.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const GUARD = [
  "const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));",
  "if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');",
];
const LAUNCHES = /require\(['"](\.\/main|\.\.\/desktop\/main)['"]\)/;
const WRITES = /\bconfigure\(|updateMontClipView\(|montclipViewSettings\.set\(|montclip:sessions:set|montclipSessions\.set\(/;

const scripts = ['desktop', 'dev/real-tests'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.cjs')).map((f) => `${d}/${f}`));

test('every script that starts the app or writes settings refuses to run without a fresh profile', () => {
  const missing = [];
  for (const f of scripts) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!LAUNCHES.test(src) && !WRITES.test(src)) continue;
    // a runner that only spawns Electron with its own fresh profile does not write anything itself
    if (!LAUNCHES.test(src) && /cp\.spawn\(/.test(src) && /'--user-data-dir='\+/.test(src)) continue;
    const at = src.indexOf(GUARD[0]);
    if (at < 0 || !src.includes(GUARD[1])) { missing.push(f); continue; }
    // and the guard runs before the app is started
    const start = src.search(LAUNCHES);
    if (start >= 0 && start < at) missing.push(f + ' (guard after the app starts)');
  }
  a.deepEqual(missing, []);
});

test('the scan sees the scripts it is meant for', () => {
  for (const f of ['desktop/review-body-smoke.cjs', 'desktop/agent-errors-smoke.cjs', 'dev/real-tests/deepseek-e2e-smoke.cjs'])
    a.ok(scripts.includes(f), f);
});
