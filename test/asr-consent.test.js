'use strict';
// Meta's Omnilingual ASR is an optional speech model (#133); ADR 2026-11-04 #122 §6 says how such a model is offered:
// its licence text first, in the host's own box, then the site, and only then a download; a consent record on this
// computer; revoking deletes the model and the record and goes back to Paraformer; nobody but the streamer can agree
// (no agree field). These tests hold that (asr-consent.js, server.js, desktop/main.js). No network.
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const C = require('../asr-consent');
const { manifest } = require('../asr-models');
const { startServer, makeDataDir } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-consent-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const meta = manifest.models.asrMeta;
/** Put Meta's model files in place as a download or a USB import would (fake bytes; the store is not asked here). */
const placeFiles = (dir) => { fs.mkdirSync(path.join(dir, 'asrMeta'), { recursive: true }); for (const n of Object.keys(meta.files)) fs.writeFileSync(path.join(dir, 'asrMeta', n), 'x'); };

test('the manifest: Meta needs consent, Paraformer and punctuation do not; the licence text shipped is the model\'s own LICENSE', () => {
  a.equal(C.termsOf('asr'), null); a.equal(C.termsOf('punct'), null);
  const t = C.termsOf('asrMeta');
  a.match(t.revision, /^[0-9a-f]{40}$/, 'a commit, not a branch');
  const lic = fs.readFileSync(path.join(ROOT, t.license.file));
  a.equal(sha(lic), t.license.sha256);
  a.equal(meta.files.LICENSE.sha256, t.license.sha256, 'the LICENSE downloaded with the model is the same text');
  a.match(lic.toString(), /Copyright 2025 \(c\) Meta Platforms, Inc\. and affiliates\.[\s\S]*Apache License, Version 2\.0/);
  // the domestic source first, pinned to the revision; then the GitHub archive (pinned by its SHA-256)
  a.equal(new URL(meta.sources[0].base).hostname, 'hf-mirror.com');
  a.ok(meta.sources[0].base.includes('/resolve/' + t.revision + '/'));
  a.equal(meta.sources[1].kind, 'archive'); a.match(meta.sources[1].sha256, /^[0-9a-f]{64}$/);
  a.deepEqual(manifest.models.asr.sources.map((s) => s.base || s.url), [
    'https://hf-mirror.com/csukuangfj/sherpa-onnx-paraformer-zh-2023-09-14/resolve/def027084691107096b5ebba69785756d63de6c5/',
    'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-2023-09-14.tar.bz2'], 'Paraformer untouched');
});

test('choose: the licence first, then the site, then the download, then the record — no request before both answers', async (t) => {
  const dir = tmp(t), log = [];
  const S = C.createConsent({ modelsDir: dir, now: () => new Date('2026-11-04T12:00:00Z') });
  let have = false;
  const r = await S.choose('asrMeta', { version: '1.18.0', installed: () => have,
    ask: { license: async (q) => { log.push('licence'); a.match(q.text, /Apache License, Version 2\.0/); return true; },
      source: async (q) => { log.push('site'); a.deepEqual(q.sites, ['hf-mirror.com', 'github.com']); return 1; } },
    download: async (pick) => { log.push('download ' + pick); placeFiles(dir); have = true; } });
  a.equal(r.ok, true);
  a.deepEqual(log, ['licence', 'site', 'download 1']);
  a.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'consent', 'asrMeta.json'), 'utf8')),
    { model: meta.id, revision: C.termsOf('asrMeta').revision, licenseSha256: C.termsOf('asrMeta').license.sha256, agreedAt: '2026-11-04T12:00:00.000Z', montclipVersion: '1.18.0' });
  a.equal(S.allowed('asrMeta'), true);
});

test('no to the licence, no site, or a cancelled download: nothing requested (or kept), no record, back to Paraformer', async (t) => {
  for (const [ask, dl] of [
    [{ license: async () => false, source: async () => 0 }, null],
    [{ license: async () => true, source: async () => null }, null],
    [{ license: async () => true, source: async () => 0 }, async () => { throw Object.assign(new Error('cancelled'), { code: 'ASR_DOWNLOAD_CANCELLED' }); }]]) {
    const dir = tmp(t), S = C.createConsent({ modelsDir: dir });
    let asked = 0;
    fs.mkdirSync(path.join(dir, '.partial'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.partial', meta.files['model.int8.onnx'].sha256 + '.part'), 'half');
    const r = await S.choose('asrMeta', { installed: () => false, ask, download: dl || (async () => { asked++; }) });
    a.equal(r.ok, false); a.ok(r.declined);
    a.equal(asked, 0, 'no download');
    a.equal(S.allowed('asrMeta'), false);
    a.ok(!fs.existsSync(path.join(dir, '.partial', meta.files['model.int8.onnx'].sha256 + '.part')), 'what was half there is gone too');
  }
  // no box to ask in (an agent, a tool): refused before anything
  const S = C.createConsent({ modelsDir: tmp(t) });
  await a.rejects(S.choose('asrMeta', { installed: () => false, download: async () => { throw new Error('no'); } }), { code: 'ASR_CONSENT_NO_ASK' });
});

test('files already here (a USB import): the licence is still asked, the site is not, nothing is downloaded', async (t) => {
  const dir = tmp(t), S = C.createConsent({ modelsDir: dir });
  placeFiles(dir);
  const log = [];
  const r = await S.choose('asrMeta', { installed: () => true, download: async () => log.push('download'),
    ask: { license: async () => { log.push('licence'); return true; }, source: async () => { log.push('site'); return 0; } } });
  a.equal(r.ok, true); a.deepEqual(log, ['licence']);
});

test('a record for another revision or licence text does not count; revoking deletes the model and the record', async (t) => {
  const dir = tmp(t), S = C.createConsent({ modelsDir: dir });
  placeFiles(dir);
  S.agree('asrMeta', 't');
  const f = path.join(dir, 'consent', 'asrMeta.json'), rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  fs.writeFileSync(f, JSON.stringify({ ...rec, revision: 'b'.repeat(40) })); a.equal(S.allowed('asrMeta'), false);
  fs.writeFileSync(f, JSON.stringify({ ...rec, licenseSha256: 'c'.repeat(64) })); a.equal(S.allowed('asrMeta'), false);
  fs.writeFileSync(f, JSON.stringify(rec)); a.equal(S.allowed('asrMeta'), true);
  a.equal(S.revoke('asrMeta').ok, true);
  a.ok(!fs.existsSync(f)); a.ok(!fs.existsSync(path.join(dir, 'asrMeta')));
  a.equal(S.allowed('asrMeta'), false);
  a.equal(S.allowed('asr'), true, 'Paraformer needs no record');
});

test('the server: Meta\'s files without a record are not used; an agree field is refused; Paraformer is untouched', async (t) => {
  const dataDir = makeDataDir(t), models = path.join(dataDir, 'models');
  // Meta's real file sizes and hashes cannot be faked cheaply: the server is told the files are there by the store, so
  // here only the record side is checked — no record: not ready, and a request for it waits for the streamer
  const asrDir = path.join(dataDir, 'asr'); fs.mkdirSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node'), { recursive: true });
  fs.writeFileSync(path.join(asrDir, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json'), '{}');
  fs.writeFileSync(path.join(asrDir, 'silero_vad.onnx'), Buffer.alloc(manifest.engine.vad.size));
  const s = await startServer(t, dataDir, { MONTCLIP_ASR_DIR: asrDir, MONTCLIP_ASR_MODELS_DIR: models });
  const st = await (await fetch(s.base + '/api/asr/status')).json();
  a.equal(st.asrMeta.consented, false); a.equal(st.asrMeta.ready, false); a.equal(st.asrMeta.installed, false);
  a.ok(!('consented' in st.asr), 'Paraformer\'s status has no consent in it');
  const media = path.join(dataDir, 'media', 'a.wav'); fs.mkdirSync(path.dirname(media), { recursive: true }); fs.writeFileSync(media, Buffer.alloc(100));
  for (const body of [{ src: '/media/a.wav', model: 'meta', agree: true }, { src: '/media/a.wav', model: 'meta', consent: 'yes' }, { src: '/media/a.wav', accepted: 1 }]) {
    const r = await fetch(s.base + '/api/asr/transcribe', { method: 'POST', body: JSON.stringify(body) });
    a.equal(r.status, 400); a.equal((await r.json()).code, 'ASR_AGREE_NOT_ACCEPTED');
  }
  a.ok(!fs.existsSync(path.join(models, 'consent')), 'nothing written');
});

test('the desktop host: the licence box and the site box are its own, "no" by default; the page names the model only', () => {
  const main = read('desktop/main.js'), pre = read('desktop/view-preload.js');
  const fn = main.slice(main.indexOf('async function chooseWithConsent'), main.indexOf('ipcMain.handle("montclip:asr:revoke"'));
  a.match(fn, /defaultId: 0, cancelId: 0/);
  a.match(fn, /license: async \(q\) => \(await ask\(asrLicenseText\(lang, q\), "LICENSE"\)\) === 1/);
  a.match(fn, /sources: \[model\.sources\[pick\]\]/, 'the chosen site only');
  a.match(main, /if \(AsrConsent\.termsOf\(which\)\) return chooseWithConsent\(which\);/);
  a.match(pre, /revoke:which=>ipcRenderer\.invoke\('montclip:asr:revoke',which==='asrMeta'\?'asrMeta':''\)/);
  a.ok(!/agree/i.test(pre), 'nothing the page can send agrees');
  const T = require('../desktop/asr-consent-text');
  const lic = T.asrLicenseText('zh', { name: 'X', licenseName: 'Apache License 2.0', text: 'LICENSE TEXT' });
  a.deepEqual(lic.buttons, ['不同意', '同意']); a.ok(lic.detail.startsWith('LICENSE TEXT'));
  const src = T.asrSourceText('zh', { mb: [350, 280], sites: ['hf-mirror.com', 'github.com'], hosts: ['hf-mirror.com', 'github.com', 'release-assets.githubusercontent.com'] });
  a.deepEqual(src.buttons, ['取消', '从 hf-mirror.com 下载（约 350 MB）', '从 github.com 下载（约 280 MB）']);
  a.match(src.detail, /release-assets\.githubusercontent\.com/); a.match(src.detail, /只有下载请求/); a.match(src.detail, /IP/);
});

test('where Meta fits, said in Settings and in the Transcript tab; a failed hf-mirror download suggests github.com', async (t) => {
  const V = require('../ui-preferences'), html = read('index.html'), app = read('app.js');
  const fit = (lang) => V.t(lang, 'own.asr-meta-fit');
  a.match(fit('zh-CN'), /适合英文和其他外语/); a.match(fit('zh-CN'), /中文直播请继续用 Paraformer/);
  a.match(fit('en'), /for English and other languages/);
  a.match(html, /id="setAsrMetaFit" data-i18n="own\.asr-meta-fit"/, 'Settings › Transcription says it');
  a.match(app, /data-tr-asr-fit hidden data-i18n="own\.asr-meta-fit"/, 'and the Transcript tab, while Meta is chosen');
  a.match(V.t('zh-CN', 'own.asr-meta-mirror-failed', { mirror: 'hf-mirror.com', github: 'github.com' }), /从 hf-mirror\.com 没下载成功[\s\S]*改选 github\.com/);
  // choose() says which site failed, so the page can suggest the other
  const S = C.createConsent({ modelsDir: tmp(t) });
  const r = await S.choose('asrMeta', { installed: () => false, ask: { license: async () => true, source: async () => 0 },
    download: async () => { throw Object.assign(new Error('not a listed host: huggingface.co'), { code: 'ASR_DOWNLOAD_FAILED' }); } });
  a.equal(r.ok, false); a.equal(r.site, 'hf-mirror.com');
  a.match(app, /r\.site === "hf-mirror\.com"\) asrState\.note = uiText\("own\.asr-meta-mirror-failed", \{ mirror: "hf-mirror\.com", github: "github\.com" \}\)/);
});
