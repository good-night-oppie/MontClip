'use strict';
// JJ's five changes for #70 and Deja's decision on the punctuation model (2026-11-03).
// The punctuation model's licence was checked first: both official model cards — ModelScope
// iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch and FunASR's Hugging Face funasr/ct-punc — say Apache-2.0
// and do not link the FunASR Model License (FunASR's README: that agreement applies when a model card links it;
// SenseVoice's card does, this one does not). So, Deja's Apache branch: the streamer may install it, the 完整版 has it,
// and the settings say so until it is installed. The licence is in LICENSES.md and licenses/asr/.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..'), read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const V = require('../shared/ui-preferences'), { asrDownloadText } = require('../desktop/asr-text');
const zh = (k, v) => V.t('zh-CN', 'own.' + k, v), en = (k, v) => V.t('en', 'own.' + k, v);
const CJK = /[　-〿㐀-鿿＀-￯]/;
const GH = 'release-assets.githubusercontent.com、objects.githubusercontent.com', GH_EN = 'release-assets.githubusercontent.com, objects.githubusercontent.com';

test('1. the download box: buttons in the interface language, Cancel first and focused', () => {
  for (const which of ['asr', 'punct']) {
    a.deepEqual(asrDownloadText('zh-CN', which).buttons, ['取消', '下载']);
    a.deepEqual(asrDownloadText('en', which).buttons, ['Cancel', 'Download']);
  }
  const main = read('desktop/main.js'), at = main.indexOf('const t = asrDownloadText(languageOf(settings.get()), which);');
  a.ok(at > 0);
  a.match(main.slice(at, at + 400), /buttons: t\.buttons, defaultId: 0, cancelId: 0/, 'Cancel (index 0) is the default and the Esc answer');
});

test('2. where a download may be passed on: GitHub\'s file servers only, in plain words', () => {
  for (const which of ['asr', 'punct']) {
    const z = asrDownloadText('zh-CN', which).detail, e = asrDownloadText('en', which).detail;
    a.ok(z.includes('（下载时可能会转到 GitHub 存文件的网站：' + GH + '，不会去别的网站）'), which + ': ' + z);
    a.ok(e.includes("(the download may be passed on to GitHub's file servers: " + GH_EN + '; no other sites)'), which + ': ' + e);
    a.ok(!/跳转时只去|redirects only to/.test(z + e));
  }
  // the punctuation model comes from GitHub only: hf-mirror.com is not one of GitHub's file servers
  a.ok(!/GitHub 存文件的网站：[^）]*hf-mirror/.test(asrDownloadText('zh-CN', 'punct').detail));
});

test('4. the failures say what to do next', () => {
  a.equal(zh('asr-download-failed', { why: 'X' }), '下载没成功（X）。检查一下网络，再点「再下载一次」。');
  a.equal(zh('asr-import-failed', { why: 'X' }), '导入没成功（X）。换一个文件夹，或者再试一次。');
  a.equal(zh('asr-import-none'), '选的文件里没有听写模型。请选从别的电脑拷来的那个模型文件夹。');
  a.equal(zh('asr-again'), '再下载一次', 'the button the sentence names');
  for (const k of ['asr-download-failed', 'asr-import-failed', 'asr-import-none']) a.ok(en(k, { why: 'X' }) && !CJK.test(en(k, { why: 'X' })), k);
  a.match(en('asr-download-failed', { why: 'X' }), /\(X\)[\s\S]*Download again/);
  a.match(en('asr-import-failed', { why: 'X' }), /\(X\)[\s\S]*folder/);
  a.match(en('asr-import-none'), /folder/);
});

test('3. punctuation (Apache branch): the sentence, shown only while the model is missing, and a way to install it', () => {
  a.equal(zh('setup-local-punct'), '字幕默认不带标点；另外装一个标点模型（下载约 60 MB）就有标点。');
  a.ok(en('setup-local-punct') && !CJK.test(en('setup-local-punct')) && /download of about 60 MB/.test(en('setup-local-punct')));
  const app = read('app/app.js');
  a.match(app, /function asrPunctReady\(\) \{ return !!\(asrState\.status && asrState\.status\.punct && asrState\.status\.punct\.ready\); \}/);
  // the setup page's line goes once the model is installed
  a.match(app, /\$\{asrPunctReady\(\) \? "" : `<li>\$\{h\("setup-local-punct"\)\}<\/li>`\}/);
  // Settings › 听写: the line and its button while the speech model is installed and punctuation is not
  const paint = app.slice(app.indexOf('function paintSettingsAsr('), app.indexOf('function transcribeFile') > 0 ? app.indexOf('async function transcribeFile') : undefined);
  a.match(paint, /const punctOpen = ready && !asrPunctReady\(\);/);
  a.match(paint, /\$\("setAsrPunct"\)\.hidden = !punctOpen;/);
  a.match(app, /async function asrGetPunct\(\) \{[\s\S]{0,600}window\.montclipAsr\.download\("punct"\)/);
  const html = read('app/index.html');
  a.match(html, /id="setAsrPunct"[^>]*>[\s\S]{0,400}id="btnAsrPunct"/);
  for (const k of ['asr-punct-get', 'asr-punct-getting', 'asr-punct-ready']) a.ok(zh(k) && en(k) && !CJK.test(en(k)), k);
  // the 完整版 keeps every model under vendor/asr/models, punctuation included
  a.match(read('desktop/package-win.cjs'), /const asrKeep = \(f\) => !isUnder\(f, 'test_wavs'\) && \(full \|\| !isUnder\(f, 'models'\)\);/);
});

test('3. the licence is recorded with where it was checked', () => {
  const lic = read('LICENSES.md'), row = lic.split('\n').find((l) => l.includes('CT-Transformer punctuation'));
  a.ok(row, 'LICENSES.md row');
  for (const s of ['Apache-2.0', 'modelscope.cn/models/iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch', 'huggingface.co/funasr/ct-punc', 'MODEL_LICENSE'])
    a.ok(row.includes(s), 'LICENSES.md row names ' + s);
  const file = read('licenses/asr/ct-transformer-Apache-2.0.txt');
  for (const s of ['huggingface.co/funasr/ct-punc', 'does not link', '2026-11-03']) a.ok(file.includes(s), 'licence file: ' + s);
  a.match(file, /Apache License\s+Version 2\.0, January 2004/);
  const m = require('../desktop/asr-manifest.json').models.punct;
  a.match(m.license, /^Apache-2\.0 \(model cards: modelscope\.cn\/models\/iic\/punc_ct-transformer_zh-cn-common-vocab272727-pytorch and huggingface\.co\/funasr\/ct-punc/);
});
