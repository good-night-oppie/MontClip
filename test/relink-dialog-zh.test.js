'use strict';
// The Relink dialog (「找回录像」) in Chinese: JJ's 18 lines, word for word, from the comment on #137
// (https://github.com/good-night-oppie/MontClip/pull/137#issuecomment-6689300818). JJ gave no English, so the English is
// what the dialog said before, kept as a draft (marked in the table). The row's small line names the file only (never its
// /media/… path) and gives the length as h:mm:ss, or m:ss under an hour (no frames) — only in this dialog.
// Synthetic names and numbers only. Not run here: the real window, the English interface, a real failed copy.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences');
const MediaLib = require('../media-lib');
const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8');
const t = (l, k, v) => V.t(l, 'own.' + k, v);
const KEYS = ['rl-title', 'rl-intro-many', 'rl-intro-one', 'rl-folder', 'rl-folder-title', 'rl-pre', 'rl-folder-none', 'rl-copying-k',
  'rl-matched', 'rl-copying', 'rl-copy-failed', 'rl-was', 'rl-new-loc', 'rl-leave', 'rl-not-found', 'rl-chosen', 'rl-from-folder',
  'rl-browse', 'rl-browse-title', 'rl-cancel', 'rl-apply', 'rl-apply-n'];
const dialog = app.slice(app.indexOf('async function openRelinkDialog'), app.indexOf('/* ── Proxies'));

test('JJ\'s 18 lines, word for word', () => {
  a.equal(t('zh-CN', 'rl-title'), '找回录像');                                                                     // 1
  a.equal(t('zh-CN', 'rl-intro-many', { n: 3 }), '选一下这 3 个录像现在放在哪，时间线上的片段和剪辑都不会变。');       // 2
  a.equal(t('zh-CN', 'rl-intro-one'), '选一下这个录像现在放在哪，时间线上的片段和剪辑都不会变。');                    // 3
  a.equal(t('zh-CN', 'rl-folder'), '选文件夹…');                                                                    // 4
  a.equal(t('zh-CN', 'rl-folder-title'), '选录像现在所在的文件夹，按文件名对上后复制进项目');                          // 5
  a.equal(t('zh-CN', 'rl-pre', { pre: 1, n: 2 }), '已在项目文件夹里找到 1 个（共 2 个）');                            // 6
  a.equal(t('zh-CN', 'rl-folder-none', { n: 2, files: 7 }), '这个文件夹里没有和这 2 个录像同名的文件。换个文件夹，或点〔选文件…〕一个个找。');   // 7
  a.equal(t('zh-CN', 'rl-copying-k', { i: 1, n: 2, name: 'tone-a.mp4' }), '正在复制第 1 个（共 2 个）：tone-a.mp4…');  // 8
  a.equal(t('zh-CN', 'rl-matched', { x: 1, n: 2 }), '按文件名对上了 1 个（共 2 个）');                               // 9
  a.equal(t('zh-CN', 'rl-copying', { name: 'tone-a.mp4' }), '正在复制 tone-a.mp4…');                               // 10
  a.equal(t('zh-CN', 'rl-copy-failed', { name: 'tone-a.mp4' }), 'tone-a.mp4 没能复制进项目。请再点〔选文件…〕试一次。');   // 11
  a.equal(t('zh-CN', 'rl-was', { file: 'tone-a.mp4' }), '原文件：tone-a.mp4');                                    // 12
  a.equal(t('zh-CN', 'rl-new-loc'), '新位置');                                                                     // 13
  a.equal(t('zh-CN', 'rl-leave'), '— 先不处理 —');                                                                 // 14
  a.equal(t('zh-CN', 'rl-not-found'), '— 没找到：点〔选文件…〕或〔选文件夹…〕 —');                                  // 15
  a.equal(t('zh-CN', 'rl-why-same'), '同名');                                                                      // 16
  a.equal(t('zh-CN', 'rl-why-other-type'), '同名，格式不同');
  a.equal(t('zh-CN', 'rl-why-similar'), '名字相近');
  a.equal(t('zh-CN', 'rl-why-size'), '大小一样');
  a.equal(t('zh-CN', 'rl-chosen', { name: 'tone-a.mp4' }), 'tone-a.mp4（你选的）');                                // 17
  a.equal(t('zh-CN', 'rl-from-folder', { name: 'tone-a.mp4' }), 'tone-a.mp4（从文件夹里找到）');
  a.equal(t('zh-CN', 'rl-browse'), '选文件…');                                                                     // 18
  a.equal(t('zh-CN', 'rl-browse-title'), '选这个录像文件（会复制进项目）');
  a.equal(t('zh-CN', 'rl-cancel'), '取消');
  a.equal(t('zh-CN', 'rl-apply'), '找回');
  a.equal(t('zh-CN', 'rl-apply-n', { n: 2 }), '找回 2 个');
});

test('the match reasons: relinkScore keeps its English ids; the dialog maps them to JJ\'s words, 「，大小也一样」 after a name', () => {
  const why = (w) => MediaLib.relinkWhyKeys(w).map((k) => t('zh-CN', k)).join('');
  const m = { name: 'tone-a.mp4', src: '/media/tone-a.mp4', size: 1000, kind: 'video' };
  const ids = [['tone-a.mp4', 1000], ['tone-a.mp4', 5], ['tone-a.mov', 1000], ['tone-a.mov', 5], ['tone-a-copy.mp4', 5], ['zzz.mp4', 1000]]
    .map(([name, size]) => MediaLib.relinkScore(m, { name, size }).why);
  a.deepEqual(ids, ['same name and size', 'same name', 'same name, other type and size', 'same name, other type', 'similar name', 'same size'], 'the ids are unchanged');
  a.deepEqual(ids.map(why), ['同名，大小也一样', '同名', '同名，格式不同，大小也一样', '同名，格式不同', '名字相近', '大小一样']);
  a.equal(why('similar name and size'), '名字相近，大小也一样');
  // the English as before
  a.deepEqual(ids.map((w) => MediaLib.relinkWhyKeys(w).map((k) => t('en', k)).join('')), ids);
  a.deepEqual(MediaLib.relinkWhyKeys(''), []);
});

test('the length: h:mm:ss, or m:ss under an hour, no frames', () => {
  a.equal(MediaLib.fmtHms(5423), '1:30:23');
  a.equal(MediaLib.fmtHms(59), '0:59');
  a.equal(MediaLib.fmtHms(59.97), '0:59', 'seconds are cut, not rounded up');
  a.equal(MediaLib.fmtHms(605), '10:05');
  a.equal(MediaLib.fmtHms(3600), '1:00:00');
  a.equal(MediaLib.fmtHms(0), '');
  a.equal(MediaLib.fmtHms(undefined), '');
});

test('each row\'s small line: the file\'s name only, its length and size', () => {
  const m = { name: 'shown name.mp4', src: '/media/day%201/tone%20b.mp4?v=2', duration: 5423, size: 1536 };
  const line = MediaLib.relinkWasParts(m);
  a.deepEqual(line, ['tone b.mp4', '1:30:23', MediaLib.fmtSize(1536)]);
  a.ok(!line.join(' ').includes('/'), 'no folders');
  a.equal(t('zh-CN', 'rl-was', { file: line[0] }) + ' · ' + line.slice(1).join(' · '), '原文件：tone b.mp4 · 1:30:23 · ' + MediaLib.fmtSize(1536));
  a.deepEqual(MediaLib.relinkWasParts({ src: '/media/x.mp4' }), ['x.mp4'], 'no length or size when unknown');
  // the dialog writes the line from these parts, never from the src
  a.match(dialog, /MediaLib\.relinkWasParts\(m\)/);
  a.doesNotMatch(dialog, /"was "/);
});

test('the dialog speaks only through the keys: none of its English is left in the code', () => {
  for (const s of ['Relink media', 'Point ', 'these ${', 'this file', 'Choose folder…', 'Pick the folder', 'Found ${pre}', 'None of the',
    'Copying', 'Matched ', "Couldn't copy", 'New location', 'leave it', 'not found: Browse', '(chosen)', '(from the folder)',
    'Browse…', 'Pick the file', '>Cancel<', '>Relink<', '`Relink ${', '"Relink"', '(${o.why})'])
    a.ok(!dialog.includes(s), 'still in the dialog: ' + s);
  for (const k of KEYS)
    a.ok(dialog.includes('"own.' + k + '"'), 'the dialog uses own.' + k);
  a.match(dialog, /MediaLib\.relinkWhyKeys\(o\.why\)/);
});

test('the English drafts are what the dialog said before', () => {
  a.equal(t('en', 'rl-title'), 'Relink media');
  a.equal(t('en', 'rl-intro-many', { n: 3 }), 'Point these 3 files at the footage where it is now. Clips keep their In points and edits.');
  a.equal(t('en', 'rl-intro-one'), 'Point this file at the footage where it is now. Clips keep their In points and edits.');
  a.equal(t('en', 'rl-folder-none', { n: 2, files: 7 }), 'None of the 7 files in that folder match by name.');
  a.equal(t('en', 'rl-copying-k', { i: 1, n: 2, name: 'tone-a.mp4' }), 'Copying 1/2: tone-a.mp4…');
  a.equal(t('en', 'rl-copy-failed', { name: 'tone-a.mp4' }), "Couldn't copy tone-a.mp4");
  a.equal(t('en', 'rl-apply-n', { n: 2 }), 'Relink 2');
  // and none of the Chinese has English left in it (file names and numbers aside)
  for (const k of KEYS.concat(['rl-why-same', 'rl-why-other-type', 'rl-why-similar', 'rl-why-size', 'rl-why-and-size']))
    a.doesNotMatch(t('zh-CN', k, { n: 2, pre: 1, files: 7, i: 1, x: 1, name: '', file: '' }), /[A-Za-z]/, k);
});
