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

test('a matching saved connection removes the seed; a different connection or bad seed is preserved; a removal failure is reported', () => {
  const profile = tmp(), resources = tmp(), safe = sealing(true), service = AgentService.createDiskService(profile, safe);
  a.equal(service.configure({ provider: 'deepseek', model: 'their-own', apiKey: 'sk-their-own-key' }).configured, true);
  const before = fs.readFileSync(path.join(profile, 'agent-connection-v1.json'), 'utf8');
  const seed = writeSeed(resources);
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'SEED_CONFLICT');
  a.equal(fs.readFileSync(path.join(profile, 'agent-connection-v1.json'), 'utf8'), before);
  a.equal(fs.existsSync(seed), true);
  a.equal(service.get().configured, false);
  a.equal(service.deleteConnection().code, 'CONNECTION_DELETED');
  a.equal(service.configure(Seed.parseSeed(fs.readFileSync(seed, 'utf8'))).configured, true);
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'ALREADY_CONFIGURED');
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
  const T0 = (lang) => (k) => require('../ui-preferences').text[lang]['officialPane_' + k];
  // 「AI 生成」 (Deja, 2026-11-04): one line at the top of the panel, always there; no label on each reply
  a.ok(pane.includes(' <p className="cindy-ai-line" data-ai-replies-line>{t.aiRepliesLine}</p>\n <div className="agent-toolbar">'));
  a.doesNotMatch(pane, /m\.role!=='user'&&<span className="cindy-ai-label"/, 'no label on each reply');
  a.equal(T0('zh-CN')('aiRepliesLine'), '回复由 AI 生成');
  a.equal(T0('en')('aiRepliesLine'), 'Replies are AI-generated');
  a.match(fs.readFileSync(path.join(__dirname, '..', 'cindy-official.js'), 'utf8'), /data-ai-replies-line/, 'the bundle was rebuilt');
  a.ok(pane.includes("const read=metadata.provider==='deepseek'?await W.montclipAgentService?.noticeGet?.():{accepted:true};"), 'the notice names DeepSeek: shown for it');
  // one button, 〔我知道了〕, and it is not a yes to sending: it keeps that she read it, then the review box as before
  const notice = pane.slice(pane.indexOf('<dialog ref={noticeDialog}'), pane.indexOf('</dialog>', pane.indexOf('<dialog ref={noticeDialog}')));
  a.equal((notice.match(/<button/g) || []).length, 1); a.ok(notice.includes('<button data-data-notice-ok onClick={acceptNotice}>{t.dataNoticeOk}</button>'));
  a.ok(pane.includes("const acceptNotice=async()=>{const r=await W.montclipAgentService?.noticeAck?.(noticeVersion);noticeDialog.current?.close();const then=noticeThen.current;noticeThen.current=null;if(!r?.accepted){setNotice('failed');return;}if(then==='review')await showReview();};"),
    'kept; then the review only when she was sending (shown again from 设置 or the link, it only closes)');
  a.ok(notice.includes('onCancel={e=>e.preventDefault()}'), 'Esc does not close it: only 〔我知道了〕 does');
  a.doesNotMatch(pane.slice(pane.indexOf('const acceptNotice'), pane.indexOf(' const confirm=')), /conversation\.confirm|\.send\(/, '〔我知道了〕 sends nothing');
  // JJ's v3, word for word (europa ~/montclip-labels/jj/2026-11-04-AI数据说明-DeepSeek私下包-v3-JJ.md, sha256 98da6840…,
  // QQ passed; Deja, 2026-11-04: v3 is the one): each line as it shows, a bold label followed by its text
  const V = require('../ui-preferences'), T = (lang) => (k) => V.text[lang]['officialPane_' + k];
  const lines = (t) => [t('dataNoticeTitle'), t('dataNoticeWhatLabel') + t('dataNoticeWhat'), t('dataNoticeWhoLabel') + t('dataNoticeWho'),
    t('dataNoticeUseLabel') + t('dataNoticeUse'), t('dataNoticeSo'), t('dataNoticeOffLabel') + t('dataNoticeOff'), t('dataNoticeAiLabel') + t('dataNoticeAi'),
    t('dataNoticeBasis'), t('dataNoticeOk')];
  a.deepEqual(lines(T('zh-CN')), [
    '用 AI 之前，先说清楚这几件事',
    '发了什么：你在助手里写的话，加上你选中的片段的时间、长度这类数字。字幕（听写出来的文字）和弹幕的原文，只有你点了〔让 AI 看〕才会发。录像、声音和文件本身，从来不发。',
    '发给谁：直接发给 DeepSeek（深度求索）的官方接口 api.deepseek.com，中间不经过 MontClip 团队或别的服务器；数据存在中国境内。',
    'DeepSeek 会怎么用：DeepSeek 的隐私政策写着，你发过去的内容和 AI 的回复「可能」用于训练模型和改进服务，用之前会加密、去掉能认出你的信息。用这种方式发过去的内容，没有开关能让它不拿去训练，它也没公布会存多久。我们只是照实转述，没法替 DeepSeek 保证什么。',
    '所以：不想让别人看到的话，别写进助手；不想发的字幕和弹幕，就别点〔让 AI 看〕。',
    '怎么关：在「设置 › AI 助手」里关掉「用 AI 助手」，就一次都不发了。开着的时候，每次发出去之前也都会先给你看要发什么、发到哪个网站，你可以不发。不用 AI，剪辑照常能用。',
    '标「AI 生成」：助手面板顶上写着「回复由 AI 生成」；它给的剪辑计划，单独标「AI 生成」。',
    '依据：DeepSeek 隐私政策（2026 年 2 月 10 日版）、DeepSeek 开放平台服务条款（2026 年 4 月 29 日生效）。它们改了，这页也会跟着改。',
    '我知道了']);
  a.deepEqual(lines(T('en')), [
    'Before you use the AI, a few things to know',
    'What is sent: what you write to the assistant, plus numbers about the clips you selected, such as their times and lengths. Caption text (from transcription) and live-comment text are sent only when you click [Let the AI see it]. Your video, audio and files themselves are never sent.',
    "Who gets it: DeepSeek's official API (api.deepseek.com), directly. Nothing passes through the MontClip team or any other server. The data is stored in mainland China.",
    "What DeepSeek does with it: DeepSeek's privacy policy says what you send and what the AI replies \"may\" be used to train its models and improve its service, after being encrypted and stripped of anything that identifies you. For data sent this way there is no switch to keep it out of training, and DeepSeek hasn't said how long it is kept. We're only passing on what the policy says; we can't promise anything on DeepSeek's behalf.",
    "So: don't write anything to the assistant that you wouldn't want others to see, and don't click [Let the AI see it] for captions or live comments you'd rather not send.",
    "How to turn it off: turn off \"Use the AI assistant\" in Settings › AI assistant and nothing is ever sent. While it's on, you're shown what will be sent and to which site before every send, and you can choose not to send. Editing works as usual without the AI.",
    'Marked "AI-generated": The assistant panel says "Replies are AI-generated" at the top; editing plans it gives are marked "AI-generated" on their own.',
    'Based on: DeepSeek Privacy Policy (version of 10 Feb 2026) and DeepSeek Open Platform Terms of Service (effective 29 Apr 2026). If they change, this page will change too.',
    'Got it']);
  // the notice shows them in that order, and nothing else
  const order = ['dataNoticeWhatLabel', 'dataNoticeWhoLabel', 'dataNoticeUseLabel', 'dataNoticeSo', 'dataNoticeOffLabel', 'dataNoticeAiLabel', 'dataNoticeBasis'].map((k) => notice.indexOf('{t.' + k + '}'));
  a.ok(order.every((n, k) => n > 0 && (k === 0 || n > order[k - 1])), "v3's order");
  a.deepEqual([...new Set(notice.match(/t\.dataNotice[A-Za-z0-9]+/g))].sort(), ['t.dataNoticeAi', 't.dataNoticeAiLabel', 't.dataNoticeBasis', 't.dataNoticeOff', 't.dataNoticeOffLabel', 't.dataNoticeOk',
    't.dataNoticeSo', 't.dataNoticeTitle', 't.dataNoticeUse', 't.dataNoticeUseLabel', 't.dataNoticeWhat', 't.dataNoticeWhatLabel', 't.dataNoticeWho', 't.dataNoticeWhoLabel']);
  // the names the notice gives are the ones on screen: 设置 › AI 助手 › 用 AI 助手
  const own = (l, k) => V.text[l]['own.' + k];
  a.equal(own('zh-CN', 'ai-set-title'), 'AI 助手'); a.equal(own('zh-CN', 'ai-set-enabled'), '用 AI 助手'); a.equal(V.text['zh-CN']['term.settings'], '设置');
  a.equal(own('en', 'ai-set-title'), 'AI assistant'); a.equal(own('en', 'ai-set-enabled'), 'Use the AI assistant'); a.equal(V.text.en['term.settings'], 'Settings');
  // JJ's v4 increment (sha256 e9c59973…): the 设置 section, the review's link, the line when it is off
  a.deepEqual(['ai-set-hint', 'ai-set-notice', 'ai-set-notice-tip'].map((k) => own('zh-CN', k)), ['关掉以后，助手不会往外发任何东西；剪辑照常能用。', '数据说明', '再看一遍：发给谁、发什么、会不会被拿去训练']);
  a.deepEqual(['ai-set-hint', 'ai-set-notice', 'ai-set-notice-tip'].map((k) => own('en', k)), ["When it's off, the assistant sends nothing; editing works as usual.", 'Data notice', 'See again who gets your data, what is sent, and whether it may be used for training']);
  a.equal(T('zh-CN')('noticeLink'), '数据说明'); a.equal(T('en')('noticeLink'), 'Data notice');
  a.equal(T('zh-CN')('aiOff'), 'AI 助手关着，什么都不会发出去。要用的话，到「设置 › AI 助手」里打开。');
  a.equal(T('en')('aiOff'), 'The AI assistant is off, so nothing is sent. To use it, turn it on in Settings › AI assistant.');
  a.equal(require('../desktop/agent-data-notice').NOTICE_VERSION, 2, 'the words changed: she reads it again');
  // the label on a reply and the button the notice names are the same words
  a.equal(T('zh-CN')('aiGenerated'), 'AI 生成'); a.equal(T('en')('aiGenerated'), 'AI-generated');
  a.equal(T('zh-CN')('reference'), '让 AI 看'); a.equal(T('en')('reference'), 'Let the AI see it');
});

// QQ (2026-11-04): write the connection file, read it back and check it, and only then overwrite the seed and delete it;
// a failure part-way keeps the seed and leaves no second copy
test('sealing in order — success: written, read back the same, then the seed overwritten with zeros and deleted', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true), size = fs.statSync(seed).size, order = [];
  const watched = { ...fs,
    openSync(p, ...r) { if (p === seed) order.push('open seed'); return fs.openSync(p, ...r); },
    writeSync(fd, buf, ...r) { if (Buffer.isBuffer(buf) && buf.length === size) order.push(buf.every((b) => b === 0) ? 'zeros over the seed' : 'other bytes'); return fs.writeSync(fd, buf, ...r); },
    unlinkSync(p) { if (p === seed) order.push('delete seed'); return fs.unlinkSync(p); } };
  const service = AgentService.createDiskService(profile, safe), matches = service.matches;
  service.matches = (v) => { order.push('read back'); return matches(v); };
  a.equal(Seed.importSeed({ file: seed, fs: watched, service, encryptionAvailable: () => true }).code, 'SEALED');
  a.deepEqual(order, ['read back', 'open seed', 'zeros over the seed', 'delete seed']);
  a.equal(fs.existsSync(seed), false); a.deepEqual(holding(profile), []);
});

test('sealing in order — the write fails part-way: no connection file, no temporary, the seed kept', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true);
  const broken = { ...fs, renameSync() { throw Object.assign(Error('EIO'), { code: 'EIO' }); } };   // the temporary is written, the rename fails
  const service = AgentService.createDiskService(profile, safe, broken);
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'CONFIG_FAILED');
  a.deepEqual(fs.readdirSync(profile), [], 'no connection file, no temporary left');
  a.equal(fs.readFileSync(seed, 'utf8'), Seed.seedText({ model: 'synthetic-flash-model', apiKey: KEY }), 'the seed is kept as it was');
});

test('sealing in order — read back not the same: the connection file removed again, the seed kept, one copy only', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources);
  const wrong = { ...sealing(true), decryptString: () => 'sk-not-the-same-key' };   // what is on disk does not unseal to the key
  const service = AgentService.createDiskService(profile, wrong);
  a.equal(Seed.importSeed({ file: seed, service, encryptionAvailable: () => true }).code, 'VERIFY_FAILED');
  a.deepEqual(fs.readdirSync(profile), [], 'the connection file is gone again');
  a.equal(service.get().configured, false);
  a.equal(fs.existsSync(seed), true, 'the seed is kept for the next launch');
  // and main says it in plain words, never the key
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.ok(main.includes("VERIFY_FAILED: 'seedFailed', VERIFY_FAILED_NOT_UNDONE: 'seedSealFailed'"));
  // the read-back is the main process's own: not one of the page's operations
  a.ok(main.includes("for(const operation of ['get','configure','reset','deleteConnection','send','cancel']) ipcMain.handle('montclip:agent:'+operation,"));
});

test('failed verification and failed rollback: a fresh launch preserves the recoverable seed', async () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true);
  const expected = Seed.parseSeed(fs.readFileSync(seed, 'utf8'));
  const connection = path.join(profile, 'agent-connection-v1.json');
  const blocked = { ...fs, unlinkSync(p) { if (p === connection) throw Object.assign(Error('EPERM'), { code: 'EPERM' }); return fs.unlinkSync(p); } };
  const wrongSeal = { ...safe, encryptString: () => safe.encryptString('synthetic-wrong-key') };
  const first = AgentService.createDiskService(profile, wrongSeal, blocked);
  a.equal(Seed.importSeed({ file: seed, service: first, encryptionAvailable: () => true }).code, 'VERIFY_FAILED_NOT_UNDONE');
  a.equal(first.get().configured, false, 'a failed verification cannot advertise a usable connection');
  const before = fs.readFileSync(seed, 'utf8');
  const restart = AgentService.createDiskService(profile, safe, blocked);
  const result = Seed.importSeed({ file: seed, service: restart, encryptionAvailable: () => true });
  a.equal(fs.existsSync(seed), true, 'restart must not delete the last recovery copy');
  a.equal(result.code, 'SEAL_FAILED_LEFTOVER', 'the leftover of the failed sealing is not successful seed import, nor her own connection');
  a.equal(restart.get().configured, false, 'a restart still cannot advertise verified setup');
  a.equal(restart.get().code, 'SEED_CONFLICT');
  const request = {version:1,requestId:'conflict-send',projectId:'p',sequenceId:null,revision:0,gen:0,messages:[{role:'user',content:'synthetic'}]};
  let requests=0;const savedFetch=global.fetch;
  global.fetch=async()=>{requests++;throw Error('synthetic transport only');};
  try { a.equal((await restart.send(request)).code, 'SEED_CONFLICT', 'unverified connection cannot send'); }
  finally { global.fetch=savedFetch; }
  a.equal(requests,0);
  a.equal(restart.configure(expected).code,'SEED_CONFLICT','saving cannot bypass conflict resolution');
  a.equal(restart.deleteConnection().ok,false);
  a.equal(restart.get().configured,false,'failed removal does not clear the gate');
  a.equal(fs.readFileSync(seed, 'utf8'), before);
  a.equal(restart.matches(expected), false);
  a.deepEqual(holding(resources), [Seed.SEED_NAME]);
  a.deepEqual(holding(profile), []);
  a.equal(safe.decryptString(Buffer.from(JSON.parse(fs.readFileSync(connection, 'utf8')).secret, 'base64')), 'synthetic-wrong-key');
  // Once the user can remove the conflicting connection, the untouched seed is usable on a fresh launch.
  a.equal(AgentService.createDiskService(profile, safe).deleteConnection().code, 'CONNECTION_DELETED');
  const recovered = AgentService.createDiskService(profile, safe);
  a.equal(Seed.importSeed({ file: seed, service: recovered, encryptionAvailable: () => true }).code, 'SEALED');
  a.equal(recovered.matches(expected), true);
  a.equal(fs.existsSync(seed), false);
  a.deepEqual(fs.readdirSync(profile), ['agent-connection-v1.json'], 'only one sealed key file after recovery');
  a.deepEqual(holding(profile), []);
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.ok(main.includes("SEED_CONFLICT: 'seedConflict'"), 'a conflict has its own recovery instructions');
});

// QQ on #131 (head 296d4d4a): a connection that a failed rollback left behind is not a connection she chose. On the next
// launch it is reported as a failed sealing (SEAL_FAILED_LEFTOVER), never as set up, and the seed stays; only a connection
// that is not that leftover (she set up another one herself) is SEED_CONFLICT. Neither ever deletes the seed.
test('across two launches: verify mismatch + rollback EPERM, then the next launch keeps the seed and reports a failed sealing', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true);
  const expected = Seed.parseSeed(fs.readFileSync(seed, 'utf8')), before = fs.readFileSync(seed, 'utf8');
  const connection = path.join(profile, 'agent-connection-v1.json');
  const blocked = { ...fs, unlinkSync(p) { if (p === connection) throw Object.assign(Error('EPERM'), { code: 'EPERM' }); return fs.unlinkSync(p); } };
  const wrongSeal = { ...safe, encryptString: () => safe.encryptString('synthetic-wrong-key') };
  const first = AgentService.createDiskService(profile, wrongSeal, blocked);
  a.equal(Seed.importSeed({ file: seed, service: first, encryptionAvailable: () => true }).code, 'VERIFY_FAILED_NOT_UNDONE');
  a.equal(fs.existsSync(connection), true, 'the leftover connection could not be removed');
  // the second launch: a fresh service, the file system working again for the seed
  const second = AgentService.createDiskService(profile, safe);
  a.equal(second.get().configured, true, 'on its own the leftover file looks like a saved connection');
  const result = Seed.importSeed({ file: seed, service: second, encryptionAvailable: () => true });
  a.equal(result.code, 'SEAL_FAILED_LEFTOVER', 'a failed sealing, not ALREADY_CONFIGURED and not her own other connection');
  a.equal(fs.readFileSync(seed, 'utf8'), before, 'the seed, the last recovery copy, is kept as it was');
  a.equal(second.get().configured, false, 'never shown as set up');
  a.equal(second.matches(expected), false);
  a.deepEqual(holding(profile), []); a.deepEqual(holding(resources), [Seed.SEED_NAME], 'the leftover record holds no key');
  // a third launch says the same: nothing was consumed
  a.equal(Seed.importSeed({ file: seed, service: AgentService.createDiskService(profile, safe), encryptionAvailable: () => true }).code, 'SEAL_FAILED_LEFTOVER');
  a.equal(fs.readFileSync(seed, 'utf8'), before);
  // she removes the leftover (as the dialog says) and restarts: the seed is sealed, and nothing of the leftover stays
  a.equal(AgentService.createDiskService(profile, safe).deleteConnection().code, 'CONNECTION_DELETED');
  const recovered = AgentService.createDiskService(profile, safe);
  a.equal(Seed.importSeed({ file: seed, service: recovered, encryptionAvailable: () => true }).code, 'SEALED');
  a.equal(recovered.matches(expected), true);
  a.deepEqual(fs.readdirSync(resources), [], 'the seed and the leftover record are both gone');
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.ok(main.includes("SEAL_FAILED_LEFTOVER: 'seedSealFailed'"), 'its own words: the sealing failed');
});

test('a different connection she set up herself (not a leftover): SEED_CONFLICT, its own code; the seed kept, AI paused', () => {
  const profile = tmp(), resources = tmp(), seed = writeSeed(resources), safe = sealing(true), before = fs.readFileSync(seed, 'utf8');
  const own = AgentService.createDiskService(profile, safe);
  a.equal(own.configure({ provider: 'deepseek', model: 'synthetic-own-model', apiKey: 'sk-synthetic-own-key' }).ok, true);
  const launch = AgentService.createDiskService(profile, safe);
  a.equal(Seed.importSeed({ file: seed, service: launch, encryptionAvailable: () => true }).code, 'SEED_CONFLICT');
  a.equal(fs.readFileSync(seed, 'utf8'), before); a.equal(launch.get().configured, false); a.equal(launch.get().code, 'SEED_CONFLICT');
  // a leftover record from an earlier failure does not turn her own, later connection into a leftover
  const profile2 = tmp(), resources2 = tmp(), seed2 = writeSeed(resources2);
  const connection2 = path.join(profile2, 'agent-connection-v1.json');
  const blocked = { ...fs, unlinkSync(p) { if (p === connection2) throw Object.assign(Error('EPERM'), { code: 'EPERM' }); return fs.unlinkSync(p); } };
  const wrongSeal = { ...safe, encryptString: () => safe.encryptString('synthetic-wrong-key') };
  a.equal(Seed.importSeed({ file: seed2, service: AgentService.createDiskService(profile2, wrongSeal, blocked), encryptionAvailable: () => true }).code, 'VERIFY_FAILED_NOT_UNDONE');
  fs.unlinkSync(connection2);   // removed by hand, then she sets up her own
  a.equal(AgentService.createDiskService(profile2, safe).configure({ provider: 'deepseek', model: 'synthetic-own-model', apiKey: 'sk-synthetic-own-key' }).ok, true);
  a.equal(Seed.importSeed({ file: seed2, service: AgentService.createDiskService(profile2, safe), encryptionAvailable: () => true }).code, 'SEED_CONFLICT');
  a.equal(fs.existsSync(seed2), true);
});

test('a wiped seed that could not be deleted stays a cleanup task on later launches', () => {
  const profile=tmp(), resources=tmp(), seed=writeSeed(resources), safe=sealing(true);
  const noUnlink={...fs,unlinkSync(){throw Object.assign(Error('EPERM'),{code:'EPERM'});}};
  const first=AgentService.createDiskService(profile,safe);
  a.equal(Seed.importSeed({file:seed,fs:noUnlink,service:first,encryptionAvailable:()=>true}).code,'NOT_DELETED');
  a.ok(fs.readFileSync(seed).every(b=>b===0));
  const before=fs.readFileSync(path.join(profile,'agent-connection-v1.json'));
  const restarted=AgentService.createDiskService(profile,safe);
  a.equal(Seed.importSeed({file:seed,fs:noUnlink,service:restarted,encryptionAvailable:()=>true}).code,'NOT_DELETED');
  a.equal(restarted.get().configured,true,'the verified connection still works');
  a.deepEqual(fs.readFileSync(path.join(profile,'agent-connection-v1.json')),before);
  a.equal(Seed.importSeed({file:seed,service:restarted,encryptionAvailable:()=>true}).code,'SEED_CLEANED');
  a.equal(fs.existsSync(seed),false);
  a.equal(restarted.matches({provider:'deepseek',model:'synthetic-flash-model',apiKey:KEY}),true);
});

test('a package carries no other credential (QQ ⑥): anything shaped like one in its text files fails the build, the seed aside', () => {
  const P = require('../desktop/package-win.cjs'), app = tmp();
  fs.mkdirSync(path.join(app, 'resources', 'app'), { recursive: true });
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(app, f)), { recursive: true }); fs.writeFileSync(path.join(app, f), t); return f; };
  const clean = [put('resources/app/app.js', 'const x = "sk-short";'), put('resources/app/README.md', 'no keys here'), put('resources/asr/model.onnx', 'sk-' + 'a'.repeat(40))];
  a.deepEqual(P.credentialsIn(app, clean), [], 'short look-alikes and binaries are not read as credentials');
  const bad = [put('resources/app/leak.js', 'const k = "sk-' + 'b'.repeat(32) + '";'), put('resources/app/cfg.json', '{"aws":"AKIA' + 'C'.repeat(16) + '"}'),
    put('resources/app/id.txt', '-----BEGIN OPENSSH PRIVATE KEY-----'), put('resources/app/gh.md', 'ghp_' + 'd'.repeat(36))];
  a.deepEqual(P.credentialsIn(app, [...clean, ...bad]).map((x) => x.file + ' ' + x.kind),
    ['resources/app/leak.js an sk- key', 'resources/app/cfg.json an AWS access key', 'resources/app/id.txt a private key', 'resources/app/gh.md a GitHub token']);
  // the repository's own packaged files hold none
  const root = path.join(__dirname, '..'), tracked = require('node:child_process').execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n');
  const files = P.packagedFiles(root, tracked).flatMap((f) => (f.endsWith('/') ? tracked.filter((t) => t.startsWith(f)) : [f])).filter((f) => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile());
  a.deepEqual(P.credentialsIn(root, files), []);
  const src = fs.readFileSync(path.join(root, 'desktop', 'package-win.cjs'), 'utf8');
  a.ok(src.includes("const found = credentialsIn(appDir, all.filter((f) => f !== 'resources/' + AgentSeed.SEED_NAME)); if (found.length) fail("));
});
