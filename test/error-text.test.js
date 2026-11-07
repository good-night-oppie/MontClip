'use strict';
// Deja, 2026-11-04 (decision B), in JJ's final words: 错误白话表 v2
// (2026-11-04-错误白话表-默认条数-发到手机-JJ.md, sha256 d99c25d114f865bd6388bc98822b04308f6ca96c3e3ac02a802dd92cc736cb13).
// Every failure the streamer sees goes through MontClipView.errorText: what happened, then what she can do now. Raw errors,
// codes and English go to the log only; 〔复制问题信息〕 copies that line with viewers, keys and user folders taken out.
// The rows this PR owns are locked word for word. (FLV gaps / conversion rows: #130; the export "no encoder" row: #125.)
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences'), R = require('../problem-redact'), X = require('../external-ffmpeg');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('app.js');
const CJK = /[　-〿㐀-鿿＀-￯]/;
const fnBody = (src, head) => { const at = src.indexOf(head); a.ok(at >= 0, head); let d = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(at, i + 1); };
const all = (src, re) => [...src.matchAll(re)].map((m) => m[1]);
const zh = (k, v) => V.t('zh-CN', k, v), en = (k, v) => V.t('en', k, v);

/** Every code the server, the desktop main process and the page hand to the interface. */
function publicCodes() {
  const codes = new Set([...require('../prepare-media').PUBLIC_CODES, 'IMPORT_FAILED']);
  for (const c of all(read('desktop/flv-import.js'), /fail\("([A-Z_]+)"/g)) codes.add(c);
  for (const c of all(read('export-jobs.js'), /errorCode: "([A-Z_]+)"/g)) codes.add(c);
  for (const c of all(read('external-ffmpeg.js'), /code: "([A-Za-z0-9]+)"/g)) codes.add(c);
  for (const c of all(read('server.js'), /code: ?"([A-Za-z0-9_]+)"/g)) codes.add(c);
  for (const c of all(read('server.js'), /"(ext[A-Z][A-Za-z]+)" : ext\.code/g)) codes.add(c);
  for (const c of all(app, /code: "((?:EXPORT|DISK)_[A-Z_]+)"/g)) codes.add(c);
  for (const c of V.ERROR_CODES) codes.add(c);
  codes.add('ffmpegMissing');
  codes.delete('none');        // "no local FFmpeg chosen": a state, never shown as a failure
  codes.delete('ffmpegDev');   // a development checkout without the bundled FFmpeg: stays English (ffmpeg-path.js)
  return [...codes].sort();
}
const PARAMS = { w: 120, h: 40, n: 145, reason: 'extGone', encoder: 'h264_mf' };

test('JJ v2, word for word: the rows this PR owns', () => {
  const unreadable = ['这个录像读不了，可能还没录完，或者文件坏了。原片没有改动。如果是还在录的，录完以后再导入。',
    "This recording can't be read. It may still be recording, or the file is damaged. The original is unchanged. If it's still recording, import it once it's done."];
  for (const code of ['FLV_PROBE_FAILED', 'FLV_NOT_FLV', 'FLV_NOT_FOUND']) {
    a.deepEqual([V.errorText('zh-CN', { code }).text, V.errorText('en', { code }).text], unreadable, code);
    a.deepEqual([V.flvImportMessage('zh-CN', code), V.flvImportMessage('en', code)], unreadable, code + ' through the FLV import too');
  }
  a.equal(V.errorText('zh-CN', { code: 'FLV_IMPORT_BUSY' }).text, '上一个文件还在导入，等它做完再导这个。');
  a.equal(V.errorText('en', { code: 'FLV_IMPORT_BUSY' }).text, "The previous file is still importing. Import this one once it's done.");
  a.equal(V.errorText('zh-CN', { code: 'FLV_IMPORT_EXPIRED' }).text, '这次导入停太久已经失效了，重新导入一次就行。原片没有改动。');
  a.equal(V.errorText('en', { code: 'FLV_IMPORT_EXPIRED' }).text, 'This import waited too long and expired. Import it again; the original is unchanged.');
  // disk full: v2's sentence when the size is known; without the size clause until MontClip knows it (open question)
  for (const code of ['FLV_DISK_FULL', 'DISK_FULL']) {
    a.equal(V.errorText('zh-CN', { code, params: { size: '3.2 GB' } }).text, '电脑空间不够，这次没有做完。要空出大约 3.2 GB，空出来以后点重试。原片没有改动。');
    a.equal(V.errorText('en', { code, params: { size: '3.2 GB' } }).text, "There isn't enough space on this computer, so this didn't finish. Free up about 3.2 GB, then try again. The original is unchanged.");
    a.equal(V.errorText('zh-CN', { code }).text, '电脑空间不够，这次没有做完。空出来以后点重试。原片没有改动。');
    a.equal(V.errorText('en', { code }).text, "There isn't enough space on this computer, so this didn't finish. Free up some space, then try again. The original is unchanged.");
  }
  a.equal(V.errorText('zh-CN', new Error('ffmpeg exited: No space left on device')).code, 'DISK_FULL');
  // the last row: anything the table does not list
  const other = ['这次没有做完，出了个我们没预料到的问题。原片没有改动。再试一次；还不行，点「复制问题信息」发给我们。',
    'This didn\'t finish because of a problem we didn\'t expect. The original is unchanged. Try again; if it still fails, use "Copy problem details" and send it to us.'];
  for (const e of [{ code: 'SOMETHING_NEW' }, new Error("Unknown encoder 'libx264'"), 'boom', null, { code: 'FLV_PREPARATION_FAILED' }])
    a.deepEqual([V.errorText('zh-CN', e).text, V.errorText('en', e).text], other, String(e && (e.code || e.message || e)));
  // an FLV that didn't import keeps main's sentence: it is said in a dialog with no 〔复制问题信息〕, so not the last row,
  // which sends her to that button (Deja on #129)
  const flvFailed = ['这个 FLV 没导进来：MontClip 处理这个文件时出了问题。原片没有改动。再试一次。',
    'This FLV was not imported: something went wrong while MontClip was handling it. The original is unchanged. Try again.'];
  a.deepEqual([V.flvImportMessage('zh-CN', 'FLV_PREPARATION_FAILED'), V.flvImportMessage('en', 'FLV_PREPARATION_FAILED')], flvFailed, 'never 「先把它转成 MP4」');
  // the copy button and its small print
  a.deepEqual([zh('btnCopyProblem'), en('btnCopyProblem')], ['复制问题信息', 'Copy problem details']);
  a.deepEqual([zh('copyProblemNote'), en('copyProblemNote')], ['复制的内容不含你的文件夹路径、密钥和观众信息。', "What's copied leaves out your folder paths, keys and viewer details."]);
  a.deepEqual([zh('btnRetryThis'), zh('btnRetry'), zh('btnOtherFolder')], ['重试这条', '重试', '换个文件夹']);
  a.deepEqual([en('btnRetryThis'), en('btnOtherFolder')], ['Retry this one', 'Choose another folder']);
  // #116 (JJ, 2026-11-04): the desktop folder is exports, so no folder name (「MontClip导出」 is only the plugin's)
  a.equal(zh('exportSaveFolderFailed'), '视频已经导出好了，但没能存进你选的文件夹。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。');
  a.equal(en('exportSaveFolderFailed'), "The video was exported, but it couldn't be saved to the folder you picked. It's in MontClip's own exports folder; you can export again to another folder.");
  for (const l of ['zh-CN', 'en']) for (const v of Object.values(V.text[l])) if (typeof v === 'string') a.ok(!v.includes('MontClip导出'), 'the desktop app never names the plugin\'s folder: ' + v);
  // the queue's states, and a run with notes
  a.deepEqual([zh('qWaiting'), zh('qRendering', { pct: 42 }), zh('qDone', { file: 'a.mp4' }), zh('qStopped')], ['排队等导出', '正在导出… 42%', '导好了：a.mp4', '已停下']);
  a.equal(V.exportResult('zh-CN', { done: 4, warned: 1 }), '4 条导出好了（其中 1 条有提醒，点开看看）');
  a.equal(V.exportResult('en', { done: 4, warned: 1 }), '4 exported (1 have a note — open to see)');
});

test('JJ (2026-11-04): three more rows — the timeline changed, a picture too small, the FFmpeg chosen in Settings', () => {
  // the timeline changed: JJ's sentence for #77 (as-fail-why-changed, f953b1b), as it was
  a.equal(V.errorText('zh-CN', { code: 'EXPORT_TIMELINE_CHANGED' }).text, '加进导出以后，时间线又改过了，所以没导');
  a.equal(V.errorText('en', { code: 'EXPORT_TIMELINE_CHANGED' }).text, "The timeline changed after it was queued, so it wasn't exported");
  // a picture smaller than the encoder takes: n is the smallest side, from the server (NVENC's 145×49 → 145)
  a.equal(V.errorText('zh-CN', { code: 'frameTooSmall', params: { w: 120, h: 40, n: 145 } }).text, '画面太小，导不出来：宽和高都至少要 145 像素。把画面大小改大一点再导出。原片没有改动。');
  a.equal(V.errorText('en', { code: 'frameTooSmall', params: { w: 120, h: 40, n: 145 } }).text, 'The picture is too small to export: width and height must each be at least 145 pixels. Make it larger and export again. The original is unchanged.');
  a.match(read('server.js'), /code: "frameTooSmall",[^]{0,200}params: \{ w: frame\.outW, h: frame\.outH, n: Math\.max\(\.\.\.\[\.\.\.available\]\.map\(\(e\) => Delivery\.ENCODERS\[e\]\?\.min \|\| \[\]\)\.flat\(\)\) \}/);
  a.deepEqual(require('../delivery').ENCODERS.h264_nvenc.min, [145, 49]);
  // the FFmpeg chosen in Settings, whichever way it fails
  for (const code of ['extGone', 'extNotFfmpeg', 'extNoX264', 'extSettingBad', 'extNotFullPath']) {
    a.equal(V.errorText('zh-CN', { code }).text, '设置里选的 FFmpeg 用不了，这次没有做完。在设置里改回 MontClip 自带的，或者重新选一个。原片没有改动。', code);
    a.equal(V.errorText('en', { code }).text, "The FFmpeg chosen in Settings doesn't work, so this didn't finish. Switch back to the one that comes with MontClip in Settings, or choose another. The original is unchanged.", code);
  }
  // each is a reason a batch may give
  for (const e of [{ code: 'EXPORT_TIMELINE_CHANGED' }, { code: 'frameTooSmall', params: { n: 145 } }, { code: 'extGone' }])
    a.equal(V.batchReason('zh-CN', e), V.errorText('zh-CN', e).text);
  a.equal(V.exportResult('zh-CN', { done: 0, failed: 2, why: V.batchReason('zh-CN', { code: 'EXPORT_TIMELINE_CHANGED' }) }),
    '这次一条都没导出来：加进导出以后，时间线又改过了，所以没导。你的剪辑都还在，没有丢。');
});

test('after a copy: one key and one string, the same as #132 and the plugin', () => {
  const done = '已经复制好了，粘贴到发给我们的消息里就行。', failed = '这次没能复制，再点一次按钮试试。';
  a.deepEqual([zh('own.copy-problem-done'), zh('own.copy-problem-failed')], [done, failed]);
  a.deepEqual([en('own.copy-problem-done'), en('own.copy-problem-failed')], ['Copied. Paste it in a message to us.', "It couldn't be copied this time. Try the button again."]);
  // no second key or string for the same thing
  for (const l of ['zh-CN', 'en']) {
    const keys = Object.entries(V.text[l]).filter(([, v]) => v === V.text[l]['own.copy-problem-done'] || v === V.text[l]['own.copy-problem-failed']).map(([k]) => k);
    a.deepEqual(keys.sort(), ['own.copy-problem-done', 'own.copy-problem-failed'], l);
    a.ok(!('copyProblemDone' in V.text[l]) && !('copyProblemFailed' in V.text[l]), l);
  }
  // every copy button goes through copyProblem, which says only these two
  // #161: after a copy, JJ's sentence with the mailbox (toastProblemSent); own.copy-problem-done stays for #132 and the plugin
  a.match(fnBody(app, 'async function copyProblem('), /toastProblemSent\(\); \} catch \{ toast\(uiText\("own\.copy-problem-failed"\)\); \}/);
  a.equal((app.match(/copyProblem\(/g) || []).length - 1, (app.match(/uiText\("btnCopyProblem"\)|data-as-act="copy-problem"/g) || []).length, 'each copy button calls copyProblem');
  a.ok(!/已复制|copyProblemDone|copyProblemFailed/.test(app));
});

test('JJ v2, word for word: export results', () => {
  const s = (l, o) => V.exportResult(l, o);
  a.equal(s('zh-CN', { done: 2, failed: 1 }), '2 条导出好了，1 条没导出来');
  a.equal(s('en', { done: 2, failed: 1 }), "2 exported, 1 didn't");
  a.equal(s('zh-CN', { done: 3, failed: 0 }), '3 条导出好了');
  const disk = V.batchReason('zh-CN', { code: 'DISK_FULL' });
  a.equal(s('zh-CN', { done: 0, failed: 3, why: disk }), '这次一条都没导出来：电脑空间不够，这次没有做完。空出来以后点重试。原片没有改动。你的剪辑都还在，没有丢。');
  a.equal(s('en', { done: 0, failed: 3, why: V.batchReason('en', { code: 'DISK_FULL' }) }),
    "Nothing was exported this time: there isn't enough space on this computer, so this didn't finish. Free up some space, then try again. The original is unchanged. Your edits are all still there.");
  a.equal(s('zh-CN', { done: 0, failed: 1 }), '这次一条都没导出来：' + zh('errOther').replace(/。$/, '') + '。你的剪辑都还在，没有丢。', 'no reason given: the last row');
  a.ok(!/导出好了/.test(s('zh-CN', { done: 0, failed: 3 })));
});

test('a reason in a batch is only one of v2\'s sentences; anything else is its last row; never the Media Feature Pack line', () => {
  for (const l of ['zh-CN', 'en']) {
    const other = V.t(l, 'errOther');
    for (const e of [{ code: 'extNeeded' }, { code: 'NETWORK_DISABLED' }, new Error('ffmpeg encode failed: Conversion failed!'), { code: 'EXPORT_BUSY' }])
      a.equal(V.batchReason(l, e), other, JSON.stringify(e));
    a.equal(V.batchReason(l, { code: 'DISK_FULL' }), V.errorText(l, { code: 'DISK_FULL' }).text);
    a.equal(V.batchReason(l, { code: 'h264NoneOther' }), V.errorText(l, { code: 'h264NoneOther' }).text);
    for (const fp of [true, false]) {
      const r = V.batchReason(l, { code: 'h264NoneWin', featurePack: fp });
      a.ok(!/Media Feature Pack|媒体功能包|N 版|"N" edition/.test(r), r);
    }
  }
  // the Media Feature Pack guess is gone from every table, the Settings page and the English for agents (JJ, 2026-11-04)
  for (const l of ['zh-CN', 'en']) {
    a.ok(!('h264NeedFeaturePack' in V.text[l]), l);
    a.equal(V.h264Message(l, { code: 'h264NoneWin', featurePack: true }), V.h264Message(l, { code: 'h264NoneWin' }));
    for (const v of Object.values(V.text[l])) if (typeof v === 'string') a.ok(!/Media Feature Pack|媒体功能包|N 版/.test(v), v);
  }
  a.ok(!/h264NeedFeaturePack/.test(app) && !/h264NeedFeaturePack/.test(read('ui-preferences.js')));
  a.ok(!/Media Feature Pack/.test(X.noH264Reason({ platform: 'win32', mediaFoundation: false })));
  // the other unverified sentence JJ took out of v2 (the recorder's other files for the same stream) is in no row
  for (const l of ['zh-CN', 'en']) for (const v of Object.values(V.text[l])) if (typeof v === 'string') a.ok(!/录播姬.{0,12}分成|同一场.{0,8}几个文件|same stream/.test(v), v);
});

test('every public code: words in both languages, no English in the Chinese, nothing raw', () => {
  const codes = publicCodes();
  for (const c of ['FLV_TIMELINE_GAP', 'FLV_NOT_FOUND', 'HEADLESS_DISABLED', 'extNoX264', 'h264NoneOther', 'frameTooSmall',
    'NETWORK_DISABLED', 'extNeeded', 'EXPORT_TIMELINE_CHANGED', 'DISK_FULL', 'ffmpegMissing']) a.ok(codes.includes(c), c);
  a.ok(codes.length >= 40, String(codes.length));
  const NAMES = /MontClip|FFmpeg|ffmpeg\.exe|FLV|MP4|H\.264|x264|Windows|NVIDIA|Intel|AMD|Apple|Media Feature Pack|Yolo|AI/g;
  for (const code of codes) {
    const raw = 'raw ' + code + ' from ffmpeg: Unknown encoder';
    const z = V.errorText('zh-CN', { code, params: PARAMS, message: raw }), e = V.errorText('en', { code, params: PARAMS, message: raw });
    a.ok(z.text && e.text, code);
    a.equal(z.text.replace(NAMES, '').match(/[A-Za-z]{2,}/), null, code + ' zh: ' + z.text);
    a.ok(!CJK.test(e.text.replace(/MontClip导出/g, '')), code + ' en: ' + e.text);
    a.ok(!z.text.includes(raw) && !e.text.includes(raw), code);
    a.equal(z.log, raw, 'the raw error is kept for the log');
  }
});

// The Chinese interface (Deja / JJ, 2026-11-04): no English word of three letters or more, beyond JJ's categories (a)–(e)
// in test/zh-shown.js — names in their own casing, key names, 中文（ABC）, officialPane_formatTech, the logo and "English".
const Z = require('./zh-shown');
// Strings outside this PR that still break the rule, for JJ to finalise in a PR of their own (key → the words): not rewritten here.
// (main fixed every earlier one: #144, wip2-zh-labels; #151's font sentence names Google, for JJ: a product name, (a)?)
const KNOWN = { 'own.font-net-hosts': 'Google',
  // #154's 「要联网下载 AI 抠像吗」 (JJ's words): the products it names and the site it downloads from
  'own.bgremove-net-what': 'Google,MediaPipe', 'own.bgremove-net-hosts': 'jsDelivr',
  // main's 「AI 数据说明」 for the private DeepSeek package (c446c0c9, JJ's words): the product name, and its address
  'officialPane_dataNoticeWho': 'DeepSeek,api,deepseek,com', 'officialPane_dataNoticeUseLabel': 'DeepSeek',
  'officialPane_dataNoticeUse': 'DeepSeek', 'officialPane_dataNoticeBasis': 'DeepSeek', 'officialPane_dataNoticeSound': 'DeepSeek',
  // the line when ask() is declined inside Cindy (JJ's words, 2026-11-07): the product name, (a)
  'own.ap-embedded-declined': 'Cindy',
  // the audio-track hint (JJ chose A on #177, 2026-11-07): the recorder's product name, (a)
  'own.at-hint': 'OBS',
  // #146's no-x264 sentences (JJ chose A on #146, 2026-11-07): the preset as the export list shows it, delivery.js label "Master", (a)
  'extNeededServer': 'Master', 'extNeededPlugin': 'Master' };
// the same notice writes the address api.deepseek.com: "api" there is part of a host name, not API in another casing
const KNOWN_CASE = { 'officialPane_dataNoticeWho': ['api'] };
test('the Chinese interface: no English word of three letters or more, beyond JJ\'s categories; names in their own casing', () => {
  const found = {};
  for (const [k, v] of Object.entries(V.text['zh-CN'])) {
    if (typeof v !== 'string' || Z.EXEMPT_ZH.has(k)) continue;
    a.deepEqual(Z.wrongCase(v), KNOWN_CASE[k] || [], `zh-CN "${k}" writes a name in another casing: ${v}`);
    // key caps and code samples are not prose (main's help rows carry <kbd>, #144): the words around them are what counts
    const w = Z.englishLeft(v.replace(/<(kbd|code)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' '));
    if (w) found[k] = w;
  }
  for (const [k, w] of Object.entries(found)) a.equal(KNOWN[k], w, `zh-CN "${k}" has ${w}: ${V.text['zh-CN'][k]}`);
  for (const k of Object.keys(KNOWN)) a.ok(found[k], k + ' is fixed now: drop it from KNOWN');
  // (c) as JJ wrote it, and the rule itself
  a.deepEqual(['term.cbr-constant-bitrate', 'term.cbr-constant', 'term.vbr-variable-bitrate', 'term.vbr-variable', 'term.crf-constant-quality', 'term.true-peak-dbtp'].map((k) => zh(k)),
    ['固定码率（CBR）', '固定码率（CBR）', '动态码率（VBR）', '动态码率（VBR）', '恒定画质（CRF）', '真峰值（dBTP）']);
  a.equal(Z.englishLeft('恒定画质（CRF）'), ''); a.equal(Z.englishLeft('CRF 恒定画质'), 'CRF'); a.equal(Z.englishLeft('（CRF）'), 'CRF');
  a.deepEqual(Z.wrongCase('用 ffmpeg 读 xml'), ['ffmpeg', 'xml']); a.deepEqual(Z.wrongCase('选 ffmpeg.exe'), []);
  a.deepEqual([zh('term.fast-ffmpeg'), zh('own.dm-bad').includes('.XML'), zh('own.engine-webcodecs-note').includes('快速（FFmpeg）')], ['快速（FFmpeg）', true, true]);
});

// The same rule for index.html as the zh-CN page shows it (VV: the help layer's shortcuts are still English). The text is
// not fixed here: every place that breaks the rule is in test/fixtures/zh-index-english.json — "help:<section>/<keys>" for
// a shortcut row (for JJ, then a PR of its own), "html:<id>" for the rest — and this test fails on a new one, and on one
// that is fixed but still listed. Key caps and code samples are not prose. JJ's categories apply here too (the logo and
// "English" in the language menu are (e)).
test('the Chinese interface of index.html (help layer included): English left in it is only the listed exceptions', () => {
  const found = Z.englishShown(), known = require('./fixtures/zh-index-english.json');
  a.ok(!('html:app' in found) && !('html:mcLanguage' in found), '(e)');
  // what main still shows in English (after #144 and #147: words in the help layer's key cells and some headings) is
  // test/fixtures/zh-index-english.json, for JJ — regenerated from main when it was merged in
  a.ok(!found['html:helpOverlay'] || !/Keyboard/.test(found['html:helpOverlay']), 'data-i18n headings come out in Chinese');
  for (const [k, w] of Object.entries(found)) a.equal(known[k], w, `zh-CN ${k} shows ${w}`);
  for (const k of Object.keys(known)) a.ok(found[k], k + ' is fixed now: drop it from test/fixtures/zh-index-english.json');
});

test('〔复制问题信息〕: no viewer name or uid, no key, and (#161) no path on the computer at all', () => {
  // synthetic lines in the shapes viewers reach a log in: 录播姬 danmaku / gift / super chat XML, Bilibili live JSON,
  // key=value, Chinese labels; with a Windows and a home path and keys
  const win = 'C:\\Users\\alice\\Videos\\a.flv', nix = '/home/alice/rec/b.flv', mac = '/Users/alice/Movies/c.flv';
  const line = [
    `[flv-import] FLV_PROBE_FAILED: probe ${win} and ${nix} and ${mac} failed`,
    `<d p="12.3,1,25,16777215,1730700000000,0,8f3a2b1c,4455667788" user="小梨的粉丝" uid="12345678">好听</d>`,
    `<gift ts="10" user="某某某" uid="87654321" giftname="小心心" giftcount="1" />`,
    `{"cmd":"DANMU_MSG","info":{"uid":12345678,"uname":"小梨的粉丝","user":{"uid":"23456789","name":"粉丝二号"}}}`,
    `uid=34567890 nickname=粉丝三号 用户名：某某某 昵称：小梨的粉丝`,
    `Authorization: Bearer abc.DEF-123_xyz token=tk_live_998877 "apiKey":"sk-ABCDEF0123456789"`,
  ].join('\n');
  const opts = { home: 'C:\\Users\\bob', platform: 'win32' };
  for (const out of [R.redactProblem(line, opts), R.redactProblem(line, {})]) {
    for (const gone of ['12345678', '87654321', '23456789', '34567890', '小梨的粉丝', '某某某', '粉丝二号', '粉丝三号', 'alice',
      'abc.DEF-123_xyz', 'tk_live_998877', 'sk-ABCDEF0123456789', '8f3a2b1c', '4455667788']) a.ok(!out.includes(gone), gone + ' in: ' + out);
    // #161 (JJ: 「文件路径已经去掉」): not even the masked path; only the file's extension stays
    for (const p of [win, nix, mac]) a.ok(!out.includes(X.maskUserPath(p)) && !out.includes(p), 'no path: ' + out);
    a.equal((out.match(/<path \.flv>/g) || []).length, 3);
    a.match(out, /FLV_PROBE_FAILED/, 'the rest of the line stays');
  }
  // one rule, two places: Node's maskUserPath is the shared one with this computer's home folder
  const home = require('os').homedir(), p = path.join(home, 'Videos', 'x.flv');
  a.equal(X.maskUserPath(p), R.maskUserPath(p, { home, platform: process.platform }));
  a.equal(X.maskUserPath('Could not open C:\\Users\\Public\\x.mp4'), 'Could not open C:\\Users\\Public\\x.mp4', 'shared profiles stay');
});

test('the page: nothing raw on screen; the copy button with its small print; the server redacts with the home folder', () => {
  a.match(fnBody(app, 'function sayError('), /console\.warn\(r\.line\)/, 'the raw error goes to the log');
  const copy = fnBody(app, 'async function copyProblem(');
  a.match(copy, /fetch\("\/api\/problem-details"/);
  a.match(copy, /MontClipRedact\.problemDetails\(/, 'the same rules in the page when the server can\'t be reached (#161: with its first line)');
  a.match(copy, /navigator\.clipboard\.writeText\(out\)/);
  a.match(fnBody(app, 'function toastProblem('), /uiText\("btnCopyProblem"\)[^;]*uiText\("copyProblemNote"\)/);
  const queue = fnBody(app, 'function renderQueue(');
  a.ok(!/`Failed: |xq-detail|\.error\b|\.log\b|(?<!report)\.line\b/.test(queue), 'no raw error in the queue (report.line is the export check)');
  a.match(queue, /MontClipView\.batchReason\(/);
  a.match(queue, /uiText\("btnRetryThis"\)/);
  const run = fnBody(app, 'async function runQueue(');
  // the one alert is main's no-encoder precheck (#125), and it says h264Refuse, not a raw error
  a.ok(!/Export queue: |alert\((?!refused\))/.test(run));
  a.match(run, /MontClipView\.exportResult\(/);
  a.match(run, /uiText\("btnCopyProblem"\)/);
  const done = fnBody(app, 'function autoDoneHtml(');
  a.match(done, /data-as-act="retry-one"/); a.match(done, /data-as-act="copy-problem"/); a.match(done, /copyProblemNote/);
  a.ok(!/\.error\)|\.log\b|\.line\b/.test(done));
  a.match(fnBody(app, 'function sayExportFailure('), /toastProblem\(sayError\(e, "export"\), uiText\("own\.export-failed-prefix"\)\)/);
  a.ok(!/alert\(uiText\("own\.export-failed-prefix"\)/.test(app), 'no alert of an export failure');
  a.match(app, /toastAction\(uiText\("exportSaveFolderFailed"\), uiText\("btnOtherFolder"\)/, '#116: 〔换个文件夹〕 opens the save window again');
  const server = read('server.js');
  a.match(server, /p === "\/api\/problem-details"/);
  // #161: the plain sentence, the files as type and size, the code — with the user name too (test/problem-details.test.js)
  a.match(server, /Redact\.problemDetails\(p, \{ home: os\.homedir\(\), platform: process\.platform, user: userName\(\), language: body\.language \}\)/);
  a.match(read('index.html'), /<script src="problem-redact\.js"><\/script>/);
});

test('the auto-slices page keeps its state when the project only now gets an id (VV: 「导出好了，0 条」 after a failed export)', () => {
  const src = fnBody(app, 'function autoState(');
  const AUTO = { st: null }, runtime = { projectId: null };
  const autoState = new Function('AUTO', 'runtime', 'MontClipAutoSlices', src + '; return autoState;')(AUTO, runtime, { DEFAULTS: { count: 5, len: 'song' } });
  const st = autoState(); st.exportIds = ['q1'];
  runtime.projectId = 'p_1';          // placing the slices saved a version: the same project now has an id
  a.deepEqual(autoState().exportIds, ['q1']);
  a.equal(autoState().projectId, 'p_1');
  runtime.projectId = 'p_2';          // another project: a fresh page
  a.equal(autoState().exportIds, null);
});
