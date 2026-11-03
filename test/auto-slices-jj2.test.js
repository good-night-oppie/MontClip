'use strict';
// JJ's re-review of #77 (documents/2026-11-03-MontClip-PR71-74-75-77-复审-JJ.md), with Deja's checked wording for items 5
// and 6 (its 追加 section). Eight changes: no 「每首歌」 before the song gate (two new -maybe forms, the hook length one
// sentence), failures that say what to do next (as-fail, as-found-none, as-run-failed, as-busy), as-no-lane, and kind
// hints that never mention danmaku when the recordings have none.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const V = require('../ui-preferences');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const zh = (k) => V.text['zh-CN']['own.' + k], en = (k) => V.text.en['own.' + k];
const CJK = /[　-〿㐀-鿿＀-￯]/;
const fnBody = (src, head) => { const at = src.indexOf(head); a.ok(at >= 0, head); let d = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) break; } return src.slice(at, i + 1); };

const WORDS = {
  'as-len-song-maybe': '唱歌的段落整段出',
  'as-len-hook': '只要最好听的一部分（约 45 秒）',
  'as-len-hint-hook-maybe': '每段只切最好听的一部分，大约 45 秒（声音最响的那部分）。适合发动态、出竖屏。',
  'as-fail': '有 {failed} 条没导出来：「{name}」。{why}。你的剪辑都还在，点「再试一次」，或者打开导出队列看原因。',
  'as-found-none-next': '可以换一场录像，或者在「更多设置」里改一下每条多长，再找一次。',
  'as-run-failed': '「{name}」的声音没读出来，可能是文件坏了、没有声音，或者被移走了。可以换一场试试。',
  'as-run-nospace': '{drive} 盘空间不够，分析结果存不下。腾出一些空间再试。',
  'as-busy-export': '正在导出，等导出完再点这里。',
  'as-busy-comp': '你现在在合成片段里面。点时间线上方最左边的主序列名字，回到主序列再点这里。',
  'as-no-lane': '没有可以放的轨道。点一下左边的轨道名（比如 V1）选中它（锁着的先解锁），再试一次。',
  'as-kind-hint-game-nodm': '会找声音突然变大的段落。',
  'as-kind-hint-watch-nodm': '会找你反应最大的段落。',
};
test("JJ's re-review: the Chinese word for word, an English for each", () => {
  for (const [k, s] of Object.entries(WORDS)) {
    a.equal(zh(k), s, k);
    a.ok(en(k) && !CJK.test(en(k).replace(/「\{name\}」/g, '')), k + ' (en): ' + en(k));
  }
  // Deja's checked English for items 5 and 6
  a.equal(en('as-run-failed'), "Couldn't read the sound of 「{name}」. The file may be damaged, have no sound, or have been moved. Try another stream.");
  a.equal(en('as-run-nospace'), "Drive {drive} is full, so the results can't be saved. Free up some space and try again.");
  a.equal(en('as-busy-export'), 'Exporting. Click here again when the export is done.');
  a.equal(en('as-busy-comp'), "You're inside a precomposed clip. Click the main sequence name at the far left above the timeline to go back, then click here.");
  // no 「嵌套编辑」 and no raw error placeholder left
  for (const l of ['zh-CN', 'en']) for (const [k, s] of Object.entries(V.text[l])) if (k.startsWith('own.as-')) {
    a.ok(!/嵌套编辑|nested edit/i.test(s), k + ': ' + s);
    a.ok(!s.includes('{error}'), k + ' shows a raw error: ' + s);
  }
});

test('before the song gate nothing says 每首歌 / 一首歌 / 整首 / 第 n 首: each such key has a -maybe form and goes through autoSongKey', () => {
  const app = read('app.js'), gate = fnBody(app, 'function autoSongKey(');
  const gated = [...gate.match(/new Set\(\[([^\]]*)\]\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const songish = Object.keys(V.text['zh-CN']).filter((k) => k.startsWith('own.as-') && !k.endsWith('-maybe')).map((k) => k.slice(4))
    .filter((k) => /首歌|整首|第 ?\{no\} ?首/.test(zh(k)) && k !== 'as-song-name');   // as-song-name: MontClipAutoSlices.title, gated there
  a.ok(songish.includes('as-len-song') && songish.includes('as-len-hint-hook'), songish.join(' '));
  for (const k of songish) {
    a.ok(gated.includes(k), k + ' is not gated');
    a.ok(zh(k + '-maybe') && !/首歌|整首|第 ?\d+ ?首/.test(zh(k + '-maybe')), k + '-maybe: ' + zh(k + '-maybe'));
    a.ok(en(k + '-maybe') && !/\bsongs?\b/i.test(en(k + '-maybe')), k + '-maybe (en): ' + en(k + '-maybe'));
  }
  // the 每条多长 buttons are labelled through the gate too
  a.match(fnBody(app, 'function autoStartHtml('), /autoSay\(autoSongKey\("as-" \+ name \+ "-" \+ v\)\)/);
});

test('a failed search says it in plain words; the raw error only goes to the log, masked', () => {
  const app = read('app.js'), run = fnBody(app, 'async function autoRun(');
  a.ok(!/error: g\.error/.test(run), 'g.error is not shown');
  a.match(run, /"own\.as-run-nospace"/);
  a.match(run, /"ENOSPC"/);
  a.match(run, /console\.warn\([^)]*autoMask\(/, 'the detail is logged masked');
  const mask = fnBody(app, 'function autoMask(');
  const autoMask = new Function('return ' + mask)();
  const out = autoMask('ENOSPC: no space left on device, open \'C:\\Users\\someone\\FableCut\\analysis\\songs\\x.part\' /home/a/b.flv', ['我的直播.flv']);
  a.ok(!/someone|\/home\/a|直播/.test(out), out);
  a.match(out, /ENOSPC/);
  // the server says which drive is full and why, never the path
  const server = read('server.js');
  a.match(server, /job\.code = e\.code === "ENOSPC" \? "ENOSPC" : "SONGS_FAILED"/);
  a.match(server, /code: job\.code/);
  a.match(server, /drive: songDrive\(\)/);
});

test('an export that fails: the count, a reason in plain words, the next step; no raw error on the card', () => {
  const done = fnBody(read('app.js'), 'function autoDoneHtml(');
  a.ok(!/escapeHtml\(failed\[0\]\.error\)/.test(done), 'no raw error');
  a.match(done, /"as-fail", \{ failed: failed\.length/);
  a.match(done, /autoFailWhy\(/);
  for (const k of ['as-fail-why-space', 'as-fail-why-changed', 'as-fail-why-other']) a.ok(zh(k) && en(k), k);
  a.equal(V.t('zh-CN', 'own.as-fail', { failed: 2, name: '01 1：12：04 那段', why: zh('as-fail-why-other') }),
    '有 2 条没导出来：「01 1：12：04 那段」。' + zh('as-fail-why-other') + '。你的剪辑都还在，点「再试一次」，或者打开导出队列看原因。');
  a.ok(!/[。.]$/.test(zh('as-fail-why-other')), 'the sentence adds its own 。');
});

test('nothing found says what to try next', () => {
  const review = fnBody(read('app.js'), 'function autoReviewHtml(');
  a.match(review, /"as-found-none-next"/);
});

test('busy: exporting and inside a precomposed clip each say their own sentence; a drag gets no message', () => {
  const open = fnBody(read('app.js'), 'function openAutoSlices(');
  a.match(open, /state\.exporting[^;]*"own\.as-busy-export"/);
  a.match(open, /state\.compCtx[^;]*"own\.as-busy-comp"/);
  a.ok(!/state\.gesture[^;\n]*toast/.test(open), 'no toast while dragging');
  a.equal(zh('as-busy'), undefined, 'the old one-sentence form is gone');
});

test('the kind hints never mention danmaku when the chosen recordings have none', () => {
  const app = read('app.js'), start = fnBody(app, 'function autoStartHtml(');
  a.match(start, /autoKindHintKey\(/);
  const key = new Function('autoSongKey', 'return ' + fnBody(app, 'function autoKindHintKey('))((k) => k);
  for (const kind of ['chat', 'game', 'watch']) {
    a.equal(key(kind, 0), 'as-kind-hint-' + kind + '-nodm');
    a.equal(key(kind, 12), 'as-kind-hint-' + kind);
    a.ok(!/弹幕/.test(zh('as-kind-hint-' + kind + '-nodm')) && !/danmaku/i.test(en('as-kind-hint-' + kind + '-nodm')), kind);
  }
  a.equal(key('sing', 0), 'as-kind-hint-sing');
  // and the step list says loudness only
  a.ok(!/弹幕/.test(zh('as-run-hot-nodm')) && !/danmaku/i.test(en('as-run-hot-nodm')));
});
