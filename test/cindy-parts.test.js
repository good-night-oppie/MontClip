'use strict';
// The assistant pane's parts taken from makecindy/cindy@43001ea (Deja, 2026-11-04): unchanged copies, the stand-ins
// recorded with what they replace, every bundled npm package's license, and the strings. Reads committed files only
// (agent-ui's own node_modules are not installed in CI).
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const UI = path.join(__dirname, '../agent-ui'), ROOT = path.join(UI, 'cindy-43001ea');
const { COMMIT, ENTRIES, STAND_INS } = require('../agent-ui/cindy-resolve.cjs');
const sources = require('../agent-ui/SOURCES.json');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');

test('the parts are byte-identical to makecindy/cindy at 43001ea, and every copied file is recorded', () => {
  assert.equal(COMMIT, '43001eaaa31ef322de9ae148c4051087277d6198');
  assert.equal(sources.parts.commit, COMMIT);
  assert.equal(sources.parts.root, 'cindy-43001ea');
  const recorded = new Set();
  for (const f of sources.parts.files) {
    const b = fs.readFileSync(path.join(ROOT, f.file));
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'), f.sha256, f.file);
    assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])).digest('hex'), f.blob, f.file);
    recorded.add(f.file);
  }
  assert.deepEqual(walk(ROOT).map(rel).sort(), [...recorded].sort(), 'no file in cindy-43001ea that SOURCES.json does not record');
  for (const e of ENTRIES) assert.ok(recorded.has(e), 'entry copied: ' + e);
  for (const f of ['LICENSE', 'NOTICE']) assert.ok(recorded.has(f));
  // Cindy's terms did not change between the two commits MontClip takes code from
  for (const f of ['LICENSE', 'NOTICE']) assert.deepEqual(fs.readFileSync(path.join(ROOT, f)), fs.readFileSync(path.join(UI, 'upstream', f)), f);
});

test('a stand-in replaces each Cindy file that is not copied, and says what it replaces and why', () => {
  for (const [target, [file, why]] of Object.entries(STAND_INS)) {
    assert.ok(why.length > 20, 'a reason for ' + target);
    for (const ext of ['.ts', '.tsx']) assert.ok(!fs.existsSync(path.join(ROOT, target + ext)), 'not copied: ' + target);
    const text = fs.readFileSync(path.join(UI, 'stand-ins', file), 'utf8');
    assert.match(text.split('\n')[0], /stand-in|MontClip's own/, file + ' starts by saying what it is');
  }
  // nothing in the stand-ins talks to Cindy's main process or records sound
  for (const f of fs.readdirSync(path.join(UI, 'stand-ins'))) {
    const text = fs.readFileSync(path.join(UI, 'stand-ins', f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(text, /electronAPI|getUserMedia|ipcRenderer|fetch\(/, f);
  }
});

test('every npm package in the bundle has its version and full license recorded', () => {
  // in cindy-official.js (BUNDLED-PACKAGES) and in cindy-parts.css (STYLE-PACKAGES: Tailwind's preflight and rules)
  const packages = [...new Set([...require('../agent-ui/BUNDLED-PACKAGES.json'), ...require('../agent-ui/STYLE-PACKAGES.json')])];
  const registry = require('../agent-ui/BUNDLED-LICENSES.json'), lock = require('../agent-ui/package-lock.json');
  assert.ok(packages.includes('tailwindcss'));
  const notice = fs.readFileSync(path.join(UI, 'THIRD-PARTY-NOTICES.txt'), 'utf8').replace(/\r\n/g, '\n');
  assert.deepEqual(Object.keys(registry).sort(), [...packages].sort(), 'the registry lists exactly the bundled packages');
  for (const name of ['@radix-ui/react-popover', '@radix-ui/react-tooltip', '@radix-ui/react-alert-dialog', 'i18next', 'react-i18next']) assert.ok(packages.includes(name), name);
  for (const name of packages) {
    assert.equal(lock.packages['node_modules/' + name].version, registry[name].version, name + ' version');
    const marker = '\n' + name + '/LICENSE\n', start = notice.indexOf(marker);
    assert.ok(start >= 0, 'full license of ' + name);
    let tail = notice.slice(start + marker.length);
    if (registry[name].note) { assert.ok(tail.startsWith('(' + registry[name].note + ')\n'), name + ' says where its text comes from'); tail = tail.slice(registry[name].note.length + 3); }
    const end = tail.search(/\n(?:@?[a-z0-9][a-z0-9@/._-]*\/LICENSE\n)/i), text = (end < 0 ? tail : tail.slice(0, end)).trim();
    assert.equal(crypto.createHash('sha256').update(text).digest('hex'), registry[name].licenseSha256, name + ' license text');
  }
});

test('the parts are in the page bundle, under window.MontClipCindyParts', () => {
  const bundle = fs.readFileSync(path.join(__dirname, '../cindy-official.js'), 'utf8');
  assert.match(bundle, /MontClipCindyParts/);
  assert.match(bundle, /43001eaaa31ef322de9ae148c4051087277d6198/);
  for (const name of ['PermissionSelector', 'JumpToBottomChip', 'InlineReferenceChip', 'TodoListCard', 'ErrorMessageCard', 'WorkGroupBlock', 'ThinkingCard', 'ToolCallCard', 'AskUserQuestionPrompt'])
    assert.ok(bundle.includes(name + ':') || bundle.includes('"' + name + '"'), name + ' registered');
  assert.doesNotMatch(bundle, /electronAPI\.maker\b/, "Cindy's capability IPC is not in the bundle (the stand-in gives the modes)");
});

test("the strings: Cindy's own for zh-CN and en, at 43001ea, the same keys in both; MontClip's words only where recorded", () => {
  const strings = require('../agent-ui/cindy-strings.json'), own = require('../agent-ui/montclip-strings.json');
  assert.equal(strings.source.commit, COMMIT);
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]);
  // the same keys, except English's _one plural forms (Chinese has one form; a missing zh-CN key would fall back to English)
  const zh = new Set(keys(strings['zh-CN'])), en = keys(strings.en);
  assert.ok([...zh].every((k) => en.includes(k)));
  assert.deepEqual(en.filter((k) => !zh.has(k) && !k.endsWith('_one')), []);
  assert.ok(keys(strings['zh-CN']).length > 100);
  assert.deepEqual(keys(own['zh-CN']).sort(), keys(own.en).sort());
  assert.ok(keys(own['zh-CN']).every((k) => k.startsWith('newChat.permissionSelector.')), 'MontClip replaces only the mode switch words here');
  assert.equal(own['zh-CN'].newChat.permissionSelector.modes['claude-code'].bypassPermissions.label, 'Yolo');
  assert.equal(own['zh-CN'].newChat.permissionSelector.modes['claude-code'].ask.label, '手动');
});
