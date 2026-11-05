'use strict';
// JJ P1 (2026-11-04, via Deja): one detection for the desktop app, web / server mode and the Cindy plugin.
//  1. ffmpeg and ffprobe are looked for in order: bundled → PATH → the place the user chose. A usable one (export has an
//     H.264 encoder) means no notice at all.
//  2. Nothing found: only preview / export are unavailable, with the reason; browsing and marking clips keep working.
//  3. Every control a notice mentions is in the same card, generated with its text.
//  4. Linux: a copyable install command, 「重新检测」, 「我装在别处了，手动选择」 (a path box when there is no file dialog).
//     Windows: 「选择 ffmpeg.exe」, the existing flow. No automatic download.
//  5. 「重新检测」 works without a restart; a chosen path is saved and survives one.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const FF = require('../ffmpeg-path'), X = require('../external-ffmpeg'), Card = require('../ffmpeg-card');
function tmp(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-detect-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }

test('order: bundled, then PATH, then the place the user chose — and each tool is an absolute path', () => {
  const plat = process.platform, x = (n) => n + (plat === 'win32' ? '.exe' : '');
  const root = path.parse(process.cwd()).root, app = path.join(root, 'app'), bin = path.join(root, 'usr', 'bin'), mine = path.join(root, 'opt', 'ff');
  const vendor = (n) => path.join(app, 'vendor', 'ffmpeg', `${plat}-x64`, x(n));
  const settings = path.join(root, 'data', 'external-ffmpeg.json');
  const read = (f) => (f === settings ? { path: path.join(mine, x('ffmpeg')) } : null);
  const r = (name, have) => FF.resolveTool(name, { env: { PATH: bin }, appDir: app, platform: plat, arch: 'x64', exists: (f) => have.includes(f), chosenFile: settings, readChoice: read, usable: () => true });
  a.deepEqual(r('ffmpeg', [vendor('ffmpeg'), path.join(bin, x('ffmpeg'))]), { ok: true, path: vendor('ffmpeg'), source: 'vendor' });
  const p = r('ffmpeg', [path.join(bin, x('ffmpeg')), path.join(mine, x('ffmpeg'))]);
  a.equal(p.ok, true); a.equal(p.source, 'path'); a.equal(p.path, path.join(bin, x('ffmpeg')));
  const c = r('ffprobe', [path.join(mine, x('ffprobe'))]);
  a.equal(c.ok, true); a.equal(c.source, 'chosen'); a.equal(c.path, path.join(mine, x('ffprobe')), 'ffprobe is looked for beside the chosen ffmpeg');
  const none = r('ffmpeg', []);
  a.equal(none.ok, false); a.ok(path.isAbsolute(none.path)); a.match(none.error, /not installed|not find|missing/i);
  // the other platform's PATH rules: Windows adds .exe and splits on ';', POSIX on ':'; relative / empty entries are skipped
  a.equal(FF.findOnPath('ffmpeg.exe', { env: { Path: ';rel;C:\\ff\\bin' }, platform: 'win32', exists: (f) => f === 'C:\\ff\\bin\\ffmpeg.exe' }), 'C:\\ff\\bin\\ffmpeg.exe');
  a.equal(FF.findOnPath('ffmpeg', { env: { PATH: '::bin:/usr/bin' }, platform: 'linux', exists: (f) => f === '/usr/bin/ffmpeg' || f === 'bin/ffmpeg' }), '/usr/bin/ffmpeg');
});

test('four states, from what was found', () => {
  a.equal(Card.state({ ffmpeg: false, ffprobe: true, h264: true }), 'missing');
  a.equal(Card.state({ ffmpeg: true, ffprobe: false, h264: true }), 'noProbe');
  a.equal(Card.state({ ffmpeg: true, ffprobe: true, h264: false }), 'noH264');
  a.equal(Card.state({ ffmpeg: true, ffprobe: true, h264: true }), 'ready');
});

test('a chosen file must be a program named ffmpeg that runs as FFmpeg; nothing else is started', async (t) => {
  const d = tmp(t), ok = path.join(d, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), other = path.join(d, 'tool.exe');
  fs.writeFileSync(ok, 'x'); fs.writeFileSync(other, 'x'); fs.chmodSync(ok, 0o755);
  let ran = 0; const run = async (f, args) => { ran++; return { code: 0, stdout: 'ffmpeg version 6.1' }; };
  a.equal((await X.checkTool(other, { run })).code, 'notFfmpeg'); a.equal(ran, 0, 'a file with another name is never started');
  a.equal((await X.checkTool('ffmpeg', { run })).code, 'notFfmpeg');
  a.equal((await X.checkTool(path.join(d, 'gone', 'ffmpeg'), { run })).code, 'notFfmpeg');
  a.equal((await X.checkTool(ok, { run: async () => ({ code: 0, stdout: 'hello' }) })).code, 'notFfmpeg');
  a.equal((await X.checkTool(ok, { run })).ok, true);
  const settings = path.join(d, 'data', 'external-ffmpeg.json');
  a.equal((await X.saveTool(settings, ok, { run })).ok, true);
  a.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), { version: 1, path: ok });
});

/* ── the card ── */
const quoted = (s) => [...s.matchAll(/[「『“]([^」』”]+)[」』”]/g)].map((m) => m[1]);
const PLATFORMS = ['linux', 'win32', 'darwin'], STATES = ['missing', 'noProbe', 'noH264', 'tooOld'];

test('JJ\'s "还不能导出 MP4" card, word for word, apart from "not found"', () => {
  const c = Card.model({ state: 'noH264', platform: 'linux' }, 'zh-CN');
  a.equal(c.title, '还不能导出 MP4');
  a.equal(c.body, '这台电脑上的 FFmpeg 少了导出 MP4 要用的部分（H.264 编码）。片段照常能浏览、能标，导出要换一个完整版的 FFmpeg。');
  a.equal(c.howto, '打开终端运行 `sudo apt install ffmpeg`，装好后点「重新检测」。');
  a.equal(c.command, 'sudo apt install ffmpeg');
  a.deepEqual(c.buttons.map((b) => b.label), ['重新检测', '我装在别处了，手动选择']);
  a.notEqual(c.title, Card.model({ state: 'missing', platform: 'linux' }, 'zh-CN').title);
  a.ok(!/预览照常/.test(JSON.stringify(c)), 'not until LGPL preview is confirmed (ADR 5)');
});

test('JJ\'s Linux card, word for word', () => {
  const c = Card.model({ state: 'missing', platform: 'linux' }, 'zh-CN');
  a.equal(c.title, '还差一个剪辑工具');
  a.equal(c.body, '预览和导出视频要用到免费工具 FFmpeg，这台电脑上还没找到它。打开终端运行下面这行，装好后点「重新检测」：');
  a.equal(c.command, 'sudo apt install ffmpeg'); a.equal(c.copy, '复制');
  a.deepEqual(c.buttons.map((b) => [b.id, b.label]), [['detect', '重新检测'], ['choose', '我装在别处了，手动选择']]);
  const z = Card.results('zh-CN', 'linux');
  a.equal(z.found, '找到了，现在可以预览和导出了。');
  a.equal(z.stillMissing, '还是没找到。如果装在别处，点『手动选择』告诉我它在哪。');
  a.equal(z.notFfmpeg, '这个文件不是 FFmpeg。请选名字叫 ffmpeg 的那个文件。');
  a.equal(z.noProbe, 'FFmpeg 找到了，但还缺它自带的 ffprobe。一般重新安装 FFmpeg 就会一起装上。');
});

test('every 「X」 a card or its result line tells the user to click is a control in that same card', () => {
  for (const lang of ['zh-CN', 'en']) for (const platform of PLATFORMS) for (const state of STATES) for (const picker of [true, false]) {
    const c = Card.model({ state, platform, picker }, lang), where = `${lang} ${platform} ${state} picker:${picker}`;
    const labels = c.buttons.map((b) => b.label).concat(c.copy ? [c.copy] : []);
    const lines = [c.body, c.howto || '', c.status || '', ...Object.values(Card.results(lang, platform))];
    for (const line of lines) for (const q of quoted(line)) {
      // a quote names a control when it is a whole label or a label's key part (「手动选择」 → 「我装在别处了，手动选择」)
      if (/[。.]$/.test(q)) continue;
      if (q === '终端' || q === 'Terminal') continue;   // the macOS app's name in JJ's sentence, not a button (buttons are 〔…〕)
      a.ok(labels.some((l) => l === q || l.endsWith(q) || l.includes(q)), `${where}: 「${q}」 is not in the card (${labels.join(' / ')})`);
    }
    for (const word of ['下面', 'below']) if (c.body.includes(word)) a.ok(c.command, `${where}: says ${word} — the command must be in the card`);
    a.ok(!/external-ffmpeg\.json|MONTCLIP_|配置文件|config file|下载|download/i.test(JSON.stringify(c)), `${where}: no config files, variables or download`);
    if (!picker) a.ok(c.input, `${where}: no file dialog → a path box`);
  }
});

test('Windows keeps 「选择 ffmpeg.exe」; Linux has the copyable command; nothing offers a download', () => {
  const w = Card.model({ state: 'missing', platform: 'win32', picker: true }, 'zh-CN');
  a.ok(w.buttons.some((b) => b.id === 'choose' && b.label === '选择 ffmpeg.exe'));
  a.equal(w.command, null);
  const l = Card.model({ state: 'missing', platform: 'linux', picker: false }, 'en');
  a.equal(l.command, 'sudo apt install ffmpeg'); a.ok(l.input && l.input.button);
  a.equal(Card.model({ state: 'ready', platform: 'linux' }, 'zh-CN'), null, 'ready: no card at all');
});

test('the page builds the card from the model, gates export, and re-detects without a reload', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  a.match(html, /<script src="ffmpeg-card\.js"><\/script>/); a.match(html, /id="ffmpegCard"/);
  const body = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}', i)); };
  const render = body('function renderFfmpegCard(');
  a.match(render, /MontClipFfmpegCard\.model\(/);
  const act = body('async function ffmpegCardAction(');
  a.match(act, /fetch\("\/api\/ffmpeg\/detect", \{ method: "POST" \}\)/); a.match(act, /fetch\("\/api\/ffmpeg\/choose"/);
  a.match(act, /window\.montclipExternalFfmpeg\?\.choose\(\)/, 'Windows desktop: the same file dialog as Settings');
  const gate = body('function applyFfmpegState(');
  a.match(gate, /btnExport/); a.match(gate, /MontClipFfmpegCard\.exportButton\(/, 'what is off follows the mode (JJ 2026-11-05)');
});

/* End to end with the real bundled binaries: no ffmpeg anywhere → "install" one into a PATH folder → 「重新检测」 (no
   restart, under 3 s) → choose a path → restart → still found. The bundled folder is hidden with MONTCLIP_FFMPEG_DIR. */
test('server: missing → re-detect after installing → chosen path survives a restart', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) return t.skip('bundled ffmpeg not installed');
  const d = tmp(t), pathDir = path.join(d, 'bin'), empty = path.join(d, 'empty'), elsewhere = path.join(d, 'opt');
  for (const x of [pathDir, empty, elsewhere]) fs.mkdirSync(x);
  const exe = (n) => n + (process.platform === 'win32' ? '.exe' : '');
  const put = (dir, n) => { const to = path.join(dir, exe(n)); try { fs.linkSync(FF.path(n), to); } catch { fs.copyFileSync(FF.path(n), to); } fs.chmodSync(to, 0o755); };
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  const env = { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_FFMPEG_DIR: empty, MONTCLIP_FFMPEG: '', MONTCLIP_FFPROBE: '', PATH: pathDir, Path: pathDir,
    MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '' };
  let { base, stop } = await startServer(t, dir, env);
  const get = async () => (await fetch(base + '/api/ffmpeg')).json();
  const post = async (p, b) => (await fetch(base + p, { method: 'POST', body: b ? JSON.stringify(b) : undefined })).json();
  let st = await get();
  a.equal(st.state, 'missing'); a.equal(st.platform, process.platform); a.equal(st.picker, false, 'web: no file dialog');
  a.equal((await (await fetch(base + '/api/project')).status), 200, 'the editor still works without ffmpeg');
  put(pathDir, 'ffmpeg');
  st = await post('/api/ffmpeg/detect'); a.equal(st.state, 'noProbe', 'ffmpeg alone');
  put(pathDir, 'ffprobe');
  const t0 = Date.now(); st = await post('/api/ffmpeg/detect');
  // JJ's 3 s is checked on an idle machine (PR #146, acceptance); here the whole suite runs in parallel
  a.ok(Date.now() - t0 < 30000, `re-detect took ${Date.now() - t0} ms`);   // a hang guard only
  a.ok(['ready', 'noH264'].includes(st.state), st.state); a.equal(st.ffmpeg.source, 'path');
  // the same answer reaches export: no restart needed
  a.equal((await (await fetch(base + '/api/export/ffmpeg')).json()).available, true);
  // a wrong file, then a real one somewhere else
  fs.writeFileSync(path.join(d, 'notes.txt'), 'x');
  const bad = await post('/api/ffmpeg/choose', { path: path.join(d, 'notes.txt') }); a.equal(bad.result, 'notFfmpeg');
  for (const f of fs.readdirSync(pathDir)) fs.rmSync(path.join(pathDir, f));
  put(elsewhere, 'ffmpeg'); put(elsewhere, 'ffprobe');
  st = await post('/api/ffmpeg/choose', { path: path.join(elsewhere, exe('ffmpeg')) });
  a.ok(['ready', 'noH264'].includes(st.state), JSON.stringify(st)); a.equal(st.ffmpeg.source, 'chosen'); a.equal(st.ffprobe.source, 'chosen');
  await stop();
  ({ base } = await startServer(t, dir, env));
  st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.ffmpeg.source, 'chosen', 'the chosen path is kept across a restart'); a.notEqual(st.state, 'missing');
});

/* #115 (plugin, first-use download) calls this after a download: can THIS program export MP4? (ADR 4: self-check, and
   show 「还不能导出 MP4」 instead of "download complete" when it can't.) */
test('server: POST /api/ffmpeg/check answers for one program, without changing what is used', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const before = await (await fetch(base + '/api/ffmpeg')).json();
  const check = async (p) => (await fetch(base + '/api/ffmpeg/check', { method: 'POST', body: JSON.stringify({ path: p }) })).json();
  const r = await check(FF.path('ffmpeg'));
  a.equal(r.ok, true); a.equal(r.ffprobe, true); a.equal(typeof r.h264, 'boolean'); a.ok(Array.isArray(r.encoders));
  a.equal(r.h264, r.encoders.length > 0);
  a.equal((await check(path.join(dir, 'project.json'))).code, 'notFfmpeg', 'only a program named ffmpeg is started');
  a.deepEqual(await (await fetch(base + '/api/ffmpeg')).json(), before, 'checking does not switch programs');
});


test('JJ final 2026-11-05: English no-H.264 card, Windows card, path box, Export tooltips, macOS card', () => {
  const en = Card.model({ state: 'noH264', platform: 'linux' }, 'en');
  a.equal(en.title, "Can't export MP4 yet");
  a.equal(en.body, "The FFmpeg on this computer can't make MP4 files (it's missing H.264 encoding). You can still browse and mark clips. To export, switch to a full version of FFmpeg.");
  const w = Card.model({ state: 'missing', platform: 'win32', picker: true }, 'zh-CN');
  a.equal(w.body, '预览和导出视频要用到免费工具 FFmpeg，这台电脑上还没找到它。如果已经装好了，点〔选择 ffmpeg.exe〕，选中它就行。');
  a.equal(Card.results('zh-CN', 'win32').stillMissing, '还是没找到。如果装在别的地方，点〔选择 ffmpeg.exe〕，选中它就行。');
  const box = Card.model({ state: 'missing', platform: 'linux', picker: false }, 'zh-CN').input;
  a.deepEqual([box.label, box.placeholder, box.button], ['FFmpeg 放在哪（完整路径）', '/usr/bin/ffmpeg', '用这个']);
  const z = Card.text['zh-CN'];
  a.equal(z.unavailable, '现在还不能导出：缺少 FFmpeg。');
  a.equal(z.unavailableH264, '现在还不能导出 MP4：这台电脑上的 FFmpeg 做不了 MP4（缺 H.264 编码）。');
  const mac = Card.model({ state: 'missing', platform: 'darwin' }, 'zh-CN');
  a.equal(mac.command, 'brew install ffmpeg'); a.equal(mac.copy, '复制');
  a.ok(mac.body.endsWith('打开「终端」，粘贴下面这一行，按回车。装好后回到这里点〔重新检测〕。'), mac.body);
  const macNo = Card.model({ state: 'noH264', platform: 'darwin' }, 'zh-CN');
  a.equal(macNo.command, 'brew install ffmpeg'); a.equal(macNo.howto, '打开「终端」，粘贴下面这一行，按回车。装好后回到这里点〔重新检测〕。');
  // the Windows card never says 「我」
  for (const st of ['missing', 'noProbe', 'noH264']) {
    const c = Card.model({ state: st, platform: 'win32', picker: true }, 'zh-CN');
    a.ok(!/我/.test(JSON.stringify(c) + Card.results('zh-CN', 'win32').stillMissing), st);
  }
  // the only DRAFT left in zh-CN is the too-old card (new, 2026-11-05)
  const zhSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'ffmpeg-card.js'), 'utf8').split('const text')[1].split('en: {')[0];
  for (const line of zhSrc.split('\n').filter((l) => /DRAFT/.test(l))) a.match(line, /too old/, 'DRAFT only on the too-old card: ' + line);
});

test('every 〔X〕 a card names is exactly a button on that card (macOS, Windows, Linux; both languages)', () => {
  for (const lang of ['zh-CN', 'en']) for (const platform of PLATFORMS) for (const state of STATES) for (const picker of [true, false]) {
    const c = Card.model({ state, platform, picker }, lang);
    const labels = c.buttons.map((b) => b.label).concat(c.copy ? [c.copy] : [], c.input && !picker ? [c.input.button] : []);
    const lines = [c.body, c.howto || '', ...Object.values(Card.results(lang, platform))];
    for (const line of lines) for (const m of line.matchAll(/〔([^〕]+)〕/g))
      a.ok(labels.includes(m[1]), `${lang} ${platform} ${state}: 〔${m[1]}〕 is not a button (${labels.join(' / ')})`);
  }
});

test('the page draws the command box with 〔复制〕 when the howto line has no inline command (macOS)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  a.match(app, /if \(m\.command && !\(m\.howto \|\| ""\)\.includes\("`"\)\) \{/);
});


/* ── Deja 2026-11-05, QQ's review ── */

/* 1. Security: a file uploaded as ffmpeg.exe lands in media/; choosing or checking it must never run it. Nothing under
   a folder the server writes (media, library, .uploads, analysis — proxies and frames —, exports, projects) is ever
   started; #115's download folder (MONTCLIP_FFMPEG_DIR) is the one allowed place under the data folder. On POSIX the
   file must be executable. */
test('a program in a folder the server writes is refused before anything is started', async (t) => {
  const d = tmp(t), media = path.join(d, 'media'), dl = path.join(d, 'ffmpeg', 'linux-x64');
  fs.mkdirSync(media, { recursive: true }); fs.mkdirSync(dl, { recursive: true });
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', bad = path.join(media, exe), good = path.join(dl, exe);
  for (const f of [bad, good]) { fs.writeFileSync(f, 'x'); fs.chmodSync(f, 0o755); }
  FF.setPlaces({ deny: [media, path.join(d, 'analysis')], allow: [dl] }); t.after(() => FF.setPlaces({ deny: [], allow: [] }));
  let ran = 0; const run = async () => { ran++; return { code: 0, stdout: 'ffmpeg version 7\n V....D libx264  H.264' }; };
  a.equal((await X.checkTool(bad, { run })).code, 'notFfmpeg');
  a.equal((await X.saveTool(path.join(d, 'c.json'), bad, { run })).ok, false);
  a.equal((await X.saveChoice(path.join(d, 'c.json'), bad, { run })).ok, false);
  a.equal((await X.check(bad, { run })).ok, false);
  a.equal(ran, 0, 'nothing was started');
  a.equal(fs.existsSync(path.join(d, 'c.json')), false, 'nothing was saved');
  // through a different spelling of the same folder too
  a.equal(FF.placeAllowed(path.join(d, 'media', '.', exe)), false);
  if (process.platform === 'win32') a.equal(FF.placeAllowed(bad.toUpperCase()), false, 'Windows paths ignore case');
  a.equal((await X.checkTool(good, { run })).ok, true, "#115's download folder is allowed"); a.equal(ran, 1);
  if (process.platform !== 'win32') {
    const plain = path.join(d, 'plain', 'ffmpeg'); fs.mkdirSync(path.dirname(plain)); fs.writeFileSync(plain, 'x'); fs.chmodSync(plain, 0o644);
    a.equal((await X.checkTool(plain, { run })).code, 'notFfmpeg', 'not executable'); a.equal(ran, 1);
  }
});

/* CI (Windows runner): the server names its folders before media/ or .uploads exist, through a path the system spells
   another way (the runner's temp folder is C:\Users\RUNNER~1\…). A folder made later, reached through an alias, is
   still refused. */
test('a server folder that does not exist yet, named through an alias, is still refused once it is made', (t) => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-alias-')), alias = real + '-link';
  t.after(() => { try { fs.unlinkSync(alias); } catch { } fs.rmSync(real, { recursive: true, force: true }); FF.setPlaces({}); });
  fs.symlinkSync(real, alias, 'junction');
  FF.setPlaces({ deny: [path.join(alias, 'data', 'media')] });   // nothing under the alias exists yet
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', file = path.join(real, 'data', 'media', exe);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x', { mode: 0o755 });
  a.equal(FF.placeAllowed(file), false, 'the real path');
  a.equal(FF.placeAllowed(path.join(alias, 'data', 'media', exe)), false, 'the alias');
  const beside = path.join(real, 'data', exe); fs.writeFileSync(beside, 'x', { mode: 0o755 });
  a.equal(FF.placeAllowed(beside), true, 'beside it is fine');
});

test('server: an upload named ffmpeg.exe can be neither chosen nor checked; the desktop app refuses check', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  // the real bundled program, so if the server did start it, it would answer as FFmpeg
  const body = FF.available('ffmpeg') ? fs.readFileSync(FF.path('ffmpeg')) : Buffer.from('#!/bin/sh\necho ffmpeg version 9\n');
  const up = await (await fetch(base + '/api/upload?name=' + exe, { method: 'POST', body })).json();
  a.ok(up.src, JSON.stringify(up));
  const file = path.join(dir, 'media', decodeURIComponent(up.src.replace(/^\/media\//, '')));
  if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
  const choose = await (await fetch(base + '/api/ffmpeg/choose', { method: 'POST', body: JSON.stringify({ path: file }) })).json();
  a.equal(choose.result, 'notFfmpeg'); a.equal(fs.existsSync(path.join(dir, 'external-ffmpeg.json')), false);
  const check = await (await fetch(base + '/api/ffmpeg/check', { method: 'POST', body: JSON.stringify({ path: file }) })).json();
  a.equal(check.ok, false); a.equal(check.code, 'notFfmpeg');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/ffmpeg/check"'), server.indexOf('if (p === "/api/ffmpeg/choose"'));
  a.match(route, /if \(DESKTOP\) \{ sendJSON\(res, 403,/, 'desktop: only the main process file dialog');
  a.match(server, /FF\.setPlaces\(\{ deny: \[MEDIA_DIR, LIBRARY_DIR, UPLOADS_DIR, ANALYSIS_DIR, PROXIES_DIR, FRAMES_DIR, EXPORTS_DIR/);
});

/* 2. Which FFmpeg (QQ (a), Deja): the 11-02 rule stands — everything uses the bundled build; a chosen / variable / PATH
   FFmpeg only encodes H.264 (exports, and proxies where the bundled build has no H.264). Only with no bundled build
   at all is one used for everything, and then only if it passes the gate (it must run the ebur128 options MontClip
   uses — europa's Debian 5.1 does not). Nothing is pinned globally. */
test('the bundled build is used for everything; another FFmpeg only for H.264, or for all when there is no bundled build and it passes the gate', async (t) => {
  const plat = process.platform, x = (n) => n + (plat === 'win32' ? '.exe' : '');
  const root = path.parse(process.cwd()).root, app = path.join(root, 'app'), bin = path.join(root, 'usr', 'bin');
  const vendor = path.join(app, 'vendor', 'ffmpeg', `${plat}-x64`, x('ffmpeg')), sys = path.join(bin, x('ffmpeg'));
  const r = (have, usable) => FF.resolveTool('ffmpeg', { env: { PATH: bin }, appDir: app, platform: plat, arch: 'x64', exists: (f) => have.includes(f), chosenFile: null, usable });
  a.equal(r([vendor, sys], () => true).source, 'vendor', 'a full system FFmpeg does not replace the bundled one');
  a.equal(r([sys], () => true).source, 'path', 'no bundled build: the system one, for everything');
  const old = r([sys], () => false);
  a.equal(old.ok, false); a.equal(old.tooOld, true); a.equal(old.path, sys); a.match(old.error, /too old|options/i);
  a.equal(typeof FF.use, 'undefined', 'nothing pins another FFmpeg as the global one');
  a.equal(typeof FF.pick, 'undefined');
  // H.264: libx264 from PATH only when the bundled build has no H.264 encoder
  const d = tmp(t), onPath = path.join(d, x('ffmpeg')); fs.writeFileSync(onPath, 'x'); fs.chmodSync(onPath, 0o755);
  const x264 = async (f, args) => args.includes('-encoders') ? { code: 0, stdout: ' V....D libx264  H.264\n' } : { code: 0, stdout: 'ffmpeg version 5.1\n' };
  const ext = X.createExternal({ settingsFile: null, envPath: null, run: x264, setup: 'server', findOnPath: () => onPath });
  a.deepEqual([...(await ext.available(new Set(['h264_mf', 'ffv1'])))].sort(), ['ffv1', 'h264_mf'], 'bundled has H.264: PATH not used');
  a.ok((await ext.available(new Set(['ffv1', 'h264_omx']))).has('libx264'), 'bundled has none: libx264 from PATH');
  a.equal((await ext.current()).source, 'path');
  // the europa 5.1 / ebur128 case cannot happen: measuring uses FF.path (the bundled build), never the H.264 program
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const loud = server.slice(server.indexOf('async function measureLoudness('), server.indexOf('function ffprobeJSON('));
  a.match(loud, /runFfmpeg\(Delivery\.LOUDNESS_ARGS\(file\), timeout\)/); a.ok(!/measurePath|pickFfmpeg|FF\.use\(/.test(server));
  a.ok(FF.GATE_ARGS.join(' ').includes('ebur128=peak=true:framelog=quiet'), 'the gate runs the ebur128 options measuring uses');
  a.equal(require('../delivery').LOUDNESS_ARGS('x').find((v) => /ebur128/.test(v)), 'ebur128=peak=true:framelog=quiet', 'the gate matches what is measured');
});

test('server: bundled build + a full FFmpeg on PATH → bundled for everything, libx264 from PATH for H.264', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  if (!FF.available('ffmpeg')) return t.skip('bundled ffmpeg not installed');
  let sys = null;
  try {
    for (const f of require('node:child_process').execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean))
      if (/libx264/.test(require('node:child_process').execFileSync(fs.realpathSync(f), ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))) { sys = fs.realpathSync(f); break; }
  } catch { }
  if (!sys) return t.skip('no FFmpeg with libx264 on PATH here');
  const dir = makeDataDir(t, seedProject({ revision: 1 })), p = path.dirname(sys);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_TEST_NO_H264: '1', PATH: p, Path: p, MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '' });
  const st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.ffmpeg.source, 'vendor', 'the bundled build stays the one for everything'); a.equal(st.state, 'ready'); a.equal(st.encoder, 'libx264');
  const h = await (await fetch(base + '/api/export/h264')).json();
  a.deepEqual(h.external, { ok: true, source: 'path' });
});

/* 3. JJ (2026-11-05): no H.264 — simple mode greys the whole Export button; advanced mode keeps it and disables only the
   H.264 (MP4) choices, each with JJ's note; Archive still exports. The same card in both. */
test('no H.264: simple mode greys Export; advanced mode disables only the MP4 choices, with JJ\'s note', () => {
  for (const lang of ['zh-CN', 'en']) {
    const t = Card.text[lang];
    const simple = Card.exportButton({ state: 'noH264' }, 'simple', lang);
    a.deepEqual(simple, { disabled: true, title: t.unavailableH264 });
    a.deepEqual(Card.exportButton({ state: 'noH264' }, 'advanced', lang), { disabled: false, title: null });
    for (const mode of ['simple', 'advanced']) {
      a.deepEqual(Card.exportButton({ state: 'missing' }, mode, lang), { disabled: true, title: t.unavailable });
      a.deepEqual(Card.exportButton({ state: 'ready' }, mode, lang), { disabled: false, title: null });
    }
    a.deepEqual(Card.exportOption({ state: 'noH264' }, 'advanced', true, lang), { disabled: true, note: t.h264Option });
    a.deepEqual(Card.exportOption({ state: 'noH264' }, 'advanced', false, lang), { disabled: false, note: null }, 'Archive still exports');
    a.deepEqual(Card.exportOption({ state: 'ready' }, 'advanced', true, lang), { disabled: false, note: null });
    a.ok(!/存档|Archive/.test(JSON.stringify(Card.model({ state: 'noH264', platform: 'linux' }, lang))), 'the card does not mention Archive');
  }
  a.equal(Card.text['zh-CN'].h264Option, '这台电脑上的 FFmpeg 做不了 MP4（缺 H.264 编码）。');
  a.equal(Card.text.en.h264Option, "The FFmpeg on this computer can't make MP4 (missing H.264 encoding).");
  // the page follows a mode switch, and the export dialog asks per option
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const body = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}', i)); };
  a.match(body('function applyFfmpegState('), /MontClipFfmpegCard\.exportButton\(st, mcView\.get\(\)\.mode, mcView\.get\(\)\.language\)/);
  a.match(body('function updateMontClipView('), /try \{ applyFfmpegState\(\); \}/);
  a.match(body('function populateExportProfileSelect('), /MontClipFfmpegCard\.exportOption\(/);
});
