'use strict';
// v10 (Deja, 2026-11-03; frozen design 2026-11-03-MontClip-自动出切片交互说明-v10.md, sha256 a4c4e3d8…; JJ copy v2, sha256
// 72479a4b…): the transcription setup page. It opens by itself the first time (desktop app, transcription on, no model,
// not answered "later" before), and again from Settings › 听写 and from P3's 〔去装〕. Three choices; the cloud one is
// hidden until cloud transcription exists (not in #70). Five states while the model comes: downloading, done, network
// gone, no room, a file that failed its check. 「（我们的测试电脑上大约 {n} 分钟）」 stays hidden until Deja gives the number.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const V = require('../ui-preferences'), zh = (k, v) => V.t('zh-CN', 'own.' + k, v), en = (k, v) => V.t('en', 'own.' + k, v);

test('JJ v2, section one, word for word', () => {
  a.equal(zh('setup-title'), '要不要自动出字幕？');
  a.equal(zh('setup-intro'), 'MontClip 可以把录像里说的话听写成字幕。先选一种做法，以后可以在「设置 › 听写」里改。找高光不需要听写，选哪种都能用。');
  a.equal(zh('setup-local-title'), '在这台电脑上听写'); a.equal(zh('setup-recommended'), '推荐');
  a.equal(zh('asr-missing'), '第一次要联网下载一个听写模型，大约 230 MB，只下载这一次。下载完以后，听写全程在这台电脑上做，声音不会发出去。');
  a.equal(zh('setup-local-speed'), '1 小时的录像通常几分钟听写完，电脑越快越短。');
  a.equal(zh('setup-local-n', { n: 2 }), '（我们的测试电脑上大约 2 分钟）');
  a.equal(zh('setup-local-errors'), '普通说话每 100 个字大约错 3 个。唱歌的部分错字会多一些，可以用「按歌词校准字幕」改。');
  a.equal(zh('setup-local-punct'), '字幕默认不带标点；另外装一个标点模型（下载约 60 MB）就有标点。');   // Deja, 11-03: the licence is Apache-2.0, so it can be installed (test/asr-jj3.test.js)
  a.equal(zh('asr-download'), '下载并使用（约 230 MB）');
  // JJ's final words for the card (Deja, on #102): its title no longer repeats the button's 以后再说, and the text under it
  // no longer starts with the title again; the button keeps 以后再说 / Not now
  a.equal(zh('setup-later-title'), '先不装');
  a.equal(zh('setup-later'), '找高光、剪辑、导出都照常能用，只是不会自动出字幕；你也可以自己导入 SRT 字幕文件。');
  a.equal(en('setup-later-title'), 'Skip for now');
  a.equal(en('setup-later'), "Highlights, editing and export all still work; you just won't get automatic subtitles. You can also import an SRT file.");
  a.ok(!zh('setup-later').includes('先不装') && !en('setup-later').includes('Skip for now'), 'the text does not say the title again');
  a.equal(en('asr-later'), 'Not now');
  a.equal(zh('asr-later'), '以后再说');
  a.equal(zh('setup-dl-title'), '正在下载听写模型');
  a.equal(zh('setup-done-title'), '听写模型装好了'); a.equal(zh('setup-ok'), '好');
  a.equal(zh('setup-net-title'), '没下载完'); a.equal(zh('setup-space-title'), '空间不够'); a.equal(zh('setup-bad-title'), '文件不完整');
  // JJ's English (section five)
  a.equal(en('setup-title'), 'Make subtitles automatically?');
  a.equal(en('asr-download'), 'Download and use (about 230 MB)');
  a.equal(en('asr-later'), 'Not now');
  a.equal(en('setup-local-punct'), 'Captions have no punctuation by default; install a punctuation model (a download of about 60 MB) to get it.');
});
test('the page: three states of the choice and five of the download, from the same functions as the Transcript tab', () => {
  const app = read('app.js');
  a.match(app, /function openAsrSetup\(state\) \{/);
  for (const st of ['dl', 'done', 'net', 'space', 'bad']) a.match(app, new RegExp(`"${st}"`), st);
  a.match(app, /setup-local-n/, 'the {n} line is there');
  a.match(app, /const ASR_TEST_MINUTES = null;/, '…and hidden until Deja gives the number');
  a.ok(!/setup-cloud-go/.test(app.slice(app.indexOf('function openAsrSetup('), app.indexOf('function openAsrSetup(') + 6000)), 'no cloud card yet (cloud transcription is not in #70)');
  a.match(app, /window\.montclipAsr\.setChoice\("later"\)/);
  a.match(app, /window\.montclipAsr\.setChoice\("local"\)/);
  a.match(app, /function maybeOpenAsrSetup\(\) \{/);
});
test('Settings › 听写: the state, and 〔去装〕 opens the page', () => {
  const html = read('index.html'), app = read('app.js');
  a.match(html, /<div class="settings-section hidden" id="setAsr">/);
  a.match(app, /\$\("btnAsrSetup"\)\.addEventListener\("click", \(\) => openAsrSetup\(\)\)/);
  a.equal(zh('setup-settings-title'), '听写'); a.equal(zh('asr-go-install'), '去装'); a.equal(zh('asr-not-installed'), '还没装听写');
});
test('the choice is kept by the main process (the page\'s origin changes every start): "local" | "later", nothing else', () => {
  const main = read('desktop/main.js'), pre = read('desktop/view-preload.js');
  a.match(main, /ipcMain\.handle\("montclip:asr:choice", async \(event, set\) =>/);
  a.match(main, /set === "local" \|\| set === "later"/);
  a.match(main, /path\.join\(app\.getPath\("userData"\), "asr-choice\.json"\)/);
  a.match(pre, /choice:\(\)=>ipcRenderer\.invoke\('montclip:asr:choice'\)/);
  a.match(pre, /setChoice:v=>ipcRenderer\.invoke\('montclip:asr:choice',v==='later'\?'later':'local'\)/);
});
