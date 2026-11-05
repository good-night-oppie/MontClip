'use strict';
/* 「has fewer channels」提示条中文化 (WIP 2): when a media file's channel count drops and linked audio
   stems are removed, the toast was hardcoded English. It now goes through uiText with an own-table
   entry, so the Chinese interface never shows that English sentence. Wording is a draft until JJ
   finalizes it (草稿，待 JJ 定稿); the test locks the draft so JJ's final wording replaces both. */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const prefs = fs.readFileSync(path.join(ROOT, 'ui-preferences.js'), 'utf8');

test('the fewer-channels toast is no longer a hardcoded English sentence', () => {
  a.ok(!app.includes('has fewer channels — removed'), 'the English sentence is gone from app.js');
  a.match(app, /toast\(uiText\("own\.channels-fewer", \{ name: m\.name, n: removed \}\)\);/,
    'it says it through uiText with the file name and the count');
});

test('the own table carries the draft in both languages, and the Chinese has no English sentence', () => {
  const row = prefs.match(/"channels-fewer": \["([^"]*)", "([^"]*)"\]/);
  a.ok(row, 'own.channels-fewer exists');
  const [, en, zh] = row;
  a.ok(en.includes('{name}') && en.includes('{n}'), 'English keeps both placeholders');
  a.ok(zh.includes('{name}') && zh.includes('{n}'), 'Chinese keeps both placeholders');
  a.ok(!/has fewer channels|linked audio clip/i.test(zh), 'no English left in the Chinese wording');
  a.ok(/声道/.test(zh) && /删掉|删除/.test(zh), 'the Chinese is plain wording about fewer channels');
});

test('the toast uses the interface language at show time (uiText, not a pre-baked string)', () => {
  // the call sits inside the channel-sync branch, after `else if (removed)`
  const i = app.indexOf('own.channels-fewer');
  a.ok(i > 0);
  a.match(app.slice(Math.max(0, i - 120), i), /else if \(removed\)\s*toast\(uiText\("$/);
});
