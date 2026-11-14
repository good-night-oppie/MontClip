'use strict';
// VV (real window, 2026-11-05): when a recording is moved or deleted, every message about it was English. JJ's wording
// (2026-11-05, two rounds; the second one wins): the bin's strip says which file (or how many) can't be found, with
// 〔找到它…〕 / 〔一个个找回来…〕 (they open the Relink dialog); the card's badge says 「找不到」; the export reminder says what
// the export will do and has 〔先找回来…〕〔照样导出〕; the menu's other-copy item is 〔用另一处的同一段录像…〕. The Show button
// and the corner toast are gone: the strip replaces them. English strings JJ did not give are drafts (marked in the table).
// The real window (strip, dialog, export reminder and a silent export) is desktop/offline-media-smoke.cjs.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../shared/ui-preferences');
const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8');
const t = (l, k, v) => V.t(l, 'own.' + k, v), tp = (l, k, c, v) => V.tp(l, 'own.' + k, c, v);
const ENGLISH = /offline|relink|media offline|\bshow\b/i;

test('JJ\'s Chinese, word for word', () => {
  a.equal(t('zh-CN', 'off-bar-one', { file: 'tone-b.mp4' }), '「tone-b.mp4」找不到了，可能被移走或删掉了。你剪好的都还在，把文件找回来就能接着用。');
  a.equal(t('zh-CN', 'off-find-it'), '找到它…');
  a.equal(t('zh-CN', 'off-bar-many', { n: 3 }), '有 3 个素材找不到了，可能被移走或删掉了。你剪好的都还在，把文件找回来就能接着用。');
  a.equal(t('zh-CN', 'off-find-each'), '一个个找回来…');
  a.equal(t('zh-CN', 'off-badge'), '找不到');
  a.equal(t('zh-CN', 'off-badge-title'), '这个文件找不到了。右键选〔重新链接…〕，把它找回来。');
  a.equal(t('zh-CN', 'off-item-title', { file: 'tone-b.mp4' }), '这个文件找不到了。右键选〔重新链接…〕，把它找回来。', 'no ⚠ in front (Rea)');
  a.equal(t('zh-CN', 'off-export', { n: 2 }), '有 2 个素材找不到了，导出时这几段会显示「找不到」的画面、没有声音。先把它们找回来再导出吧。');
  // only one file missing: JJ's own sentence, never 「有 1 个素材……这几段」
  a.equal(t('zh-CN', 'off-export-one'), '有 1 个素材找不到了，导出时这一段会显示「找不到」的画面、没有声音。先把它找回来再导出吧。');
  a.equal(t('zh-CN', 'off-find-first'), '先找回来…');
  a.equal(t('zh-CN', 'off-export-anyway'), '照样导出');
  a.equal(t('zh-CN', 'off-other-copy'), '用另一处的同一段录像…');
  a.equal(t('zh-CN', 'off-other-copy-title'), '同一段录像存在别的地方（比如移动硬盘上的备份），指到那一份，剪辑点都不变。');
  a.equal(t('zh-CN', 'off-replace-title'), '换成另一段录像，用到它的片段都会跟着换。');
  a.equal(t('zh-CN', 'off-none'), '素材都在，没有找不到的。');
  a.equal(t('zh-CN', 'off-finding-k', { file: 'tone-b.mp4', k: 2, n: 5 }), '正在找：「tone-b.mp4」（第 2 个，共 5 个）');
  a.equal(t('zh-CN', 'off-finding-k', { file: 'tone-c.mp4', k: 1, n: 1 }), '正在找：「tone-c.mp4」（第 1 个，共 1 个）', 'one left: the count too');
  a.equal(t('zh-CN', 'off-auto-found', { m: 2 }), '已经自动找回 2 个');
  a.equal(t('zh-CN', 'off-slate'), '找不到');
  a.equal(V.t('zh-CN', 'term.relink'), '重新链接…', '〔重新链接…〕 stays');
  a.equal(V.t('zh-CN', 'term.replace-file'), '替换文件…', '〔替换文件…〕 stays');
});

test('JJ\'s English, word for word (“ ” quotes, JJ\'s rule); the drafts as they are until JJ settles them', () => {
  a.equal(t('en', 'off-bar-one', { file: 'tone-b.mp4' }), 'Can\'t find “tone-b.mp4”. It may have been moved or deleted. Your edits are still there; find the file and you can carry on.');
  a.equal(t('en', 'off-find-it'), 'Find it…');
  a.equal(t('en', 'off-export', { n: 2 }), '2 media files can\'t be found. In the export those parts will show a “missing” picture with no sound. Find them first, then export.');
  a.equal(t('en', 'off-other-copy'), 'Use the same recording from elsewhere…');
  a.equal(t('en', 'off-other-copy-title'), 'The same recording saved somewhere else (a backup on another drive, for example). Point to that one; your cuts stay the same.');
  a.equal(t('en', 'off-finding-k', { file: 'tone-b.mp4', k: 2, n: 5 }), 'Looking for “tone-b.mp4” (2 of 5)');
  a.equal(t('en', 'off-finding-k', { file: 'tone-c.mp4', k: 1, n: 1 }), 'Looking for “tone-c.mp4” (1 of 1)');
  a.equal(t('en', 'off-export-one'), '1 media file can\'t be found. In the export that part will show a “missing” picture with no sound. Find it first, then export.');
  // settled: no longer marked as a draft in the table
  const row = fs.readFileSync(path.join(__dirname, '..', 'shared/ui-preferences.js'), 'utf8').split('\n').find((l) => l.includes('"off-export-one"'));
  a.doesNotMatch(row, /draft|草稿/);
  a.equal(t('en', 'off-replace-title'), 'Swap in a different recording; every clip that uses it changes too.');
  // drafts (草稿，待 JJ 定稿)
  a.equal(t('en', 'off-bar-many', { n: 3 }), '3 media files can\'t be found. They may have been moved or deleted. Your edits are still there; find the files and you can carry on.');
  a.equal(t('en', 'off-find-each'), 'Find them one by one…');
  a.equal(t('en', 'off-item-title', { file: 'tone-b.mp4' }), '⚠ Offline: tone-b.mp4 is missing — right-click → Relink…');
  a.equal(t('en', 'off-find-first'), 'Find them first…');
  a.equal(t('en', 'off-export-anyway'), 'Export anyway');
  a.equal(t('en', 'off-none'), 'All your media is here; nothing is missing.');
  a.equal(t('en', 'off-auto-found', { m: 2 }), 'Found 2 automatically.');
  // what English already said stays (JJ gave no new English for these)
  a.equal(t('en', 'off-badge'), 'OFFLINE');
  a.equal(t('en', 'off-badge-title'), 'The file is missing — right-click → Relink…');
  a.equal(t('en', 'off-slate'), 'Media offline');
});

test('in the Chinese interface none of these says offline, Relink, Media offline, OFFLINE or Show', () => {
  const keys = Object.keys(V.text['zh-CN']).filter((k) => /^own\.off-/.test(k));
  a.ok(keys.length >= 17, keys.join(' '));
  for (const k of keys) a.doesNotMatch(V.t('zh-CN', k, { file: 'x', n: 2, k: 1 }), ENGLISH, k);
});

/* app.js, by the place each message is made: it comes from those keys, and the English it had is gone. */
const body = (start, end) => { const i = app.indexOf(start); a.ok(i >= 0, start); const j = app.indexOf(end, i + start.length); a.ok(j > i, end); return app.slice(i, j); };

test('the bin\'s strip: one file by name with 〔找到它…〕, several by number with 〔一个个找回来…〕; no Show button', () => {
  const s = body('if (mediaOffline.size && binView.filter !== "offline") {', 'els.binList.appendChild(warn);');
  a.match(s, /uiText\("own\.off-bar-one", \{ file: /);
  a.match(s, /uiText\("own\.off-bar-many", \{ n: mediaOffline\.size \}\)/);
  a.match(s, /"own\.off-find-it"/); a.match(s, /"own\.off-find-each"/);
  a.match(s, /openRelinkDialog\(\)/);
  a.doesNotMatch(s, /data-show|>Show<|setBinFilter|offline<\/span>|Relink…/);
});

test('the card\'s badge and hover, the filter, the menu and the empty filter speak through the keys', () => {
  const item = body('const makeMediaItem = (m, depth) => {', '\n  const renderLevel = ');
  a.doesNotMatch(item, /title="The file is missing|>OFFLINE<|"⚠ Offline: "/);
  a.match(item, /own\.off-badge-title/); a.match(item, /own\.off-badge"/);
  const tools = body('function syncBinTools(', '\n}\n');
  a.match(tools, /own\.off-filter/); a.doesNotMatch(tools, /⚠ Offline \(/);
  const bar = body('function makeFilterBar(', '\n}\n');
  a.match(bar, /own\.off-find-it/); a.match(bar, /own\.off-find-each/); a.doesNotMatch(bar, />Relink…</);
  const menu = body('function showMediaMenu(', '\n}\n');
  a.match(menu, /isMediaOffline\(m\.id\) \? uiText\("term\.relink"\) : uiText\("own\.off-other-copy"\)/);
  a.match(menu, /own\.off-other-copy-title/); a.match(menu, /own\.off-replace-title/);
  a.doesNotMatch(menu, /Relink to another copy/);
  a.match(body('if (!hits.length) {', 'els.binList.appendChild(none);'), /binView\.filter === "offline" \? uiText\("own\.off-none"\)/);
});

test('the corner toast is gone; the dialog marks each file it is finding, in order', () => {
  const check = body('async function checkOffline(', '\n}\n');
  a.doesNotMatch(check, /toast\(/, 'the strip says it now');
  const dlg = body('async function openRelinkDialog(', '\n}\n');
  a.match(dlg, /toast\(uiText\("own\.off-none"\)\)/);
  a.ok(dlg.includes('row.querySelector("b").textContent = k ? uiText("own.off-finding-k", { file: m.name, k, n: missing.length }) : m.name;'), 'no ⚠ in front, and the count even for one file');
  a.doesNotMatch(dlg, /own\.off-finding"/);
  a.doesNotMatch(dlg, /Nothing is offline/);
});

test('the export reminder has its two buttons: 〔先找回来…〕 opens the dialog, 〔照样导出〕 starts the export', () => {
  const s = body('const offUsed = project.media.filter(', 'fillExportRangeSelect();');
  a.ok(s.includes('offUsed.length === 1 ? uiText("own.off-export-one") : uiText("own.off-export", { n: offUsed.length })'));
  a.doesNotMatch(s, /will export as|Relink…/);
  const find = /\[data-off-find\]"\)\??\.addEventListener\("click", \(\) => \{ ([^}]*) \}\)/.exec(s), go = /\[data-off-go\]"\)\??\.addEventListener\("click", \(\) => \{?([^}\n]*)\}?\)/.exec(s);
  a.ok(find && go, 'both buttons are wired');
  a.match(find[1], /closeExportSetup\(\); openRelinkDialog\(offUsed\)/); a.doesNotMatch(find[1], /startChosenExport/);
  a.match(go[1], /startChosenExport\(\)/); a.doesNotMatch(go[1], /openRelinkDialog/);
});

test('the picture for a missing file says 「找不到」 in Chinese', () => {
  const s = body('function drawOfflineSlate(', '\n}\n');
  a.match(s, /ctx2d\.fillText\(uiText\("own\.off-slate"\)/); a.doesNotMatch(s, /fillText\("Media offline"/);
});

test('the bin\'s two other English lines (VV), JJ\'s wording', () => {
  a.equal(V.t('zh-CN', 'own.bin-drop-root'), '拖到这里，移出文件夹');
  a.equal(V.t('en', 'own.bin-drop-root'), 'Drop here to move it out of the folder');
  a.equal(V.t('zh-CN', 'own.bin-dbl-hint'), '双击可以先预览，或者直接拖到时间线上。');
  a.equal(V.t('en', 'own.bin-dbl-hint'), 'Double-click to preview it, or drag it onto the timeline.');
  a.ok(app.includes('root.textContent = uiText("own.bin-drop-root");'));
  a.ok(!app.includes('"Drop here to move to root"'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'app/index.html'), 'utf8');
  a.ok(html.includes('<p class="hint" data-i18n="own.bin-dbl-hint">Double-click to preview it, or drag it onto the timeline.</p>'));
});

test('a missing file found under the same name is linked without asking; the dialog asks only about the rest; the round ends with 「已经自动找回 {m} 个」', () => {
  const dlg = body('async function openRelinkDialog(', '\n}\n');
  a.ok(dlg.indexOf('/api/relink/candidates') < dlg.indexOf('overlay.innerHTML'), 'candidates are found before the dialog opens');
  a.ok(dlg.includes('const o = MediaLib.autoRelinkPick(m, optsOf(m));\n    if (o && !used.has(o.src)) { await setMediaSource(m, o.src, "relink", undefined, true);'));
  a.ok(dlg.includes('list = list.filter((m) => !found.has(m.id));\n  if (!list.length) { scheduleOfflineCheck(0); sayAuto(); return; }'));
  a.ok(dlg.includes('toast(uiText("own.off-auto-found", { m: found.size }))'));
  a.ok(dlg.includes('const close = () => { overlay.remove(); scheduleOfflineCheck(0); sayAuto(); };'));
  a.ok(body('async function setMediaSource(', '\n}\n').includes('if (!quiet) toast(msg);'));
  // the real round (3 missing, 2 found by name: one question, then 「已经自动找回 2 个」) is in desktop/offline-media-smoke.cjs
});

test('the card\'s hover names the file, never its path (no folder separators, no user folder), in both languages', () => {
  const item = body('const makeMediaItem = (m, depth) => {', '\n  const renderLevel = ');
  a.ok(item.includes('uiText("own.off-item-title", { file: m.name })'));
  a.doesNotMatch(item, /off-item-title", \{ path/);
  for (const l of ['en', 'zh-CN']) {
    a.doesNotMatch(V.text[l]['own.off-item-title'], /\{path\}/, l);
    const s = t(l, 'off-item-title', { file: 'tone-b.mp4' });
    a.doesNotMatch(s, /[\\/]|Users|home/i, l);
  }
  // the real card's whole hover is checked in desktop/offline-media-smoke.cjs
});

test('the export mix leaves a missing file out, even one whose sound was decoded before it went missing', () => {
  const s = body('async function renderAudioMix(', 'const sources = ');
  a.match(s, /if \(!m \|\| isMediaOffline\(m\.id\)\) continue;/);
});

// Merge regression: the offline guard must run before main's window decoder,
// while audible decode failures for files still present must continue to stop export.
function mixHarness(clips, offline, decode) {
  const vm = require('node:vm');
  const mix = body('async function renderAudioMix(', '\n}\n') + '\n}';
  const failures = body('function exportAudioHeard(', 'async function exportAudioSource(');
  const rendered = new Error('Reached audio rendering');
  const context = {
    mediaClips: () => clips, clipRenders: () => true,
    getMedia: id => ({ id, audioChannels: 2 }), isMediaOffline: id => offline.has(id),
    exportAudioSource: decode, uiText: k => k,
    // the clip-naming helpers (#231): the page's own language and time writing
    mcView: { get: () => ({ language: 'zh-CN' }) }, MontClipAutoSlices: require('../shared/auto-slices'),
    OfflineAudioContext: function () { throw rendered; },
  };
  const run = vm.runInNewContext(failures + '\n' + mix + '\nrenderAudioMix', context);
  return { run, rendered };
}
test('offline clips never enter the window decoder, even with cached sound', async () => {
  const clip = { kind: 'audio', mediaId: 'missing', start: 0, duration: 2 };
  const { run } = mixHarness([clip], new Set(['missing']), () => { throw Error('must not decode missing media'); });
  a.equal(await run(0, 2), null);
});
test('a mixed offline/online export retains main\'s clipped window and source offset', async () => {
  const clips = ['missing', 'present'].map(mediaId => ({ kind: 'audio', mediaId, start: 1, duration: 4 }));
  const calls = [];
  const { run, rendered } = mixHarness(clips, new Set(['missing']), async (m, c, from, to) => {
    calls.push([m.id, from, to]); return { buf: {}, at: 1.5 };
  });
  await a.rejects(run(2, 3), e => e === rendered);
  a.deepEqual(calls, [['present', 2, 3]]);
});
test('an online audible decode failure still stops export after the offline guard', async () => {
  const { run } = mixHarness([{ kind: 'audio', mediaId: 'present', start: 0, duration: 2, props: {} }], new Set(), async () => { throw Error('decode failed'); });
  await a.rejects(run(0, 2), e => e.code === 'EXPORT_AUDIO_FAILED');
});
