'use strict';
// #70 (Deja, 2026-11-03; ADR 2026-11-03 local capability boundary, row 6): the speech model comes from the 完整版
// package, a download, or the streamer's own copy on a U 盘 / a local file. Every file is checked against the SHA-256
// written in desktop/asr-manifest.json; a file that does not match is never used. Downloads go only to the listed
// hosts (hf-mirror.com first, then the k2-fsa GitHub release), every redirect included.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const M = require('../asr-models');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// A small stand-in manifest with the real one's shape, so the tests write kilobytes, not 250 MB.
const bytes = { model: Buffer.from('model-bytes-' + 'x'.repeat(200)), tokens: Buffer.from('tokens'), punct: Buffer.from('punct-model'), ptok: Buffer.from('{"a":1}') };
const fake = { models: {
  asr: { id: 'fake-asr', required: true, files: { 'model.int8.onnx': { size: bytes.model.length, sha256: sha(bytes.model) }, 'tokens.txt': { size: bytes.tokens.length, sha256: sha(bytes.tokens) } },
    sources: [{ kind: 'files', base: 'https://hf-mirror.com/x/resolve/abc/' }, { kind: 'archive', url: 'https://github.com/k2-fsa/x.tar.bz2', size: 3, sha256: sha(Buffer.from('ARC')), dir: 'x/' }] },
  punct: { id: 'fake-punct', required: false, files: { 'model.int8.onnx': { size: bytes.punct.length, sha256: sha(bytes.punct) }, 'tokens.json': { size: bytes.ptok.length, sha256: sha(bytes.ptok) } }, sources: [] },
}, hosts: ['hf-mirror.com', 'github.com', 'release-assets.githubusercontent.com'] };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'asr-models-'));
const put = (dir, rel, b) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), b); };

test('the real manifest: Paraformer zh 2023-09-14 int8, never the 2025-10-07 Sichuan model; hf-mirror first, GitHub second; every file pinned', () => {
  const m = M.manifest;
  a.equal(m.models.asr.id, 'paraformer-zh-2023-09-14-int8');
  a.equal(m.models.asr.files['model.int8.onnx'].sha256, 'f36a0433bcf096bd6d6f11b80a3ac8bed110bdca632fe0d731df8d1a84475945');
  a.equal(m.models.asr.files['model.int8.onnx'].size, 243371218);
  a.ok(!JSON.stringify(m.models.asr.sources).includes('2025-10-07'));
  a.deepEqual(m.models.asr.sources.map((s) => new URL(s.base || s.url).hostname), ['hf-mirror.com', 'github.com']);
  a.match(m.models.asr.sources[0].base, /\/resolve\/[0-9a-f]{40}\/$/, 'hf-mirror pinned to a commit');
  a.equal(m.models.asr.sources[1].sha256, '9c49fd9c6fb63de8e18c1054cf3d100f804741b7e608e187923cd8ff09fa9f03');
  a.equal(m.models.punct.required, false, 'punctuation is the optional second file');
  a.equal(m.engine.vad.sha256, '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6');
  for (const model of Object.values(m.models)) for (const f of Object.values(model.files)) { a.match(f.sha256, /^[0-9a-f]{64}$/); a.ok(f.size > 0); }
  for (const s of [...m.models.asr.sources, ...m.models.punct.sources]) if (s.kind === 'archive') a.match(s.sha256, /^[0-9a-f]{64}$/);
  const sources = Object.values(m.models).flatMap((x) => x.sources);
  a.ok(!/modelscope|huggingface\.co|jsdelivr/i.test(JSON.stringify(sources) + m.hosts.join()), 'no source on ModelScope, huggingface.co or a CDN');
  a.ok(!/sense-?voice/i.test(JSON.stringify(m)), 'SenseVoice is not used (licence issue #334 open)');
});
test('allowedUrl: https to a listed host only (no http, no look-alike, no user:pass@, no other port)', () => {
  const ok = (u) => M.allowedUrl(u, fake.hosts);
  a.equal(ok('https://hf-mirror.com/x'), true);
  a.equal(ok('https://release-assets.githubusercontent.com/a?b'), true);
  for (const u of ['http://hf-mirror.com/x', 'https://hf-mirror.com.evil.cn/x', 'https://evil.cn/hf-mirror.com', 'https://huggingface.co/x',
    'https://user:pw@hf-mirror.com/x', 'https://hf-mirror.com:8443/x', 'file:///c:/x', 'not a url', ''])
    a.equal(ok(u), false, u);
});
test('status: missing, then ready once every file matches; a file with the right name but other bytes is "bad", never used', () => {
  const user = tmp();
  try {
    const store = M.createStore({ manifest: fake, roots: [], userDir: user });
    a.deepEqual(store.status().asr, { ready: false, where: null, missing: ['model.int8.onnx', 'tokens.txt'], bad: [] });
    put(user, 'asr/model.int8.onnx', bytes.model); put(user, 'asr/tokens.txt', Buffer.from('tokenz'));
    a.deepEqual(store.status().asr, { ready: false, where: null, missing: [], bad: ['tokens.txt'] });
    put(user, 'asr/tokens.txt', bytes.tokens);
    a.deepEqual(store.status().asr, { ready: true, where: 'user', missing: [], bad: [] });
    a.equal(store.dir('asr'), path.join(user, 'asr'));
    a.equal(store.status().punct.ready, false);
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('a model in the package (完整版) is found before the user\'s copy', () => {
  const pkg = tmp(), user = tmp();
  try {
    for (const d of [pkg, user]) { put(d, 'asr/model.int8.onnx', bytes.model); put(d, 'asr/tokens.txt', bytes.tokens); }
    const store = M.createStore({ manifest: fake, roots: [pkg], userDir: user });
    a.equal(store.status().asr.where, 'package'); a.equal(store.dir('asr'), path.join(pkg, 'asr'));
  } finally { for (const d of [pkg, user]) fs.rmSync(d, { recursive: true, force: true }); }
});
test('import from a U 盘 / a folder: files are recognised by their SHA-256 (any name, any depth ≤ 3); others are left alone', async () => {
  const usb = tmp(), user = tmp();
  try {
    put(usb, 'MontClip 模型/a/renamed.onnx', bytes.model); put(usb, 'MontClip 模型/a/tokens.txt', bytes.tokens);
    put(usb, 'MontClip 模型/same-size-other.bin', Buffer.alloc(bytes.model.length, 1)); put(usb, 'notes.txt', Buffer.from('hello'));
    const store = M.createStore({ manifest: fake, roots: [], userDir: user });
    const r = await store.importPaths([usb]);
    a.deepEqual(r.imported.map((x) => x.model + '/' + x.file).sort(), ['asr/model.int8.onnx', 'asr/tokens.txt']);
    a.equal(r.rejected, 1, 'one file had the size of a model file but other bytes');
    a.equal(store.status().asr.ready, true);
    a.deepEqual(fs.readdirSync(path.join(user, 'asr')).sort(), ['model.int8.onnx', 'tokens.txt'], 'no temporary files left');
    const again = await store.importPaths([usb]);
    a.equal(again.imported.length, 0); a.equal(again.already, 2);
  } finally { for (const d of [usb, user]) fs.rmSync(d, { recursive: true, force: true }); }
});
test('import an official archive (.tar.bz2): checked by its SHA-256 first, then its members by theirs', async () => {
  const usb = tmp(), user = tmp();
  try {
    put(usb, 'x.tar.bz2', Buffer.from('ARC'));
    const extracted = [];
    const extract = async (archive, into) => { extracted.push(path.basename(archive)); put(into, 'x/model.int8.onnx', bytes.model); put(into, 'x/tokens.txt', bytes.tokens); put(into, 'x/README.md', Buffer.from('r')); };
    const store = M.createStore({ manifest: fake, roots: [], userDir: user, extract });
    const r = await store.importPaths([path.join(usb, 'x.tar.bz2')]);
    a.deepEqual(extracted, ['x.tar.bz2']);
    a.equal(r.imported.length, 2); a.equal(store.status().asr.ready, true);
    put(usb, 'y.tar.bz2', Buffer.from('ARX'));
    const r2 = await store.importPaths([path.join(usb, 'y.tar.bz2')]);
    a.equal(r2.imported.length, 0); a.deepEqual(extracted, ['x.tar.bz2'], 'an archive that is not the pinned one is never opened');
  } finally { for (const d of [usb, user]) fs.rmSync(d, { recursive: true, force: true }); }
});
test('download: the first source that works; a wrong byte means the next source; nothing half-done is kept', async () => {
  const user = tmp();
  try {
    const asked = [];
    const fetchFile = async (url, dest) => { asked.push(url); if (url.startsWith('https://hf-mirror.com/')) fs.writeFileSync(dest, url.endsWith('tokens.txt') ? bytes.tokens : Buffer.from('tampered')); else fs.writeFileSync(dest, 'ARC'); };
    const extract = async (archive, into) => { put(into, 'x/model.int8.onnx', bytes.model); put(into, 'x/tokens.txt', bytes.tokens); };
    const store = M.createStore({ manifest: fake, roots: [], userDir: user, extract });
    const r = await store.download('asr', { fetchFile });
    a.equal(r.source, 'github.com');
    a.equal(r.failed.length, 1); a.match(r.failed[0].error, /SHA-256/);
    a.deepEqual(asked, ['https://hf-mirror.com/x/resolve/abc/model.int8.onnx', 'https://github.com/k2-fsa/x.tar.bz2'], 'stops at the first bad file');
    a.equal(store.status().asr.ready, true);
    a.deepEqual(fs.readdirSync(path.join(user, 'asr')).sort(), ['model.int8.onnx', 'tokens.txt']);
    a.ok(!fs.readdirSync(user).some((f) => /tmp|part/i.test(f)), 'temporary downloads removed');
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('download: every source failing is an error naming each; a source host outside the list is never asked', async () => {
  const user = tmp();
  try {
    const bad = { ...fake, models: { ...fake.models, asr: { ...fake.models.asr, sources: [{ kind: 'files', base: 'https://huggingface.co/x/' }, ...fake.models.asr.sources] } } };
    const asked = [];
    const store = M.createStore({ manifest: bad, roots: [], userDir: user, extract: async () => {} });
    await a.rejects(store.download('asr', { fetchFile: async (url) => { asked.push(url); throw new Error('offline'); } }), (e) => e.code === 'ASR_DOWNLOAD_FAILED' && e.failed.length === 3);
    a.ok(!asked.some((u) => u.includes('huggingface.co')), 'a host not in the list is refused before any request');
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('the real downloader follows redirects only to listed https hosts', () => {
  const D = require('../asr-download');
  a.equal(D.nextUrl('https://hf-mirror.com/a/b', '/c/d', fake.hosts), 'https://hf-mirror.com/c/d');
  a.equal(D.nextUrl('https://github.com/a', 'https://release-assets.githubusercontent.com/x?y=1', fake.hosts), 'https://release-assets.githubusercontent.com/x?y=1');
  for (const loc of ['https://us.aws.cdn.hf.co/x', 'http://github.com/a', 'https://huggingface.co/api/resolve-cache/x'])
    a.throws(() => D.nextUrl('https://hf-mirror.com/a', loc, fake.hosts), (e) => e.code === 'ASR_HOST_REFUSED', loc);
});

