'use strict';
// 〔删掉 Meta 的模型〕: JJ's final words for the button, its box and asr-meta-broken (Deja, 2026-11-05), word for word,
// and the three things the box says, checked against what the code does:
//   1. it withdraws the agreement to the licence terms, not only the files;
//   2. captions (and transcripts) it already made are kept;
//   3. downloading it again asks for the agreement again.
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const V = require('../ui-preferences');
const C = require('../asr-consent');
const T = require('../desktop/asr-consent-text');
const { manifest } = require('../asr-models');
const { createTranscripts } = require('../transcripts');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const zh = (k, v) => V.t('zh-CN', 'own.' + k, v), en = (k, v) => V.t('en', 'own.' + k, v);
const META = manifest.models.asrMeta;

function tmp(t, name) { const d = fs.mkdtempSync(path.join(os.tmpdir(), name)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
/** Meta's files as a download would leave them (small stand-ins: only their presence counts here). */
function writeMeta(dir, bytes = 1) {
  fs.mkdirSync(path.join(dir, 'asrMeta'), { recursive: true });
  for (const f of Object.keys(META.files)) fs.writeFileSync(path.join(dir, 'asrMeta', f), Buffer.alloc(bytes));
}
const installed = (dir) => () => Object.keys(META.files).every((f) => fs.existsSync(path.join(dir, 'asrMeta', f)));
const consentFile = (dir) => path.join(dir, 'consent', 'asrMeta.json');
/** The streamer says yes to every box; the log says which were asked, in order. */
function yesTo(log) {
  return { license: async () => { log.push('license'); return true; }, source: async () => { log.push('source'); return 1; },
    confirm: async () => { log.push('confirm'); return true; } };
}

test('JJ\'s final words: the button, its box, asr-meta-broken', () => {
  a.equal(zh('asr-meta-revoke'), '删掉 Meta 的模型');
  a.equal(en('asr-meta-revoke'), "Remove Meta's model");
  a.equal(zh('asr-meta-broken'), 'Meta 的模型文件读不了，可能是下载时坏了。点〔删掉 Meta 的模型〕，再重新下载一次；或者换回 Paraformer。');
  a.equal(en('asr-meta-broken'), 'Meta\'s model files can\'t be read; they may have been damaged while downloading. Click "Remove Meta\'s model" and download it again, or switch back to Paraformer.');
  const z = T.asrRevokeText('zh'), e = T.asrRevokeText('en');
  a.equal(z.title, '删掉 Meta 的多语言听写模型？'); a.equal(z.message, z.title);
  a.equal(e.title, "Remove Meta's multilingual speech model?"); a.equal(e.message, e.title);
  a.equal(z.detail, '会删掉这台电脑上的 Meta 模型文件，同时收回你之前对它许可条款的同意。以后想用，重新下载、再同意一次就行。用它听写好的字幕不会删。');
  a.equal(e.detail, "This deletes Meta's model files from this computer and withdraws your earlier agreement to its licence terms. To use it again, download it and agree again. Captions it already made are kept.");
  // in JJ's order, 〔删掉〕 then 〔先不删〕; Enter and Esc keep it
  a.deepEqual(z.buttons, ['删掉', '先不删']); a.deepEqual(e.buttons, ['Remove', 'Keep it']);
  for (const x of [z, e]) { a.equal(x.buttons[x.removeId], x === z ? '删掉' : 'Remove'); a.equal(x.keepId, 1); }
});

test('the optional size: 「（约 {大小}）」 / "(about {size})" when the files on this computer can be measured', () => {
  a.equal(T.asrRevokeText('zh', { bytes: 365439124 }).detail, '会删掉这台电脑上的 Meta 模型文件（约 350 MB），同时收回你之前对它许可条款的同意。以后想用，重新下载、再同意一次就行。用它听写好的字幕不会删。');
  a.equal(T.asrRevokeText('en', { bytes: 365439124 }).detail, "This deletes Meta's model files (about 350 MB) from this computer and withdraws your earlier agreement to its licence terms. To use it again, download it and agree again. Captions it already made are kept.");
  a.match(T.asrRevokeText('zh', { bytes: 3 * 1048576 }).detail, /（约 3 MB）/);
  a.equal(T.asrRevokeText('zh', { bytes: 0 }).detail, T.asrRevokeText('zh').detail, 'nothing on disk: no size');
});

test('the host\'s box: the size measured on this computer, Enter / Esc keep it, only 〔删掉〕 deletes', () => {
  const main = read('desktop/main.js');
  const h = main.slice(main.indexOf('ipcMain.handle("montclip:asr:revoke"'), main.indexOf('// v10: what the streamer chose'));
  a.match(h, /asrRevokeText\(languageOf\(settings\.get\(\)\), \{ bytes: asrConsent\.size\(which\) \}\)/);
  a.match(h, /defaultId: t\.keepId, cancelId: t\.keepId/);
  a.match(h, /if \(answer\.response !== t\.removeId\) return \{ ok: false, declined: true \};/);
  a.match(h, /smokeAnswer\("REVOKE"\) === 1 \? t\.removeId : t\.keepId/, 'a smoke run keeps it unless told to remove');
});

test('size(): what removing would delete — the model folder and half-downloaded parts, nothing else', (t) => {
  const dir = tmp(t, 'mc-rm-size-'), S = C.createConsent({ modelsDir: dir });
  a.equal(S.size('asrMeta'), 0);
  writeMeta(dir, 1000);
  fs.mkdirSync(path.join(dir, '.partial')); fs.writeFileSync(path.join(dir, '.partial', META.files['model.int8.onnx'].sha256 + '.part'), Buffer.alloc(500));
  fs.mkdirSync(path.join(dir, 'asr')); fs.writeFileSync(path.join(dir, 'asr', 'model.int8.onnx'), Buffer.alloc(9999));
  a.equal(S.size('asrMeta'), 3 * 1000 + 500);
});

test('1. it withdraws the agreement, not only the files: the record goes and Meta is no longer allowed', async (t) => {
  const dir = tmp(t, 'mc-rm-1-'), S = C.createConsent({ modelsDir: dir });
  const r = await S.choose('asrMeta', { ask: yesTo([]), installed: installed(dir), download: async () => writeMeta(dir), version: 'test' });
  a.equal(r.ok, true);
  a.ok(fs.existsSync(consentFile(dir))); a.ok(S.record('asrMeta')); a.equal(S.allowed('asrMeta'), true);
  a.equal(S.revoke('asrMeta').ok, true);
  a.equal(fs.existsSync(consentFile(dir)), false, 'the consent record is deleted');
  a.equal(S.record('asrMeta'), null); a.equal(S.allowed('asrMeta'), false);
  a.equal(fs.existsSync(path.join(dir, 'asrMeta')), false, 'and the files');
  // files put back by hand (a USB copy) do not bring the agreement back
  writeMeta(dir);
  a.equal(S.allowed('asrMeta'), false);
});

test('2. captions and transcripts it already made are kept: removing touches only Meta\'s files and record', async (t) => {
  // the desktop layout: models in <userData>/asr-models, the project, its media and transcripts in <userData>/workspace
  const user = tmp(t, 'mc-rm-2-'), models = path.join(user, 'asr-models'), work = path.join(user, 'workspace');
  fs.mkdirSync(path.join(work, 'media'), { recursive: true });
  const S = C.createConsent({ modelsDir: models });
  await S.choose('asrMeta', { ask: yesTo([]), installed: installed(models), download: async () => writeMeta(models), version: 'test' });
  fs.mkdirSync(path.join(models, 'asr')); fs.writeFileSync(path.join(models, 'asr', 'model.int8.onnx'), 'paraformer');
  // a transcript Meta made, and a project with a caption from it
  const media = path.join(work, 'media', 'talk.wav'); fs.writeFileSync(media, Buffer.alloc(64));
  const tr = createTranscripts({ dir: path.join(work, 'analysis', 'transcripts'), resolveSrc: (s) => (s === '/media/talk.wav' ? media : null) });
  tr.put('/media/talk.wav', { v: 1, src: '/media/talk.wav', model: 'omnilingual-meta', language: 'auto', duration: 2, created: '2026-11-05T00:00:00.000Z', words: [['hello', 0.1, 0.4], ['world', 0.5, 0.9]] });
  const project = JSON.stringify({ revision: 3, clips: [{ id: 'c1', kind: 'text', track: 'V2', start: 0, duration: 1, props: { caption: true, text: 'hello world', wordTimes: [[0.1, 0.4], [0.5, 0.9]] } }] });
  fs.writeFileSync(path.join(work, 'project.json'), project);
  const before = tr.get('/media/talk.wav');

  S.revoke('asrMeta');
  a.deepEqual(tr.get('/media/talk.wav'), before, 'the transcript Meta made still reads, words and all');
  a.equal(fs.readFileSync(path.join(work, 'project.json'), 'utf8'), project, 'the captions in the project are untouched');
  a.equal(fs.readFileSync(path.join(models, 'asr', 'model.int8.onnx'), 'utf8'), 'paraformer', 'Paraformer stays');
  a.notEqual(path.relative(models, work).split(path.sep)[0], '', 'the workspace is not inside the models folder');
  a.ok(path.relative(models, work).startsWith('..'));
  // and the desktop really keeps them apart
  const main = read('desktop/main.js');
  a.match(main, /FABLECUT_DATA_DIR: path\.join\(app\.getPath\("userData"\), "workspace"\)/);
  a.match(main, /MONTCLIP_ASR_MODELS_DIR = path\.join\(app\.getPath\("userData"\), "asr-models"\)/);
});

test('2. the page, after 〔删掉〕: a toast, Paraformer chosen, the status read again — nothing else (no transcript, no project edit)', async () => {
  const app = read('app.js');
  const i = app.indexOf('async function asrRevokeMeta('), j = app.indexOf('\n}\n', i);
  const calls = [];
  const ctx = {
    window: { montclipAsr: { revoke: async (k) => { calls.push(['revoke', k]); return { ok: true, revoked: k }; } } },
    asrState: { downloading: false },
    toast: (m) => calls.push(['toast', m]), uiText: (k) => k,
    setAsrKey: (k) => calls.push(['setAsrKey', k]), loadAsrStatus: async () => calls.push(['loadAsrStatus']),
    String,
  };
  // run with only these names: any other global (fetch, the project, the transcript cache) would throw
  vm.runInNewContext(app.slice(i, j + 3), ctx);
  await vm.runInContext('asrRevokeMeta()', ctx);
  a.deepEqual(calls, [['revoke', 'asrMeta'], ['toast', 'own.asr-meta-revoked'], ['setAsrKey', 'asr'], ['loadAsrStatus']]);
});

test('3. downloading it again asks for the agreement again: the licence comes first, "no" downloads nothing', async (t) => {
  const dir = tmp(t, 'mc-rm-3-'), S = C.createConsent({ modelsDir: dir });
  await S.choose('asrMeta', { ask: yesTo([]), installed: installed(dir), download: async () => writeMeta(dir), version: 'test' });
  S.revoke('asrMeta');
  // "no" to the licence this time: nothing is downloaded, no record
  let log = [];
  const no = await S.choose('asrMeta', { ask: { ...yesTo(log), license: async () => { log.push('license'); return false; } },
    installed: installed(dir), download: async () => { log.push('download'); writeMeta(dir); }, version: 'test' });
  a.equal(no.ok, false); a.equal(no.declined, 'license');
  a.deepEqual(log, ['license']); a.equal(S.allowed('asrMeta'), false); a.equal(fs.existsSync(path.join(dir, 'asrMeta')), false);
  // yes: the licence, then the site and the address, then the download, then the record
  log = [];
  const yes = await S.choose('asrMeta', { ask: yesTo(log), installed: installed(dir), download: async () => { log.push('download'); writeMeta(dir); }, version: 'test' });
  a.equal(yes.ok, true);
  a.deepEqual(log, ['license', 'source', 'confirm', 'download']);
  a.equal(S.allowed('asrMeta'), true);
  // the host sends every download of a model with terms through these boxes, and the server refuses Meta without a record
  a.match(read('desktop/main.js'), /if \(AsrConsent\.termsOf\(which\)\) return chooseWithConsent\(which\);/);
  a.match(read('server.js'), /ASR_CONSENT_REQUIRED/);
});

// ── 〔删掉〕 while Meta is transcribing (Rea, 11-05): on Windows its process holds the model's files while it loads them
// (measured on katana: EBUSY at 0.8 s, deleted at 1.5 s), and a transcription whose files were deleted after loading
// still finished and saved a transcript. So: stop it first and wait for its process to end; then the files; then the
// agreement — and when a file still can't be deleted, say so and keep the agreement. ──
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createMetaEngine } = require('../asr-meta-engine');

/** A Meta engine whose child runs `code` (a real process); `children` lists them. */
function engineFor(t, code) {
  const dir = tmp(t, 'mc-rm-eng-'), runner = path.join(dir, 'runner.js'), children = [];
  fs.writeFileSync(runner, code);
  const eng = createMetaEngine({ asrDir: dir, modelsDir: dir, ffmpeg: 'ffmpeg', cacheDir: dir, freeMem: () => 64 * 1024 * 1048576, runner,
    fork: (...x) => { const c = cp.fork(...x); children.push(c); return c; } });
  // never leave a stand-in running when a check fails
  t.after(() => { for (const c of children) if (c.exitCode == null && c.signalCode == null) c.kill('SIGKILL'); });
  return { eng, children, file: path.join(dir, 'rec.wav') };
}
const alive = (c) => c.exitCode == null && c.signalCode == null;
/** rm as on Windows: busy while any of `children` is alive. */
const busyWhile = (children, log) => (p, o) => {
  const busy = children.some(alive); log.push(busy);
  if (busy && fs.existsSync(p)) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
  return fs.rmSync(p, o);
};

test('1. 〔删掉〕 during a Meta transcription: it is stopped, its process has ended, then the files go and the agreement is withdrawn', async (t) => {
  const { eng, children, file } = engineFor(t, 'setInterval(() => {}, 1000);');
  const dir = tmp(t, 'mc-rm-run-'), log = [];
  const S = C.createConsent({ modelsDir: dir, rm: busyWhile(children, log) });
  await S.choose('asrMeta', { ask: yesTo([]), installed: installed(dir), download: async () => writeMeta(dir), version: 'test' });
  const job = eng.transcribe(file, {});
  await new Promise((r) => setTimeout(r, 200));
  a.equal(children.length, 1); a.ok(alive(children[0]), 'transcribing');
  const r = await S.remove('asrMeta', { release: () => eng.release() });
  await a.rejects(job, { code: 'ASR_CANCELLED' }, 'the transcription is cancelled, not "crashed"');
  a.equal(alive(children[0]), false, 'its process has ended');
  a.ok(log.length && log.every((b) => b === false), 'nothing was deleted while it ran');
  a.equal(r.ok, true);
  a.equal(fs.existsSync(path.join(dir, 'asrMeta')), false, 'the files are gone');
  a.equal(S.record('asrMeta'), null); a.equal(S.allowed('asrMeta'), false, 'the agreement is withdrawn');
});

test('the engine: release() with nothing running; while it is releasing, no new Meta transcription starts; a process that will not end', async (t) => {
  const { eng, file } = engineFor(t, 'setInterval(() => {}, 1000);');
  a.deepEqual(await eng.release(), { released: true, stopped: 0 });
  await a.rejects(eng.transcribe(file, {}), { code: 'ASR_BUSY' }, 'held until unhold()');
  eng.unhold();
  // a child that does not end when told (stand-in): release() gives up after its timeout and says so
  const stuck = new EventEmitter(); stuck.kill = () => {}; stuck.send = () => {}; stuck.stderr = null;
  const e2 = createMetaEngine({ freeMem: () => 64 * 1024 * 1048576, fork: () => stuck });
  const job = e2.transcribe(file, {}); job.catch(() => {});
  a.deepEqual(await e2.release({ timeoutMs: 100 }), { released: false, stopped: 1 });
  stuck.emit('exit', null, 'SIGKILL');
  await a.rejects(job, { code: 'ASR_CANCELLED' });
});

test('2. a file that still can\'t be deleted: never "removed"; the streamer is told; the agreement stays (files first, then the record)', async (t) => {
  const dir = tmp(t, 'mc-rm-busy-');
  const S = C.createConsent({ modelsDir: dir, rm: (p, o) => { if (p.endsWith('asrMeta')) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); return fs.rmSync(p, o); } });
  await S.choose('asrMeta', { ask: yesTo([]), installed: installed(dir), download: async () => writeMeta(dir), version: 'test' });
  const r = await S.remove('asrMeta', { release: async () => ({ released: true, stopped: 0 }) });
  a.equal(r.ok, false); a.equal(r.code, 'ASR_REMOVE_INCOMPLETE'); a.deepEqual(r.left, ['asrMeta']);
  a.ok(S.record('asrMeta'), 'the agreement is not withdrawn while its files are still here');
  // the page: the not-removed words, not 「已撤销」, and the model stays chosen
  const app = read('app.js');
  const i = app.indexOf('async function asrRevokeMeta('), j = app.indexOf('\n}\n', i);
  const calls = [];
  const ctx = { window: { montclipAsr: { revoke: async () => r } }, asrState: { downloading: false },
    toast: (m) => calls.push(['toast', m]), uiText: (k) => k, setAsrKey: (k) => calls.push(['setAsrKey', k]), loadAsrStatus: async () => calls.push(['loadAsrStatus']), String };
  vm.runInNewContext(app.slice(i, j + 3), ctx);
  await vm.runInContext('asrRevokeMeta()', ctx);
  a.deepEqual(calls, [['toast', 'own.asr-meta-remove-incomplete'], ['loadAsrStatus']]);
  // the words (drafts for JJ)
  a.equal(zh('asr-meta-remove-incomplete'), 'Meta 的模型没删干净：有的文件正被占用，删不掉。你对许可条款的同意还没收回。关掉 MontClip 再打开，然后再点一次〔删掉 Meta 的模型〕。');
  a.equal(en('asr-meta-remove-incomplete'), "Meta's model wasn't fully removed: some of its files are in use and couldn't be deleted. Your agreement to its licence terms hasn't been withdrawn yet. Close MontClip, open it again, then click “Remove Meta's model” once more.");
});

test('the wiring: after 〔删掉〕 the host has the server stop Meta and wait, then removes; the server stops only a Meta job', () => {
  const main = read('desktop/main.js');
  const h = main.slice(main.indexOf('ipcMain.handle("montclip:asr:revoke"'), main.indexOf('// v10: what the streamer chose'));
  a.ok(h.indexOf('showMessageBox') < h.indexOf('asrConsent.remove('), 'asked first');
  a.match(h, /fetch\(origin \+ "\/api\/asr\/meta\/release", \{ method: "POST", headers: \{ "X-MontClip-Session": token/);
  a.match(h, /await asrConsent\.remove\(which, \{ release: \(\) => release\(\{\}\) \}\)/);
  a.match(h, /finally \{ release\(\{ done: true \}\)/);
  const server = read('server.js');
  const s = server.slice(server.indexOf('p === "/api/asr/meta/release"'), server.indexOf('p === "/api/asr/transcribe"'));
  a.match(s, /j && j\.key === "asrMeta"/); a.match(s, /await asrMeta\(\)\.release\(\)/); a.match(s, /asrMeta\(\)\.unhold\(\)/);
  a.match(server, /job = asrJob\.running = \{ src, ac, key \}/);
});

// the real model, on this computer: Meta transcribing, 〔删掉〕 0.8 s in (while it is loading the model)
const VENDOR = path.join(ROOT, 'vendor', 'asr'), META_DIR = process.env.MONTCLIP_TEST_META_DIR;
const ENGINE = fs.existsSync(path.join(VENDOR, 'engine', 'node_modules', 'sherpa-onnx-node', 'package.json'));
test('real Meta model: 〔删掉〕 0.8 s into a transcription removes everything', { skip: !(ENGINE && META_DIR) && 'set MONTCLIP_TEST_META_DIR (and have vendor/asr)' }, async (t) => {
  const dir = tmp(t, 'mc-rm-real-');
  const S = C.createConsent({ modelsDir: dir });
  await S.choose('asrMeta', { ask: yesTo([]), installed: installed(dir), version: 'test', download: async () => {
    fs.mkdirSync(path.join(dir, 'asrMeta'));
    for (const f of Object.keys(META.files)) fs.copyFileSync(path.join(META_DIR, 'asrMeta', f), path.join(dir, 'asrMeta', f));
  } });
  const ff = require('../ffmpeg-path').path('ffmpeg'), speech = path.join(dir, 'tone.wav');
  cp.execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=300:d=20', '-ar', '16000', '-y', speech]);
  let child = null;
  const eng = createMetaEngine({ asrDir: VENDOR, modelsDir: dir, ffmpeg: ff, cacheDir: path.join(dir, 'cache'), fork: (...x) => (child = cp.fork(...x)) });
  const job = eng.transcribe(speech, {}); job.catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  a.ok(child && alive(child), 'still loading or transcribing');
  const r = await S.remove('asrMeta', { release: () => eng.release() });
  a.equal(r.ok, true, JSON.stringify(r));
  a.equal(alive(child), false);
  a.equal(fs.existsSync(path.join(dir, 'asrMeta')), false); a.equal(S.allowed('asrMeta'), false);
});
