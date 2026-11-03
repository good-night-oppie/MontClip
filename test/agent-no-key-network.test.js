'use strict';
// Deja (11-03, for #51): with a fresh profile and no key, opening the assistant's settings and closing them again
// makes no outside request — none through the main process's sessions, none from the main process itself. The window
// check is desktop/agent-no-key-network-smoke.cjs (AGENT_NO_KEY_NETWORK_PASS); this test keeps it honest: it must
// count every channel and assert zero.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const FILE = path.join(__dirname, '..', 'desktop', 'agent-no-key-network-smoke.cjs');

test('the no-key network smoke exists, refuses to run without a fresh profile, and starts no key of its own', () => {
  a.ok(fs.existsSync(FILE), 'desktop/agent-no-key-network-smoke.cjs');
  const src = fs.readFileSync(FILE, 'utf8');
  a.ok(src.includes("if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');"));
  a.ok(!/\bconfigure\(|apiKey|safeStorage\.encrypt/.test(src), 'no key is ever set');
});
test('it counts every way out of the main process and asserts zero', () => {
  const src = fs.readFileSync(FILE, 'utf8');
  for (const hook of [/session-created/, /onBeforeRequest/, /globalThis\.fetch\s*=/, /\bhttps\b[^\n]*\brequest\b/, /\bhttp\b[^\n]*\brequest\b/, /\bnet\b[^\n]*\b(request|fetch)\b/])
    a.match(src, hook);
  a.match(src, /assert\.deepEqual\(external,\s*\[\]/);
  a.match(src, /assert\.deepEqual\(outbound,\s*\[\]/);
  // the settings page is really opened and closed, with OpenRouter preselected and nothing configured
  a.match(src, /\.cindy-config/);
  a.match(src, /configured,\s*false/);
  a.match(src, /'openrouter'/);
  a.match(src, /AGENT_NO_KEY_NETWORK_PASS/);
});
