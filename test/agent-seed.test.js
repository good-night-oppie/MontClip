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
  a.deepEqual(P.privateSeed(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'synthetic-flash-model'], { root, out }), { key: KEY, model: 'synthetic-flash-model', file: keyFile, deleteAfter: false });
  a.equal(P.privateSeed(['node', 'x', '--full', '--private-seed', keyFile, '--seed-model', 'm', '--delete-key-file'], { root, out }).deleteAfter, true);
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

test('a private package done: its SHA-256 printed with the reminder to note it with the streamer\'s number; the key file deleted (--delete-key-file) or a reminder; no list file, never the key', () => {
  const P = require('../desktop/package-win.cjs'), dir = tmp(), keyFile = path.join(dir, 'key.txt'), said = [];
  fs.writeFileSync(keyFile, KEY);
  const before = fs.readdirSync(dir);
  a.deepEqual(P.privateDone({ key: KEY, file: keyFile, deleteAfter: false }, { zipName: 'MontClip-private-win-x64-full-x.zip', sha256: 'ab'.repeat(32) }, { say: (l) => said.push(l) }), { keyFileGone: false });
  a.ok(said.some((l) => l.includes('ab'.repeat(32)) && l.includes('主播的编号')), 'the SHA-256 and the reminder');
  a.ok(said.some((l) => l.includes('请删掉它') && l.includes(keyFile)));
  a.equal(fs.existsSync(keyFile), true); a.deepEqual(fs.readdirSync(dir), before, 'no list file written');
  said.length = 0;
  a.deepEqual(P.privateDone({ key: KEY, file: keyFile, deleteAfter: true }, { zipName: 'z.zip', sha256: 'cd'.repeat(32) }, { say: (l) => said.push(l) }), { keyFileGone: true });
  a.equal(fs.existsSync(keyFile), false); a.ok(said.some((l) => l.includes('已经删掉')));
  a.equal(said.join('\n').includes(KEY), false, 'the key is never printed');
});

test('the 「AI 数据说明」 is kept by the main process across launches; a new version shows it again; nothing else is stored', () => {
  const N = require('../desktop/agent-data-notice'), root = tmp(), store = N.createStore(root);
  a.deepEqual(store.get(), { ok: true, version: N.NOTICE_VERSION, accepted: false });
  a.equal(store.ack(N.NOTICE_VERSION + 1).code, 'NOTICE_VERSION'); a.equal(store.ack(0).code, 'NOTICE_VERSION');
  a.equal(store.ack(N.NOTICE_VERSION).accepted, true);
  a.equal(N.createStore(root).get().accepted, true, 'a new launch still knows');
  a.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, N.NAME), 'utf8'))).sort(), ['accepted', 'at', 'version']);
  fs.writeFileSync(path.join(root, N.NAME), JSON.stringify({ version: 1, accepted: N.NOTICE_VERSION - 1, at: 'x' }));
  a.equal(N.createStore(root).get().accepted, false, 'an older notice read is not this one');
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8'), pre = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'view-preload.js'), 'utf8');
  a.ok(main.includes("ipcMain.handle('montclip:agent:noticeGet', (event) => settingsAllowed(event, win, origin) ? dataNotice.get() : { ok: false, code: 'AGENT_FORBIDDEN' });"));
  a.ok(main.includes("ipcMain.handle('montclip:agent:noticeAck', (event, version) => settingsAllowed(event, win, origin) ? dataNotice.ack(version) : { ok: false, code: 'AGENT_FORBIDDEN' });"));
  a.ok(main.includes("if (smoke && process.env.MONTCLIP_SMOKE_NOTICE !== 'show') dataNotice.ack("), 'only a development smoke has it read beforehand');
  a.ok(pre.includes("noticeGet:()=>ipcRenderer.invoke('montclip:agent:noticeGet')") && pre.includes("noticeAck:version=>ipcRenderer.invoke('montclip:agent:noticeAck',version)"));
});

test('every request to the AI goes through the review box (QQ 4): confirm sends only a prepared, unchanged review, once', async () => {
  const Conv = require('../agent-conversation'), sends = [];
  let draft = '只保留第一句', messages = [];
  const state = { current: () => ({ draft, references: [], messages }), complete: () => {} };
  const c = Conv.createConversation({ state, getContext: () => ({ projectId: 'p1', sequenceId: 'main', revision: 1, gen: 0 }), service: { send: async (p) => { sends.push(p); return { ok: true, text: 'x' }; } }, id: () => 'r' + sends.length });
  a.equal((await c.confirm()).code, 'STALE', 'nothing prepared, nothing sent'); a.equal(sends.length, 0);
  c.prepare(); a.equal((await c.confirm()).ok, true); a.equal(sends.length, 1);
  a.equal((await c.confirm()).code, 'STALE', 'a review sends once'); a.equal(sends.length, 1);
  c.prepare(); draft = '改了'; a.equal((await c.confirm()).code, 'STALE', 'changed since the review: not sent'); a.equal(sends.length, 1);
  // the pane: the review box (naming the address) before every send, the notice before the first; the reply marked AI-made
  const pane = fs.readFileSync(path.join(__dirname, '..', 'agent-ui', 'pane.tsx'), 'utf8');
  a.equal((pane.match(/conversation\.confirm\(\)/g) || []).length, 1, 'one place sends');
  a.ok(pane.includes("const confirm=async()=>{dialog.current?.close();"), 'and it is the review box\'s 〔发送〕');
  a.ok(pane.includes('<p>{DOMAIN[provider]||DOMAIN.openai} · {cfg?.model}</p>'), 'the review names where it goes');
  a.ok(pane.indexOf("const read=await W.montclipAgentService?.noticeGet?.();if(!read?.accepted)") < pane.indexOf('setReview(conversation.prepare())'), 'the notice comes before the review');
  a.ok(pane.includes("{m.role!=='user'&&<span className=\"cindy-ai-label\" data-ai-generated>{t.aiGenerated}</span>}"));
  a.match(fs.readFileSync(path.join(__dirname, '..', 'cindy-official.js'), 'utf8'), /data-ai-generated/, 'the bundle was rebuilt');
  a.ok(pane.includes("const read=metadata.provider==='deepseek'?await W.montclipAgentService?.noticeGet?.():{accepted:true};"), 'the notice names DeepSeek: shown for it');
  // one button, 〔我知道了〕, and it is not a yes to sending: it keeps that she read it, then the review box as before
  const notice = pane.slice(pane.indexOf('<dialog ref={noticeDialog}'), pane.indexOf('</dialog>', pane.indexOf('<dialog ref={noticeDialog}')));
  a.equal((notice.match(/<button/g) || []).length, 1); a.ok(notice.includes('<button data-data-notice-ok onClick={acceptNotice}>{t.dataNoticeOk}</button>'));
  a.ok(pane.includes("const acceptNotice=async()=>{const r=await W.montclipAgentService?.noticeAck?.(noticeVersion);noticeDialog.current?.close();if(r?.accepted)await showReview();else setNotice('failed');};"));
  a.doesNotMatch(pane.slice(pane.indexOf('const acceptNotice'), pane.indexOf(' const confirm=')), /conversation\.confirm|\.send\(/, '〔我知道了〕 sends nothing');
  // JJ's final words, word for word (europa ~/montclip-labels/jj/2026-11-04-AI数据说明-DeepSeek私下包-JJ.md, sha256 40877509…a67364):
  // each line as it shows, a bold label followed by its text
  const V = require('../ui-preferences'), T = (lang) => (k) => V.text[lang]['officialPane_' + k];
  const lines = (t) => [t('dataNoticeTitle'), t('dataNoticeWhoLabel') + t('dataNoticeWho'), t('dataNoticeWhatLabel') + t('dataNoticeWhat'), t('dataNoticeTrainLabel') + t('dataNoticeTrain'),
    t('dataNoticeSo'), t('dataNoticeAlso'), '- ' + t('dataNoticeAlso1'), '- ' + t('dataNoticeAlso2'), t('dataNoticeWithout'), t('dataNoticeOk')];
  a.deepEqual(lines(T('zh-CN')), [
    '用 AI 之前，先说清楚这几件事',
    '发给谁：DeepSeek（api.deepseek.com），数据存在中国境内。',
    '发什么：你在助手里写的话，加上你选中的片段的时间、长度这类数字。字幕和弹幕的原文，只有你点了〔让 AI 看〕才会发。录像和声音不发。',
    '会不会被拿去训练：可能会。DeepSeek 的隐私政策写着，你发过去的内容和 AI 的回复「可能」用于训练和改进它们的模型，用之前会先加密、去掉能认出你的信息。通过这种方式发过去的内容会存多久、怎么要求不拿去训练，DeepSeek 没有写，我们也不知道。',
    '所以：不想让别人看到的话，别写进助手；不想发的字幕和弹幕，就别点〔让 AI 看〕。',
    '另外两点',
    '- 每次发出去之前，都会先给你看要发什么、发到哪里，你可以不发。',
    '- AI 的回复会标上「AI 生成」。',
    '不用 AI，剪辑照常能用。',
    '我知道了']);
  a.deepEqual(lines(T('en')), [
    'Before you use the AI, a few things to know',
    'Who gets it: DeepSeek (api.deepseek.com). The data is stored in mainland China.',
    'What is sent: what you write to the assistant, plus numbers about the clips you selected, such as their times and lengths. Caption and live-comment text is sent only when you click [Let the AI see it]. Your video and audio are never sent.',
    'Could it be used for training? Yes, it might. DeepSeek\'s privacy policy says what you send and what the AI replies "may" be used to train and improve its models, after being encrypted and stripped of anything that identifies you. DeepSeek doesn\'t say how long data sent this way is kept, or how to opt out of training, and we don\'t know either.',
    'So: don\'t write anything to the assistant that you wouldn\'t want others to see, and don\'t click [Let the AI see it] for captions or live comments you\'d rather not send.',
    'Also',
    '- Before anything is sent, you\'re shown what will be sent and where, and you can choose not to send it.',
    '- Replies from the AI are labelled "AI-generated".',
    'Editing works as usual without the AI.',
    'Got it']);
  // the label on a reply and the button the notice names are the same words
  a.equal(T('zh-CN')('aiGenerated'), 'AI 生成'); a.equal(T('en')('aiGenerated'), 'AI-generated');
  a.equal(T('zh-CN')('reference'), '让 AI 看'); a.equal(T('en')('reference'), 'Let the AI see it');
});
