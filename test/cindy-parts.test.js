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
  // the mode switch words, and the two words the build puts in ThinkingCard's JSX (PATCHES)
  assert.ok(keys(own['zh-CN']).every((k) => k.startsWith('newChat.permissionSelector.') || ['chat.thinking.inProgress', 'chat.thinking.hidden'].includes(k)), 'MontClip replaces only the mode switch words here');
  assert.equal(own['zh-CN'].newChat.permissionSelector.modes['claude-code'].bypassPermissions.label, 'Yolo');
  assert.equal(own['zh-CN'].newChat.permissionSelector.modes['claude-code'].ask.label, '手动');
});

test('the mode capsule says each mode in v7.2 §3 words, the same sentence as the rest of MontClip (Deja, 2026-11-04)', () => {
  const own = require('../agent-ui/montclip-strings.json'), View = require('../ui-preferences');
  const desc = (l, id) => own[l].newChat.permissionSelector.modes['claude-code'][id].description;
  // v7.2 §3, word for word, full stops included
  assert.equal(desc('zh-CN', 'plan'), '只出计划，不改项目。');
  assert.equal(desc('zh-CN', 'ask'), '改项目前先问你；撤不回的每次都问。默认是这个。');
  assert.equal(desc('zh-CN', 'auto'), '能撤销的直接做，撤不回的先问你。');
  assert.equal(desc('zh-CN', 'bypassPermissions'), '每一步都直接做，不问你；往外发的内容照样先给你看。');
  // …and the sentence MontClip already says for that mode (#84: the mode buttons' tips, the Yolo bar). Change one, this fails.
  for (const [l, stop, def] of [['zh-CN', '。', '默认是这个。'], ['en', '.', 'This is the default.']]) {
    const T = (k) => View.text[l]['officialPane_' + k];
    assert.equal(desc(l, 'plan'), T('modePlanTip') + stop, l + ' plan');
    assert.equal(desc(l, 'ask'), T('modeManualTip') + stop + (l === 'en' ? ' ' : '') + def, l + ' manual');
    assert.equal(desc(l, 'auto'), T('modeAutoTip') + stop, l + ' auto');
    assert.equal(desc(l, 'bypassPermissions'), T('modeYoloTip') + stop, l + ' Yolo');
  }
  assert.equal('Yolo 开着：AI ' + desc('zh-CN', 'bypassPermissions'), View.text['zh-CN'].officialPane_yoloOn, 'the Yolo bar says the same');
  assert.equal(desc('en', 'bypassPermissions'), 'Does every step without asking you; anything sent out is still shown to you first.');
  // the old wording is gone
  assert.ok(!JSON.stringify(own).includes('全都直接做'));
});

test('Chinese words where Cindy writes English in its JSX: ThinkingCard\'s title, put in by the build, the copied file unchanged (VV on f3df7db)', () => {
  const { PATCHES, patched } = require('../agent-ui/cindy-resolve.cjs'), own = require('../agent-ui/montclip-strings.json');
  assert.deepEqual(Object.keys(PATCHES), ['apps/desktop/src/renderer/components/chat/ThinkingCard.tsx']);
  const file = Object.keys(PATCHES)[0], text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // each piece is there exactly once, and only that piece changes: Thinking → t('chat.thinking.inProgress'), Thinking hidden → t('chat.thinking.hidden')
  for (const [from] of PATCHES[file]) assert.equal(text.split(from).length, 2, from);
  const out = patched(file, text);
  assert.equal(out.split('\n').length, text.split('\n').length);
  const changed = out.split('\n').map((l, i) => [text.split('\n')[i], l]).filter(([a, b]) => a !== b);
  assert.deepEqual(changed.map(([a, b]) => [a.trim(), b.trim()]), [['Thinking hidden', "{t('chat.thinking.hidden')}"], ['Thinking', "{t('chat.thinking.inProgress')}"]]);
  // the same with a Windows checkout's CRLF (vendor-cindy.cjs reads one)
  assert.equal(patched(file, text.replace(/\n/g, '\r\n')), out.replace(/\n/g, '\r\n'));
  // the words, in both languages
  assert.equal(own['zh-CN'].chat.thinking.inProgress, '正在想');
  assert.equal(own.en.chat.thinking.inProgress, 'Thinking');
  assert.ok(own['zh-CN'].chat.thinking.hidden && !/[a-z]/i.test(own['zh-CN'].chat.thinking.hidden));
  assert.equal(own.en.chat.thinking.hidden, 'Thinking hidden');
  // in the bundle
  const bundle = fs.readFileSync(path.join(__dirname, '../cindy-official.js'), 'utf8');
  assert.match(bundle, /chat\.thinking\.inProgress/);
  assert.doesNotMatch(bundle, /children:"Thinking"/);
});

test('how long the AI took: words in Chinese (58 秒, 1 分 29 秒), Cindy\'s own in English (58s, 1m 29s) (v7.2; VV on f3df7db)', () => {
  const { durationZh } = require('../agent-ui/stand-ins/durationWords.cjs'), strings = require('../agent-ui/cindy-strings.json');
  assert.equal(durationZh(12000), '12 秒');
  assert.equal(durationZh(58000), '58 秒');
  assert.equal(durationZh(89000), '1 分 29 秒');
  assert.equal(durationZh(88400), '1 分 28 秒');
  assert.equal(durationZh(120000), '2 分');
  assert.equal(durationZh(120000, { alwaysShowRemainder: true }), '2 分 0 秒');
  assert.equal(durationZh(0), '1 秒', "Cindy's minimum");
  assert.equal(durationZh(0, { minimumSeconds: 0 }), '0 秒');
  assert.equal(durationZh(NaN), '1 秒');
  assert.equal(durationZh(3_900_000), '1 小时 5 分');
  assert.equal(durationZh(90_000_000), '1 天 1 小时 0 分');
  // what the cards say with it: Cindy's own strings around the time
  const z = strings['zh-CN'].chat, fill = (s, d) => s.replace('{{duration}}', d);
  assert.equal(fill(z.workGroup.worked, durationZh(58000)), '已工作 58 秒');
  assert.equal(fill(z.thinking.completed, durationZh(58000)), '思考 58 秒');
  assert.equal(fill(strings.en.chat.workGroup.worked, '58s'), 'Worked for 58s');
  // the stand-in: Chinese window → durationWords; otherwise Cindy's formatDuration, unchanged
  const standIn = fs.readFileSync(path.join(UI, 'stand-ins/sessionDurationFormat.ts'), 'utf8');
  assert.match(standIn, /import \{ formatDuration \} from '@cindy\/maker-shared\/message-render';/);
  assert.match(standIn, /return i18n\.language === 'zh-CN' \? durationZh\(ms, options\) : formatDuration\(ms, options\);/);
  assert.ok(STAND_INS['apps/desktop/src/renderer/lib/sessionDurationFormat']);
});
