'use strict';
// The optional speech model (Deja, 2026-11-04; ADR 2026-11-04 §6 「可选模型的分发与同意」): Meta's Omnilingual ASR,
// an extra choice next to the default Paraformer zh, never in the package. These tests hold the rules: the licence and
// the site are asked before any request; files are pinned (revision, size, SHA-256, plain data only, listed https
// hosts); a file that does not match is deleted and the model is not used; without a consent record it is not used;
// a deleted file puts transcription back on the default; revoking deletes the model and the record; nobody but the
// streamer can agree (no agree field anywhere). No network: the "download" copies local bytes.
const { test } = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const O = require('../asr-optional');
const { startServer, makeDataDir } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-asr-opt-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

/** A manifest of one small model whose "files" are the given bytes, at the listed hosts; a root with its licence text. */
function fixture(t, { files = { 'model.int8.onnx': Buffer.from('onnx-bytes'), 'tokens.txt': Buffer.from('<blk> 0\na 1\n') } } = {}) {
  const dir = tmp(t), root = path.join(dir, 'root'), userDir = path.join(dir, 'user');
  const license = Buffer.from('Copyright test. Licensed under the Apache License, Version 2.0.\n');
  fs.mkdirSync(path.join(root, 'licenses', 'asr'), { recursive: true });
  fs.writeFileSync(path.join(root, 'licenses', 'asr', 'test-LICENSE.txt'), license);
  const rev = 'a'.repeat(40), all = { ...files, LICENSE: license };
  const manifest = { hosts: ['hf-mirror.com', 'huggingface.co'], models: { 'omni-test': {
    engine: 'omnilingual', name: 'Omni test', family: 'Meta Omnilingual ASR', params: '1M', revision: rev, ramMB: 10,
    license: { name: 'Apache License 2.0', file: 'licenses/asr/test-LICENSE.txt', sha256: sha(license) },
    files: Object.fromEntries(Object.entries(all).map(([n, b]) => [n, { size: b.length, sha256: sha(b) }])),
    sources: [{ kind: 'files', base: `https://hf-mirror.com/x/y/resolve/${rev}/` }, { kind: 'files', base: `https://huggingface.co/x/y/resolve/${rev}/` }] } } };
  const store = O.createOptional({ manifest, userDir, root, version: '9.9.9', now: () => new Date('2026-11-04T12:00:00Z') });
  // the "network": bytes by file name, and every request in order
  const log = [], served = { ...all };
  const fetchFile = async (url, dest) => { log.push('fetch ' + url); fs.writeFileSync(dest, served[url.split('/').pop()]); };
  return { store, manifest, userDir, root, log, served, fetchFile, rev, license };
}

test('the shipped manifest: pinned to commits, plain data files, listed https hosts; the host list in main.js is the same', () => {
  const m = O.manifest;
  O.checkManifest(m);
  a.ok(Object.keys(m.models).length >= 1);
  for (const [id, x] of Object.entries(m.models)) {
    a.match(x.revision, /^[0-9a-f]{40}$/, id);
    for (const s of x.sources) { a.ok(!/\/(main|master)\//.test(s.base || s.url), 'never a branch'); a.ok(String(s.base || s.url).startsWith('https://')); }
    for (const n of Object.keys(x.files)) a.ok(/\.(onnx|txt)$|^LICENSE$/.test(n) && !/\.(bin|pkl|pt|pth|pickle)$/.test(n), n);
    // the LICENSE that comes with the model is the text MontClip ships and shows
    const lic = fs.readFileSync(path.join(ROOT, x.license.file));
    a.equal(sha(lic), x.license.sha256);
    a.equal(x.files.LICENSE.sha256, x.license.sha256);
    a.equal(x.files.LICENSE.size, lic.length);
  }
  const hosts = /const ASR_OPTIONAL_HOSTS = Object\.freeze\((\[[^\]]*\])\)/.exec(read('desktop/main.js'));
  a.ok(hosts, 'main.js writes the hosts itself');
  a.deepEqual(JSON.parse(hosts[1]), m.hosts);
});

test('the default stays as it was: Paraformer zh is the speech model, and no optional model is in the main manifest or a package', () => {
  const main = JSON.parse(read('desktop/asr-manifest.json'));
  a.equal(main.models.asr.id, 'paraformer-zh-2023-09-14-int8');
  a.deepEqual(Object.keys(main.models), ['asr', 'punct']);
  for (const id of Object.keys(O.manifest.models)) a.ok(!read('desktop/fetch-asr.cjs').includes(id) && !read('desktop/package-win.cjs').includes(id), id);
  a.ok(!read('desktop/package-win.cjs').includes('asr-optional-manifest'), 'packaging never reads the optional manifest');
  a.equal(require('../transcribe').DEFAULT_MODEL, 'paraformer-zh');
});

test('the manifest rules refuse a branch, http, an unlisted host, a path, pickle / .bin files, and an archive dir with ..', () => {
  const ok = () => JSON.parse(JSON.stringify(O.manifest.models[Object.keys(O.manifest.models)[0]]));
  const id = 'omni-x', hosts = O.manifest.hosts;
  O.checkModel(id, ok(), hosts);
  const bad = (f, why) => { const x = ok(); f(x); a.throws(() => O.checkModel(id, x, hosts), /optional model/, why); };
  bad((x) => { x.revision = 'main'; }, 'a branch');
  bad((x) => { x.sources[0].base = x.sources[0].base.replace('https:', 'http:'); }, 'http');
  bad((x) => { x.sources[0].base = x.sources[0].base.replace('hf-mirror.com', 'evil.example'); }, 'unlisted host');
  bad((x) => { x.sources[0].base = x.sources[0].base.replace(x.revision, 'main'); }, 'a source not pinned to the revision');
  bad((x) => { x.files['../model.onnx'] = { size: 1, sha256: 'a'.repeat(64) }; }, 'a path');
  bad((x) => { x.files['weights.bin'] = { size: 1, sha256: 'a'.repeat(64) }; }, '.bin');
  bad((x) => { x.files['model.pkl'] = { size: 1, sha256: 'a'.repeat(64) }; }, 'pickle');
  bad((x) => { x.sources.push({ kind: 'archive', url: 'https://huggingface.co/a.tar.bz2', size: 1, sha256: 'a'.repeat(64), dir: '../' }); }, 'archive dir');
  bad((x) => { x.license.sha256 = 'nope'; }, 'licence hash');
});

test('select: the licence is asked first, then the site, and only then is anything requested; the record says what was agreed', async (t) => {
  const F = fixture(t);
  const r = await F.store.select('omni-test', { fetchFile: F.fetchFile, ask: {
    license: async (q) => { F.log.push('ask licence'); a.match(q.text, /Apache License, Version 2\.0/); a.equal(q.text, F.license.toString()); return true; },
    source: async (q) => { F.log.push('ask site'); a.deepEqual(q.sites, ['hf-mirror.com', 'huggingface.co']); return 1; } } });
  a.equal(r.ok, true); a.equal(r.source, 'huggingface.co'); a.equal(r.active, 'omni-test');
  a.deepEqual(F.log.slice(0, 2), ['ask licence', 'ask site'], 'both questions before the first request');
  a.ok(F.log.slice(2).every((l) => l.startsWith('fetch https://huggingface.co/x/y/resolve/' + F.rev + '/')), 'only the site that was picked');
  const rec = JSON.parse(fs.readFileSync(path.join(F.userDir, 'optional', '.consent', 'omni-test.json'), 'utf8'));
  a.deepEqual(rec, { model: 'omni-test', revision: F.rev, licenseSha256: sha(F.license), agreedAt: '2026-11-04T12:00:00.000Z', montclipVersion: '9.9.9' });
  const st = F.store.status('omni-test');
  a.equal(st.ready, true); a.equal(F.store.active(), 'omni-test');
  a.ok(!fs.existsSync(path.join(F.userDir, 'optional', '.staging-omni-test')), 'the staging folder was renamed into place');
});

test('no to the licence, or no site: nothing is requested, nothing is kept, the default engine stays', async (t) => {
  for (const ask of [{ license: async () => false, source: async () => 0 }, { license: async () => true, source: async () => null }]) {
    const F = fixture(t);
    const r = await F.store.select('omni-test', { fetchFile: F.fetchFile, ask });
    a.equal(r.ok, false); a.ok(r.declined);
    a.deepEqual(F.log, [], 'no request');
    a.equal(F.store.active(), null);
    a.ok(!fs.existsSync(path.join(F.userDir, 'optional', '.consent', 'omni-test.json')));
  }
  // no box to ask in (an agent, a tool): refused before anything
  const F = fixture(t);
  await a.rejects(F.store.select('omni-test', { fetchFile: F.fetchFile }), { code: 'ASR_OPTIONAL_NO_ASK' });
  a.deepEqual(F.log, []);
});

test('a file that does not match its SHA-256: deleted, no consent record, not used; the other site is a new question', async (t) => {
  const F = fixture(t);
  F.served['model.int8.onnx'] = Buffer.from('onnx-bytez');   // same size, other bytes
  let asked = 0;
  const r = await F.store.select('omni-test', { fetchFile: F.fetchFile, ask: { license: async () => true, source: async () => { asked++; return 0; } } });
  a.equal(r.ok, false); a.equal(r.code, 'ASR_CHECK_FAILED');
  a.equal(asked, 1, 'no quiet switch to the other site');
  a.ok(F.log.every((l) => l.includes('hf-mirror.com')));
  a.equal(F.store.active(), null);
  a.ok(!fs.existsSync(path.join(F.userDir, 'optional', 'omni-test')), 'nothing in place');
  a.ok(!fs.existsSync(path.join(F.userDir, 'optional', '.staging-omni-test', 'model.int8.onnx.part')), 'the bad file was deleted');
  a.ok(!fs.existsSync(path.join(F.userDir, 'optional', '.consent', 'omni-test.json')));
});

test('files without a consent record are not used; a deleted or changed file after consent puts transcription back on the default', async (t) => {
  const F = fixture(t);
  await F.store.download('omni-test', { source: 0, fetchFile: F.fetchFile });
  let st = F.store.status('omni-test');
  a.equal(st.installed, true); a.equal(st.consented, false); a.equal(st.ready, false); a.equal(F.store.active(), null, 'no record: not used');
  F.store.consent('omni-test');
  a.equal(F.store.active(), 'omni-test');
  // a record for another revision or licence text does not count
  const recFile = path.join(F.userDir, 'optional', '.consent', 'omni-test.json');
  const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
  fs.writeFileSync(recFile, JSON.stringify({ ...rec, revision: 'b'.repeat(40) }));
  a.equal(F.store.active(), null, 'another revision');
  fs.writeFileSync(recFile, JSON.stringify(rec));
  a.equal(F.store.active(), 'omni-test');
  fs.rmSync(path.join(F.userDir, 'optional', 'omni-test', 'tokens.txt'));
  st = F.store.status('omni-test');
  a.deepEqual(st.missing, ['tokens.txt']); a.equal(st.ready, false); a.equal(F.store.active(), null); a.equal(F.store.dir('omni-test'), null);
});

test('revoke: the model, anything half-downloaded and the consent record are deleted', async (t) => {
  const F = fixture(t);
  await F.store.select('omni-test', { fetchFile: F.fetchFile, ask: { license: async () => true, source: async () => 0 } });
  fs.mkdirSync(path.join(F.userDir, 'optional', '.staging-omni-test'), { recursive: true });
  fs.writeFileSync(path.join(F.userDir, 'optional', '.staging-omni-test', 'x.part'), 'x');
  const r = F.store.revoke('omni-test');
  a.equal(r.ok, true); a.equal(r.active, null);
  for (const p of ['omni-test', '.staging-omni-test', path.join('.consent', 'omni-test.json')]) a.ok(!fs.existsSync(path.join(F.userDir, 'optional', p)), p);
  a.equal(F.store.status('omni-test').consented, false);
});

test('cancelling the download revokes; a dropped connection keeps what came for the next try', async (t) => {
  const F = fixture(t);
  const ac = new AbortController();
  const r = await F.store.select('omni-test', { signal: ac.signal, ask: { license: async () => true, source: async () => 0 },
    fetchFile: async (url, dest) => { fs.writeFileSync(dest, 'part'); ac.abort(); throw Object.assign(new Error('cancelled'), { code: 'ASR_DOWNLOAD_CANCELLED' }); } });
  a.equal(r.declined, 'cancelled');
  a.ok(!fs.existsSync(path.join(F.userDir, 'optional', '.staging-omni-test')));
  const F2 = fixture(t);
  const r2 = await F2.store.select('omni-test', { ask: { license: async () => true, source: async () => 0 },
    fetchFile: async (url, dest) => { fs.writeFileSync(dest, 'pa'); throw new Error('the connection dropped'); } });
  a.equal(r2.ok, false); a.equal(r2.code, 'ASR_DOWNLOAD_INTERRUPTED');
  a.ok(fs.existsSync(path.join(F2.userDir, 'optional', '.staging-omni-test', 'model.int8.onnx.part')), 'kept for 「接着下载」');
  a.equal(F2.store.active(), null);
});

test('only listed https hosts, redirects included', async (t) => {
  const D = require('../asr-download');
  const hosts = O.manifest.hosts;
  a.throws(() => D.nextUrl('https://hf-mirror.com/a', 'https://evil.example/model.onnx', hosts), { code: 'ASR_HOST_REFUSED' });
  a.throws(() => D.nextUrl('https://hf-mirror.com/a', 'http://huggingface.co/model.onnx', hosts), { code: 'ASR_HOST_REFUSED' });
  a.equal(D.nextUrl('https://hf-mirror.com/a', 'https://huggingface.co/b', hosts), 'https://huggingface.co/b');
  await a.rejects(D.fetchFile('https://evil.example/x', path.join(tmp(t), 'x'), { hosts }), { code: 'ASR_HOST_REFUSED' });
});

test('an archive with an entry that leaves its folder (../, an absolute path) is refused before anything is unpacked', async (t) => {
  for (const n of ['../evil', 'a/../../evil', '/etc/passwd', 'C:\\x', '..\\evil']) a.equal(O.escapes(n), true, n);
  for (const n of ['dir/model.int8.onnx', 'dir/..x/a', 'x..y']) a.equal(O.escapes(n), false, n);
  // a real .tar.bz2 with "../evil" in it (tar -P keeps the name)
  const dir = tmp(t), inner = path.join(dir, 'in'), out = path.join(dir, 'out');
  fs.mkdirSync(inner); fs.mkdirSync(out); fs.writeFileSync(path.join(dir, 'evil'), 'x');
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const archive = path.join(dir, 'a.tar.bz2');
  try { execFileSync(tar, ['-cjPf', archive, '../evil'], { cwd: inner, stdio: 'ignore' }); } catch { t.skip('this tar cannot write bzip2'); return; }
  await a.rejects(O.safeExtract(archive, out, ['../evil']), (e) => e.code === 'ASR_CHECK_FAILED' && /outside its folder/.test(e.message));
  a.deepEqual(fs.readdirSync(out), []);
});

test('the server never agrees or switches: an agree field is refused, anything else waits for the streamer', async (t) => {
  const dataDir = makeDataDir(t);
  const s = await startServer(t, dataDir, { MONTCLIP_ASR_MODELS_DIR: path.join(dataDir, 'models') });
  for (const body of [{ agree: true, model: 'omnilingual-ctc-300m-int8' }, { consent: 'yes' }, { accepted: 1 }]) {
    const r = await fetch(s.base + '/api/asr/optional', { method: 'POST', body: JSON.stringify(body) });
    a.equal(r.status, 400); a.equal((await r.json()).code, 'ASR_AGREE_NOT_ACCEPTED');
  }
  const r = await fetch(s.base + '/api/asr/optional', { method: 'POST', body: JSON.stringify({ model: Object.keys(O.manifest.models)[0] }) });
  a.equal(r.status, 409);
  const j = await r.json();
  a.equal(j.code, 'ASR_CONSENT_REQUIRED'); a.equal(j.waiting, 'streamer'); a.equal(j.active, null);
  const st = await (await fetch(s.base + '/api/asr/status')).json();
  a.equal(st.model, 'paraformer-zh-2023-09-14-int8', 'the default is untouched');
  a.equal(st.optional.active, null);
  a.ok(st.optional.models.every((m) => !m.ready && !m.consented));
  a.ok(!fs.existsSync(path.join(dataDir, 'models', 'optional', '.consent')), 'nothing written');
});

test('the desktop host: the page names a model only; the licence and the site are the host\'s own boxes, "no" by default', () => {
  const main = read('desktop/main.js'), pre = read('desktop/view-preload.js');
  a.match(pre, /select:id=>ipcRenderer\.invoke\('montclip:asr:optional:select',String\(id\)\)/);
  a.ok(!/agree/i.test(pre.slice(pre.indexOf('optional:Object.freeze'), pre.indexOf('optional:Object.freeze') + 800)), 'no agree from the page');
  const sel = main.slice(main.indexOf('ipcMain.handle("montclip:asr:optional:select"'), main.indexOf('ipcMain.handle("montclip:asr:optional:revoke"'));
  a.match(sel, /settingsAllowed\(event, win, origin\)/);
  a.equal((sel.match(/defaultId: 0, cancelId: 0/g) || []).length, 2, 'both boxes default to no');
  a.match(sel, /return answer\.response === 1;/);
  const T = require('../desktop/asr-optional-text');
  const lic = T.optionalLicenseText('zh', { name: 'X', licenseName: 'Apache License 2.0', text: 'LICENSE TEXT' });
  a.deepEqual(lic.buttons, ['不同意', '同意']); a.ok(lic.detail.startsWith('LICENSE TEXT'), 'the text first, word for word');
  const src = T.optionalSourceText('zh', { name: 'X', mb: 350, sites: ['hf-mirror.com', 'huggingface.co'], hosts: O.manifest.hosts });
  a.deepEqual(src.buttons, ['取消', '从 hf-mirror.com 下载', '从 huggingface.co 下载']);
  for (const h of O.manifest.hosts) a.ok(src.detail.includes(h), 'full host name ' + h);
  a.match(src.detail, /只有下载请求/); a.match(src.detail, /IP/);
});
