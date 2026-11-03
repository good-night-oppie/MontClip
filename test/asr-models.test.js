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
test('download: every source failing is an error naming each (network errors: interrupted, the parts stay); a source host outside the list is never asked', async () => {
  const user = tmp();
  try {
    const bad = { ...fake, models: { ...fake.models, asr: { ...fake.models.asr, sources: [{ kind: 'files', base: 'https://huggingface.co/x/' }, ...fake.models.asr.sources] } } };
    const asked = [];
    const store = M.createStore({ manifest: bad, roots: [], userDir: user, extract: async () => {} });
    await a.rejects(store.download('asr', { fetchFile: async (url) => { asked.push(url); throw new Error('offline'); } }), (e) => e.code === 'ASR_DOWNLOAD_INTERRUPTED' && e.failed.length === 3 && e.failed[0].code === 'ASR_HOST_REFUSED');
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

// Deja (2026-11-03): downloads resume (HTTP Range); a file is checked against its SHA-256 before it is renamed into
// place; a file that fails the check is deleted ("下载的文件不完整，已删掉，请再下载一次"); an interrupted download
// keeps what it has ("已经下载的部分会留着"); no room on the disk is said before anything is fetched.
test('an interrupted download keeps its part, and the next attempt resumes from it into the same file', async () => {
  const user = tmp();
  try {
    const one = { ...fake, models: { asr: { ...fake.models.asr, sources: [fake.models.asr.sources[0]] }, punct: fake.models.punct } };
    const seen = [];
    let cut = true;
    const fetchFile = async (url, dest) => {
      const name = url.split('/').pop(), want = name === 'tokens.txt' ? bytes.tokens : bytes.model;
      const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
      seen.push({ name, have, dest });
      if (cut && name === 'model.int8.onnx') { fs.writeFileSync(dest, want.subarray(0, 50)); cut = false; throw new Error('network gone'); }
      fs.appendFileSync(dest, want.subarray(have));
    };
    const store = M.createStore({ manifest: one, roots: [], userDir: user, extract: async () => {} });
    // the retry inside one attempt resumes: 50 bytes were there
    const r = await store.download('asr', { fetchFile });
    a.equal(r.source, 'hf-mirror.com');
    const model = seen.filter((s) => s.name === 'model.int8.onnx');
    a.deepEqual(model.map((s) => s.have), [0, 50], 'the second request starts from the 50 bytes already there');
    a.equal(model[0].dest, model[1].dest, 'the same part file');
    a.equal(store.status().asr.ready, true);
    a.ok(!fs.existsSync(path.join(user, '.partial')) || !fs.readdirSync(path.join(user, '.partial')).length, 'no part left once it is in place');
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('a download that stops twice is "interrupted": the part stays, and the next download goes on from it', async () => {
  const user = tmp();
  try {
    const one = { ...fake, models: { asr: { ...fake.models.asr, sources: [fake.models.asr.sources[0]] }, punct: fake.models.punct } };
    const store = M.createStore({ manifest: one, roots: [], userDir: user, extract: async () => {} });
    const half = async (url, dest) => { fs.appendFileSync(dest, bytes.model.subarray(0, 20)); throw new Error('network gone'); };
    await a.rejects(store.download('asr', { fetchFile: half }), (e) => e.code === 'ASR_DOWNLOAD_INTERRUPTED');
    const parts = fs.readdirSync(path.join(user, '.partial'));
    a.equal(parts.length, 1); a.equal(fs.statSync(path.join(user, '.partial', parts[0])).size, 40, 'two tries, 20 bytes each, kept');
    const resumedFrom = [];
    const rest = async (url, dest) => { const name = url.split('/').pop(), want = name === 'tokens.txt' ? bytes.tokens : bytes.model, have = fs.existsSync(dest) ? fs.statSync(dest).size : 0; resumedFrom.push(have); fs.appendFileSync(dest, want.subarray(have)); };
    // (the part holds 40 bytes that are not the first 40 of the model: the check fails, the part is deleted)
    await a.rejects(store.download('asr', { fetchFile: rest }), (e) => e.code === 'ASR_CHECK_FAILED');
    a.equal(resumedFrom[0], 40, 'it went on from the part');
    a.ok(!fs.existsSync(path.join(user, '.partial')) || !fs.readdirSync(path.join(user, '.partial')).length, 'a file that fails the check is deleted');
    a.equal(store.status().asr.ready, false);
    await store.download('asr', { fetchFile: rest });
    a.equal(store.status().asr.ready, true, 'downloading again works');
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('not enough room on the disk is said before anything is fetched, with the drive, what is needed and what is free', async () => {
  const user = tmp();
  try {
    const store = M.createStore({ manifest: fake, roots: [], userDir: user, extract: async () => {}, freeBytes: () => 100 });
    let asked = 0;
    await a.rejects(store.download('asr', { fetchFile: async () => { asked++; } }),
      (e) => e.code === 'ASR_NO_SPACE' && e.needBytes > 100 && e.freeBytes === 100 && typeof e.drive === 'string');
    a.equal(asked, 0);
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});
test('the downloader resumes with Range, appends on 206, starts again on 200, and keeps the part when the connection drops', async () => {
  const D = require('../asr-download'), EventEmitter = require('node:events'), { PassThrough } = require('node:stream');
  const dir = tmp(), dest = path.join(dir, 'x.part'), body = Buffer.from('0123456789abcdefghij');
  const fakeGet = (mode) => (url, opts, cb) => {
    const req = new EventEmitter(); req.destroy = (e) => req.emit('error', e || new Error('destroyed'));
    const range = opts.headers.Range, from = range ? +/bytes=(\d+)-/.exec(range)[1] : 0;
    setImmediate(() => {
      const res = new PassThrough();
      if (mode === 'drop') { res.statusCode = 200; res.headers = {}; cb(res); res.write(body.subarray(0, 7)); setImmediate(() => res.destroy(new Error('reset'))); return; }
      if (mode === '206' && from) { res.statusCode = 206; res.headers = { 'content-range': `bytes ${from}-${body.length - 1}/${body.length}` }; cb(res); res.end(body.subarray(from)); return; }
      res.statusCode = 200; res.headers = {}; cb(res); res.end(body);
    });
    return req;
  };
  try {
    await a.rejects(D.fetchFile('https://hf-mirror.com/x', dest, { get: fakeGet('drop'), hosts: fake.hosts }));
    a.equal(fs.readFileSync(dest).toString(), '0123456', 'what came is kept');
    const sent = [];
    const spy = (mode) => { const g = fakeGet(mode); return (u, o, cb) => { sent.push(o.headers.Range || null); return g(u, o, cb); }; };
    await D.fetchFile('https://hf-mirror.com/x', dest, { get: spy('206'), hosts: fake.hosts });
    a.deepEqual(sent, ['bytes=7-']); a.equal(fs.readFileSync(dest).toString(), body.toString(), '206: appended');
    fs.writeFileSync(dest, 'zzz');
    await D.fetchFile('https://hf-mirror.com/x', dest, { get: spy('200'), hosts: fake.hosts });
    a.equal(fs.readFileSync(dest).toString(), body.toString(), '200 to a Range request: started again from 0');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('the main process writes its download hosts down itself: hf-mirror.com first, github.com second', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  const m = /const ASR_HOSTS = Object\.freeze\((\[[^\]]*\])\);/.exec(main);
  a.ok(m, 'a literal list in main.js');
  const hosts = JSON.parse(m[1]);
  a.deepEqual(hosts.slice(0, 2), ['hf-mirror.com', 'github.com']);
  a.deepEqual([...hosts].sort(), [...M.manifest.hosts].sort(), 'the same as the manifest');
  a.match(main, /fetchFile: \(url, dest, o\) => AsrDownload\.fetchFile\(url, dest, \{ \.\.\.o, hosts: ASR_HOSTS \}\)/);
  a.match(main, /hosts: ASR_HOSTS/);
});

// Windows CI (ee012c6): a file rewritten with other bytes of the same size within the same millisecond kept its old
// result — the cache was keyed by size and mtimeMs. Every rewrite must be seen, good and bad alike.
test('a file rewritten at once with other bytes of the same size is checked again (never a stale result)', () => {
  const user = tmp();
  try {
    const store = M.createStore({ manifest: fake, roots: [], userDir: user });
    put(user, 'asr/model.int8.onnx', bytes.model);
    for (let i = 0; i < 40; i++) {
      put(user, 'asr/tokens.txt', Buffer.from('tokenz'));
      a.deepEqual(store.status().asr.bad, ['tokens.txt'], 'round ' + i + ': the wrong bytes');
      put(user, 'asr/tokens.txt', bytes.tokens);
      a.equal(store.status().asr.ready, true, 'round ' + i + ': the right bytes');
    }
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
});

// Deja (11-03): the room needed is the download and the unpacked files, with a margin — for the source that needs the
// most, since any of them may be the one used (hf-mirror is often passed on, then the GitHub archive is used). Room for
// the download alone must not start a download that fails while unpacking.
const MB = 1048576;
const sized = (files, sources) => ({ hosts: fake.hosts, models: { m: { id: 'm', required: false, sources,
  files: Object.fromEntries(Object.entries(files).map(([n, s]) => [n, { size: s, sha256: sha(Buffer.from(n)) }])) } } });
async function roomFor(manifest, free) {
  const user = tmp();
  try {
    let asked = 0, err = null;
    const store = M.createStore({ manifest, roots: [], userDir: user, extract: async () => {}, freeBytes: () => free });
    try { await store.download('m', { fetchFile: async () => { asked++; throw Object.assign(new Error('stop'), { code: 'ASR_DOWNLOAD_CANCELLED' }); } }); } catch (e) { err = e; }
    return { asked, code: err && err.code, need: err && err.needBytes };
  } finally { fs.rmSync(user, { recursive: true, force: true }); }
}
test('room: the punctuation model (archive only) needs its 62 MB download and its 76 MB unpacked, before anything is fetched', async () => {
  const punct = sized({ 'model.int8.onnx': 72 * MB, 'tokens.json': 4 * MB },
    [{ kind: 'archive', url: 'https://github.com/k2-fsa/p.tar.bz2', size: 62 * MB, sha256: sha(Buffer.from('P')), dir: 'p/' }]);
  const onlyDownload = await roomFor(punct, 62 * MB + 20 * MB);
  a.equal(onlyDownload.code, 'ASR_NO_SPACE', 'room for the download alone is not enough');
  a.equal(onlyDownload.asked, 0, 'nothing fetched');
  a.ok(onlyDownload.need >= (62 + 76) * MB, 'needs download + unpacked: ' + onlyDownload.need / MB);
  const enough = await roomFor(punct, (62 + 76 + 64) * MB);
  a.notEqual(enough.code, 'ASR_NO_SPACE'); a.equal(enough.asked, 1);
});
test('room: the speech model is checked for its biggest source (the GitHub archive + unpacked), not the smallest (hf-mirror files)', async () => {
  const asr = sized({ 'model.int8.onnx': 243 * MB, 'tokens.txt': 1 * MB }, [
    { kind: 'files', base: 'https://hf-mirror.com/x/resolve/abc/' },
    { kind: 'archive', url: 'https://github.com/k2-fsa/x.tar.bz2', size: 234 * MB, sha256: sha(Buffer.from('A')), dir: 'x/' }]);
  const forFiles = await roomFor(asr, 300 * MB);   // enough for hf-mirror's files, not for the archive and its unpacking
  a.equal(forFiles.code, 'ASR_NO_SPACE');
  a.equal(forFiles.asked, 0);
  a.ok(forFiles.need >= (234 + 244) * MB, String(forFiles.need / MB));
});
test('unpacking takes only the model\'s own files out of an archive (what the room check counts)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'asr-models.js'), 'utf8');
  a.match(src, /function systemExtract\(archive, into, members = \[\]\)/);
  a.match(src, /\["-xjf", archive, "-C", into, \.\.\.members\]/);
  const calls = src.match(/await extract\([^\n]*\);/g);
  a.ok(calls && calls.length >= 2, 'both unpack sites');
  for (const call of calls) a.match(call, /membersOf\(/, call);
});
