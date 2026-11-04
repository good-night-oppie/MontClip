'use strict';
// A private test package's one-time DeepSeek key (desktop/agent-seed.js; Deja, 2026-11-04). Synthetic keys only.
// The real safeStorage run: desktop/agent-seed-smoke.cjs.
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Seed = require('../desktop/agent-seed'), AgentService = require('../desktop/agent-service');
const KEY = 'sk-synthetic0000test0000key0000seed';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mc-seed-'));
// a stand-in safeStorage: "sealed" bytes that do not contain the key (each byte flipped), as the real one's do not
const sealing = (available = true) => ({ isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ 0xa5)), decryptString: (b) => Buffer.from(b.map((x) => x ^ 0xa5)).toString('utf8') });
const writeSeed = (dir, over = {}) => { const f = path.join(dir, Seed.SEED_NAME); fs.writeFileSync(f, Seed.seedText({ model: 'synthetic-flash-model', apiKey: KEY, ...over })); return f; };
/** Every file under dir (small profile here) whose bytes hold the key. */
const holding = (dir) => { const out = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.readFileSync(p).includes(Buffer.from(KEY))) out.push(path.relative(dir, p)); } })(dir); return out; };
/** Everything written to the console and stdout / stderr while fn runs. */
function captured(fn) {
  const seen = [], keep = {}, names = ['log', 'info', 'warn', 'error', 'debug'];
  for (const n of names) { keep[n] = console[n]; console[n] = (...x) => seen.push(x.map(String).join(' ')); }
  const out = process.stdout.write, err = process.stderr.write;
  process.stdout.write = (s, ...r) => { seen.push(String(s)); return true; }; process.stderr.write = (s, ...r) => { seen.push(String(s)); return true; };
  try { return { result: fn(), text: seen.join('\n') }; } finally { for (const n of names) console[n] = keep[n]; process.stdout.write = out; process.stderr.write = err; }
}

test('the seed is sealed into the connection file and deleted; no plain key anywhere, nothing logged', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true);
  const service = AgentService.createDiskService(profile, safe);
  const { result, text } = captured(() => Seed.importSeed({ file: seed, service, encryptionAvailable: () => safe.isEncryptionAvailable() }));
  a.equal(result.code, 'SEALED');
  a.equal(fs.existsSync(seed), false, 'the seed is gone');
  const conn = fs.readFileSync(path.join(profile, 'agent-connection-v1.json'), 'utf8');
  a.equal(conn.includes(KEY), false, 'the connection file holds no plain key');
  a.deepEqual(Object.keys(JSON.parse(conn)).sort(), ['model', 'provider', 'secret', 'version']);
  a.deepEqual(holding(profile), []); a.deepEqual(holding(resources), []);
  a.equal(text.includes(KEY), false, 'nothing logged holds the key');
  a.equal(JSON.stringify(result).includes(KEY), false);
  const now = service.get();
  a.equal(now.configured, true); a.equal(now.provider, 'deepseek'); a.equal(now.model, 'synthetic-flash-model');
  // the sealed key is the one that was in the seed: a new service on the same profile unseals it
  a.equal(safe.decryptString(Buffer.from(JSON.parse(conn).secret, 'base64')), KEY);
  // a second launch: no seed, nothing changes
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'NO_SEED');
});

test('safeStorage unavailable: nothing is written, the key is not saved in plain text, the seed is kept for a later launch', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(false);
  const service = AgentService.createDiskService(profile, safe);
  const { result, text } = captured(() => Seed.importSeed({ file: seed, service, encryptionAvailable: () => safe.isEncryptionAvailable() }));
  a.equal(result.code, 'NO_ENCRYPTION');
  a.equal(fs.existsSync(path.join(profile, 'agent-connection-v1.json')), false);
  a.deepEqual(fs.readdirSync(profile), [], 'no file at all in the profile');
  a.equal(fs.existsSync(seed), true);
  a.equal(service.get().configured, false);
  a.equal(text.includes(KEY), false);
  // even if the check were skipped, the service's own seal refuses without encryption (CONFIG_FAILED, nothing written)
  const r = Seed.importSeed({ file: seed, service, encryptionAvailable: () => true });
  a.equal(r.code, 'CONFIG_FAILED'); a.deepEqual(fs.readdirSync(profile), []); a.equal(fs.existsSync(seed), true);
});

test('a connection already saved is kept and the seed deleted unused; a bad seed is left alone; a seed that cannot be deleted is said', () => {
  const profile = tmp(), resources = tmp(), safe = sealing(true), service = AgentService.createDiskService(profile, safe);
  a.equal(service.configure({ provider: 'deepseek', model: 'their-own', apiKey: 'sk-their-own-key' }).configured, true);
  const before = fs.readFileSync(path.join(profile, 'agent-connection-v1.json'), 'utf8');
  const seed = writeSeed(resources);
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'ALREADY_CONFIGURED');
  a.equal(fs.readFileSync(path.join(profile, 'agent-connection-v1.json'), 'utf8'), before);
  a.equal(fs.existsSync(seed), false);
  // not a seed: untouched
  const bad = path.join(resources, Seed.SEED_NAME);
  for (const text of ['{}', 'not json', JSON.stringify({ version: 1, provider: 'openai', model: 'm', apiKey: KEY }), JSON.stringify({ version: 1, provider: 'deepseek', model: 'm', apiKey: 'sk a' })]) {
    fs.writeFileSync(bad, text);
    const r = Seed.importSeed({ file: bad, service: AgentService.createDiskService(tmp(), safe), encryptionAvailable: () => true });
    a.equal(r.code, 'SEED_INVALID'); a.equal(fs.readFileSync(bad, 'utf8'), text);
  }
  // sealed, but the file cannot be removed (a read-only folder): NOT_DELETED, so the streamer is asked to delete it
  const stuck = writeSeed(tmp()), p2 = tmp();
  const noUnlink = { ...fs, unlinkSync() { throw Object.assign(Error('EPERM'), { code: 'EPERM' }); } };
  const r = Seed.importSeed({ file: stuck, fs: noUnlink, service: AgentService.createDiskService(p2, safe), encryptionAvailable: () => true });
  a.equal(r.code, 'NOT_DELETED'); a.equal(r.file, stuck);
  a.equal(fs.readFileSync(path.join(p2, 'agent-connection-v1.json'), 'utf8').includes(KEY), false);
});

test('package-win.cjs: a private package is a full one, outside the repository, with a model id given; its messages never hold the key', () => {
  const P = require('../desktop/package-win.cjs'), root = path.join(__dirname, '..'), out = tmp(), keyFile = path.join(tmp(), 'key.txt');
  fs.writeFileSync(keyFile, KEY + '\n');
  a.equal(P.privateSeed(['node', 'x', '--full', '--out', out], { root, out }), null, 'an ordinary package');
  a.deepEqual(P.privateSeed(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'synthetic-flash-model'], { root, out }), { key: KEY, model: 'synthetic-flash-model' });
  const refused = (argv, o, re) => { let m = ''; try { P.privateSeed(argv, o); } catch (e) { m = e.message; } a.match(m, re); a.equal(m.includes(KEY), false, m); };
  refused(['node', 'x', '--private-seed', keyFile, '--seed-model', 'm'], { root, out }, /add --full/);
  refused(['node', 'x', '--full', '--private-seed', keyFile], { root, out }, /--seed-model <model id> is required/);
  refused(['node', 'x', '--full', '--seed-model', 'm'], { root, out }, /needs --private-seed/);
  refused(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'm'], { root, out: path.join(root, 'exports') }, /outside the repository/);
  refused(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'm'], { root, out: root }, /outside the repository/);
  refused(['node', 'x', '--full', '--private-seed', path.join(out, 'none.txt'), '--seed-model', 'm'], { root, out }, /cannot read the key file/);
  fs.writeFileSync(keyFile, KEY + ' tail\n');
  refused(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'm'], { root, out }, /is not one a seed can hold/);
  refused(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'bad model'], { root, out }, /is not one a seed can hold/);
  // the after-build check finds every file holding the key
  const app = tmp(); fs.mkdirSync(path.join(app, 'resources'));
  fs.writeFileSync(path.join(app, 'resources', Seed.SEED_NAME), Seed.seedText({ model: 'm', apiKey: KEY })); fs.writeFileSync(path.join(app, 'other.txt'), 'x');
  a.deepEqual(P.filesHolding(app, ['resources/' + Seed.SEED_NAME, 'other.txt'], KEY), ['resources/' + Seed.SEED_NAME]);
  // and the build refuses a key anywhere else, an ordinary package with a seed, and names the private zip
  const src = fs.readFileSync(path.join(root, 'desktop', 'package-win.cjs'), 'utf8');
  a.ok(src.includes("fail('the key is in ' + holding.length + ' files of the package, not only the seed')"));
  a.ok(src.includes("fail('a seed in an ordinary package')"));
  a.ok(src.includes("`MontClip-${seed ? 'private' : 'internal'}-win-x64${full ? '-full' : ''}-${buildId}`"));
});

test('the main process: the seed only from resources/ when packaged (MONTCLIP_SEED_FILE in development); plain words in both languages', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.ok(main.includes("const seedFile = app.isPackaged ? path.join(process.resourcesPath, AgentSeed.SEED_NAME) : (process.env.MONTCLIP_SEED_FILE || null);"));
  a.ok(main.includes("encryptionAvailable: () => safeStorage.isEncryptionAvailable()"));
  a.doesNotMatch(main.slice(main.indexOf('const AgentSeed'), main.indexOf("for(const operation of ['get','configure'")), /apiKey|console\./, 'nothing of the seed is logged');
  const T = require('../desktop/native-text').TEXT;
  for (const lang of ['zh-CN', 'en']) for (const k of ['seedTitle', 'seedNoEncryption', 'seedFailed', 'seedInvalid', 'seedNotDeleted']) a.ok(T[lang][k], lang + ' ' + k);
  a.match(T['zh-CN'].seedNoEncryption, /不会改存成明文/);
  a.match(T['zh-CN'].seedNotDeleted, /\{file\}$/);
});
