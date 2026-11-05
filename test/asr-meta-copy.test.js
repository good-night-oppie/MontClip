'use strict';
// JJ's final words for Meta's model (Deja, 2026-11-04), word for word; the 〔换回 Paraformer〕 button on "Meta's model
// stopped" really switches the speech model back; and, by the rule for anything sent out, the box shown just before the
// download names the address the streamer chose this time (github's when she chose github, hf-mirror's when hf-mirror).
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const V = require('../ui-preferences');
const C = require('../asr-consent');
const { manifest } = require('../asr-models');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const zh = (k, v) => V.t('zh-CN', 'own.' + k, v), en = (k, v) => V.t('en', 'own.' + k, v);

test('JJ\'s final words: stopped, no memory, where Meta fits (tab and Settings), hf-mirror failed', () => {
  a.equal(zh('asr-meta-crashed'), 'Meta 的模型出错停了，这次没有听写完。你的剪辑都还在。把「听写模型」换回 Paraformer 再听写就行。');
  a.equal(en('asr-meta-crashed'), "Meta's model stopped with an error, so this transcription didn't finish. Your edits are all still there. Switch the speech model back to Paraformer and transcribe again.");
  a.equal(zh('asr-switch-paraformer'), '换回 Paraformer'); a.equal(en('asr-switch-paraformer'), 'Switch to Paraformer');
  a.equal(zh('asr-meta-no-memory', { need: '1000 MB', free: '600 MB' }), '内存不够跑 Meta 的模型（大约要 1000 MB，现在只空着 600 MB），所以没有开始。关掉一些软件再试，或者换回 Paraformer。');
  a.equal(en('asr-meta-no-memory', { need: '1000 MB', free: '600 MB' }), "There isn't enough free memory for Meta's model (it needs about 1000 MB; 600 MB is free), so it didn't start. Close some programs and try again, or switch back to Paraformer.");
  // the Transcript tab: without the pointer to the menu; Settings: with it
  a.equal(zh('asr-meta-fit'), 'Meta 的多语言模型适合英文和其他外语。中文直播请继续用 Paraformer：在公开测试里，Meta 听中文的错字大约是它的 4 倍。');
  a.equal(en('asr-meta-fit'), "Meta's multilingual model is for English and other languages. For Chinese streams, keep Paraformer: in public tests Meta made about four times as many mistakes on Chinese.");
  a.equal(zh('asr-meta-fit-settings'), 'Meta 的多语言模型适合英文和其他外语（文稿页「听写模型」里可以选）。中文直播请继续用 Paraformer：在公开测试里，Meta 听中文的错字大约是它的 4 倍。');
  // JJ's final English pointer, with curly quotes, naming the menu as the English UI does ("asr-model": Speech model)
  a.equal(en('asr-meta-fit-settings'), "Meta's multilingual model is for English and other languages (you can pick it on the Transcript tab, under “Speech model”). For Chinese streams, keep Paraformer: in public tests Meta made about four times as many mistakes on Chinese.");
  a.equal(en('asr-model'), 'Speech model', 'the menu is called what the sentence says');
  a.match(read('index.html'), /id="setAsrMetaFit" data-i18n="own\.asr-meta-fit-settings"/, 'Settings shows the version with the pointer');
  a.match(read('app.js'), /data-tr-asr-fit hidden data-i18n="own\.asr-meta-fit"/, 'the Transcript tab the one without');
  const m = { mirror: 'hf-mirror.com', github: 'github.com' };
  a.equal(zh('asr-meta-mirror-failed', m), '从 hf-mirror.com 没下载成功（在中国大陆以外常常会这样，网络不稳的时候也会）。请再点一次「下载并使用」，改选 github.com。');
  // the button's name in curly quotes (the house rule for quoted words in English; Deja 11-05); 「下载并使用」 unchanged
  a.equal(en('asr-meta-mirror-failed', m), 'It didn\'t download from hf-mirror.com (this often happens outside mainland China, or when the connection is unstable). Click “Download and use” again and choose github.com.');
});

test('not enough memory, JJ\'s three cases: both numbers; only what it needs; none (never "? MB")', () => {
  const app = read('app.js');
  const i = app.indexOf('function asrMetaWords('), j = app.indexOf('\n}\n', i);
  for (const [lang, both, needOnly, none] of [
    ['zh-CN', '内存不够跑 Meta 的模型（大约要 1000 MB，现在只空着 600 MB），所以没有开始。关掉一些软件再试，或者换回 Paraformer。',
      '内存不够跑 Meta 的模型（大约要 1000 MB），所以没有开始。关掉一些软件再试，或者换回 Paraformer。',
      '内存不够跑 Meta 的模型，所以没有开始。关掉一些软件再试，或者换回 Paraformer。'],
    ['en', "There isn't enough free memory for Meta's model (it needs about 1000 MB; 600 MB is free), so it didn't start. Close some programs and try again, or switch back to Paraformer.",
      "There isn't enough free memory for Meta's model (it needs about 1000 MB), so it didn't start. Close some programs and try again, or switch back to Paraformer.",
      "There isn't enough free memory for Meta's model, so it didn't start. Close some programs and try again, or switch back to Paraformer."]]) {
    // the real asrMetaWords from app.js, with the real words
    const ctx = { uiText: (k, v) => V.t(lang, k, v), Number };
    vm.runInNewContext(app.slice(i, j + 3), ctx);
    const say = (x) => vm.runInContext('asrMetaWords(' + JSON.stringify({ engine: 'meta', code: 'ASR_OPTIONAL_NO_MEMORY', ...x }) + ')', ctx);
    // 1. both
    a.equal(say({ needMB: 1000, freeMB: 600 }), both);
    a.match(say({ needMB: 1000, freeMB: 0 }), lang === 'en' ? /0 MB is free/ : /只空着 0 MB/, 'nothing free is a number too');
    // 2. what it needs, without what is free
    for (const x of [{ needMB: 1000 }, { needMB: 1000, freeMB: null }, { needMB: 1000, freeMB: '' }, { needMB: 1000, freeMB: 'x' }]) a.equal(say(x), needOnly, lang + ' ' + JSON.stringify(x));
    // 3. no need (only free counts as none too): no brackets at all
    for (const x of [{}, { freeMB: 600 }, { needMB: null, freeMB: 600 }, { needMB: 'lots', freeMB: 600 }, { needMB: 0, freeMB: 600 }]) {
      const w = say(x);
      a.equal(w, none, lang + ' ' + JSON.stringify(x));
      a.ok(!w.includes('?') && !w.includes('MB'));
    }
  }
});

test('〔换回 Paraformer〕 on "Meta\'s model stopped": one click and the chosen speech model is Paraformer', () => {
  const app = read('app.js');
  const take = (start, end) => { const i = app.indexOf(start), j = app.indexOf(end, i); a.ok(i >= 0 && j > i, start); return app.slice(i, j); };
  const store = new Map([['montclip.asrModel', 'asrMeta']]);
  const shown = [];
  const ctx = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    uiText: (k) => (k === 'own.asr-switch-paraformer' ? '换回 Paraformer' : k),
    toastAction: (msg, label, onClick) => shown.push({ msg, label, onClick }),
    paintAsrStatus: () => {}, renderTranscript: () => {},
  };
  // the real functions from app.js: the chosen model, and what a failed Meta transcription shows
  vm.runInNewContext(take('const ASR_MODEL_KEY', 'const asrModelStatus') + take('function asrMetaFailToast(', '\n}\n') + '\n}\n', ctx);
  a.equal(vm.runInContext('asrKey()', ctx), 'asrMeta');
  a.equal(vm.runInContext('asrMetaFailToast({ code: "ASR_OPTIONAL_CRASHED", error: "Meta 的模型出错停了……" })', ctx), true);
  a.equal(shown.length, 1); a.equal(shown[0].label, '换回 Paraformer'); a.equal(shown[0].msg, 'Meta 的模型出错停了……');
  shown[0].onClick();
  a.equal(vm.runInContext('asrKey()', ctx), 'asr', 'the speech model is Paraformer now');
  a.equal(store.get('montclip.asrModel'), 'asr');
  // other failures keep the plain toast (no button)
  a.equal(vm.runInContext('asrMetaFailToast({ code: "ASR_OPTIONAL_NO_MEMORY", error: "x" })', ctx), false);
  a.match(app, /if \(asrMetaFailToast\(out\.failed\[0\]\)\) return;/, 'the Transcript tab uses it');
});

test('the box just before the download names the address chosen this time: github\'s for github, hf-mirror\'s for hf-mirror', async (t) => {
  const T = require('../desktop/asr-consent-text');
  const [mirror, github] = manifest.models.asrMeta.sources;
  for (const [pick, want, notWant] of [[1, github.url, mirror.base], [0, mirror.base, github.url]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-confirm-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const log = [];
    let confirmQ = null;
    const r = await C.createConsent({ modelsDir: dir }).choose('asrMeta', { installed: () => false,
      ask: { license: async () => true, source: async () => pick,
        confirm: async (q) => { confirmQ = q; log.push('confirm'); return false; } },
      download: async () => { log.push('download'); } });
    a.equal(r.ok, false); a.equal(r.declined, 'download');
    a.deepEqual(log, ['confirm'], 'asked before, and "no" downloads nothing');
    a.equal(confirmQ.url, want);
    // the words of that box: the chosen address in full, not the other site
    for (const lang of ['zh', 'en']) {
      const box = T.asrConfirmText(lang, confirmQ);
      a.ok(box.detail.includes(want), lang + ' shows ' + want);
      a.ok(!box.detail.includes(notWant), lang + ' does not show ' + notWant);
    }
  }
  const main = read('desktop/main.js');
  // (main.js adds the hosts GitHub passes downloads on to: also)
  a.match(main, /confirm: async \(q\) => \(await ask\(asrConfirmText\(lang, \{ \.\.\.q, also: [^\n]*\), "CONFIRM"\)\) === 1,/);
});

// Deja 11-05: not enough memory and files that can't be read show only their own sentence too — no "Couldn't transcribe: "
// before it, in either language — with 〔换回 Paraformer〕, as "Meta's model stopped" does.
test('not enough memory, files that can\'t be read: only the plain sentence, with 〔换回 Paraformer〕 (no code, no English before it)', async () => {
  const app = read('app.js');
  const take = (start, end) => { const i = app.indexOf(start), j = app.indexOf(end, i); a.ok(i >= 0 && j > i, start); return app.slice(i, j); };
  // the real chain the Transcript tab runs: transcribeFromTab → transcribeSrcs → transcribeFile → asrMetaWords → asrMetaFailToast
  const code = take('const ASR_MODEL_KEY', 'const asrModelStatus') + take('function asrMetaFailToast(', '\n}\n') + '\n}\n'
    + take('function asrMetaWords(', '/** Transcribe files one after another.')
    + take('async function transcribeSrcs(', '\n}\n') + '\n}\n' + take('async function transcribeFromTab(', '\n}\n') + '\n}\n';
  // what the server answers (server.js: engine "meta", the engine's own English message)
  const answers = {
    'asr-meta-no-memory': { code: 'ASR_OPTIONAL_NO_MEMORY', engine: 'meta', needMB: 1000, freeMB: 600, error: "not enough free memory for Meta's model: about 1000 MB needed, 600 MB free" },
    'asr-meta-broken': { code: 'ASR_OPTIONAL_MODEL_BROKEN', engine: 'meta', error: 'Failed to create offline recognizer' },
  };
  for (const lang of ['zh-CN', 'en']) {
    for (const [key, answer] of Object.entries(answers)) {
      const shown = [], stored = new Map([['montclip.asrModel', 'asrMeta']]);
      const ctx = {
        localStorage: { getItem: (k) => (stored.has(k) ? stored.get(k) : null), setItem: (k, v) => stored.set(k, String(v)) },
        uiText: (k, v) => V.t(lang, k, v), Number, String, Object, JSON, Math,
        fetch: async () => ({ ok: false, status: answer.code === 'ASR_OPTIONAL_NO_MEMORY' ? 409 : 500, json: async () => answer }),
        transcribeAvailable: () => true, transcribeSettings: () => ({}), trState: { busy: null }, renderTranscript: () => {}, paintTranscribeBusy: () => {},
        loadAsrStatus: () => {}, paintAsrStatus: () => {}, transcribeTargets: () => ({ srcs: ['/media/a.wav'] }), trGapDur: () => '', loadTranscript: async () => null,
        toast: (m) => shown.push({ m }), toastAction: (m, label, fn) => shown.push({ m, label, fn }),
      };
      vm.runInNewContext(code, ctx);
      await vm.runInContext('transcribeFromTab()', ctx);
      const want = V.t(lang, 'own.' + key, { need: '1000 MB', free: '600 MB' }), what = lang + ' ' + key;
      a.equal(shown.length, 1, what);
      a.equal(shown[0].m, want, what + ': the sentence alone');
      a.ok(!/ASR_|Couldn't|offline recognizer|needed,/.test(shown[0].m), what + ': no code, no engine message');
      if (lang !== 'en') a.ok(!/[A-Za-z]{2,}/.test(shown[0].m.replace(/Meta|Paraformer|MB/g, '')), what + ': no English in the Chinese');
      a.equal(shown[0].label, V.t(lang, 'own.asr-switch-paraformer'), what + ': 〔换回 Paraformer〕');
      shown[0].fn();
      a.equal(stored.get('montclip.asrModel'), 'asr', what + ': one click and the speech model is Paraformer');
    }
  }
});
