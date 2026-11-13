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
const FF = require('../server/ffmpeg-path'), X = require('../server/external-ffmpeg'), Card = require('../app/ffmpeg-card');
// removed after the test's servers (and the ffmpeg.exe copies they run from these folders) are stopped: helpers.tmpDir
function tmp(t) { return require('./helpers').tmpDir(t, 'mc-detect-'); }

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
  const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  a.match(html, /<script src="app\/ffmpeg-card\.js"><\/script>/); a.match(html, /id="ffmpegCard"/);
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
  const zhSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app/ffmpeg-card.js'), 'utf8').split('const text')[1].split('en: {')[0];
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
  const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8');
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
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');
  const route = server.slice(server.indexOf('if (p === "/api/ffmpeg/check"'), server.indexOf('if (p === "/api/ffmpeg/choose"'));
  a.match(route, /if \(DESKTOP\) \{ sendJSON\(res, 403,/, 'desktop: only the main process file dialog');
  a.match(server, /FF\.setPlaces\(\{ deny: \[MEDIA_DIR, LIBRARY_DIR, UPLOADS_DIR, ANALYSIS_DIR, PROXIES_DIR, FRAMES_DIR, EXPORTS_DIR/);
  // QQ (a): the routines those two routes call (check → X.checkTool, choose → X.saveTool), on the uploaded file, with
  // an injected run that counts: refused, and run 0 times
  a.match(route, /X\.checkTool\(file\)/);
  a.match(server.slice(server.indexOf('if (p === "/api/ffmpeg/choose"')), /^[\s\S]{0,600}X\.saveTool\(/);
  FF.setPlaces({ deny: [path.join(dir, 'media'), path.join(dir, '.uploads')] }); t.after(() => FF.setPlaces({}));
  let ran = 0; const run = async () => { ran++; return { code: 0, stdout: 'ffmpeg version 9\n V....D libx264  H.264' }; };
  a.equal((await X.checkTool(file, { run })).code, 'notFfmpeg', 'check');
  const saved = path.join(dir, 'chosen.json');
  a.equal((await X.saveTool(saved, file, { run })).ok, false, 'choose'); a.equal(fs.existsSync(saved), false);
  a.equal(ran, 0, 'the uploaded program was never started');
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
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');
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

/* QQ (b): which program each path starts. The local FFmpeg only for exports and proxies; signals, song-scan, asr (and
   frames) start the bundled build. */
test('analysis paths are wired to the bundled build; only exports and proxies reach the local FFmpeg', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server/server.js'), 'utf8');
  for (const mod of ['./asr-local', './signals', './song-scan'])
    a.match(server, new RegExp(`require\\("${mod.replace('.', '\\.')}"\\)[^\\n]*ffmpeg: \\(\\) => FF\\.path\\("ffmpeg"\\)`), mod);
  const px = server.slice(server.indexOf('const proxies = createProxies({'), server.indexOf('noEncoder:', server.indexOf('const proxies = createProxies({')));
  a.match(px, /ffmpeg: \(\) => FF\.path\("ffmpeg"\)/, 'proxy.js falls back to the bundled build'); a.match(px, /encoder: proxyEncoder/);
  const pe = server.slice(server.indexOf('async function proxyEncoder('), server.indexOf('const proxies = createProxies({'));
  a.match(pe, /runFfmpeg\(\["-hide_banner", "-encoders"\], 15000, ext\.path\)/, 'the local FFmpeg\'s own encoders');
  a.ok(!/encodersOf\(ext/.test(pe), 'no HEVC or other test encodes on it, only H.264 ones'); a.match(pe, /proxyTrial\(ext\.path, e\)/, 'and a 2-frame test on it');
  a.match(server.slice(server.indexOf('function proxyTrial(')), /^[\s\S]{0,700}"-frames:v", "2", \.\.\.PROXY_H264\[e\]/, 'with the proxy\'s own arguments');
});

test('server (POSIX): every program started is logged — signals, song-scan and frames start the bundled build; proxies and exports the local one', { timeout: 180000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('a shell script cannot stand in for ffmpeg.exe; the wiring is checked from the source above');
  const { makeDataDir, seedProject, startServer } = require('./helpers'), cp = require('node:child_process');
  if (!FF.available('ffmpeg') || !FF.available('ffprobe')) return t.skip('bundled ffmpeg not installed');
  let sys = null;
  for (const f of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    try { if (/libx264/.test(cp.execFileSync(f, ['-hide_banner', '-encoders'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))) { sys = f; break; } } catch { }
  }
  if (!sys) return t.skip('no FFmpeg with libx264 here');
  const w = tmp(t), log = path.join(w, 'spawn.log'), bundled = path.join(w, 'bundled', 'ffmpeg'), local = path.join(w, 'local', 'ffmpeg');
  const wrap = (file, tag, real) => { fs.mkdirSync(path.dirname(file)); fs.writeFileSync(file, `#!/bin/sh\nprintf '%s %s\\n' ${tag} "$*" >> '${log}'\nexec '${real}' "$@"\n`, { mode: 0o755 }); };
  wrap(bundled, 'BUNDLED', FF.path('ffmpeg')); wrap(local, 'LOCAL', sys);
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  cp.execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=d=3',
    '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', path.join(dir, 'media', 'a.mp4')]);
  const jpg = path.join(w, 'f.jpg');
  cp.execFileSync(FF.path('ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180', '-frames:v', '1', jpg]);
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_TEST_NO_H264: '1', MONTCLIP_FFMPEG: bundled, MONTCLIP_FFPROBE: FF.path('ffprobe'),
    PATH: path.dirname(local), Path: path.dirname(local), MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '' });
  const st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.state, 'ready'); a.equal(st.encoder, 'libx264');
  const lines = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '').split('\n').filter(Boolean);
  const since = (n) => lines().slice(n);
  const until = async (fn, what) => { for (let i = 0; i < 240; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); } throw new Error('timed out: ' + what); };
  // analysis: signals, songs, a frame
  let mark = lines().length;
  a.equal((await fetch(base + '/api/signals/loudness?src=/media/a.mp4')).status, 200);
  await fetch(base + '/api/songs', { method: 'POST', body: JSON.stringify({ src: '/media/a.mp4' }) });
  await until(async () => ['done', 'failed', 'stopped'].includes((await (await fetch(base + '/api/songs?src=/media/a.mp4')).json()).state), 'songs');
  a.equal((await fetch(base + '/api/frame?src=/media/a.mp4&t=1')).status, 200);
  const analysis = since(mark);
  a.ok(analysis.length >= 3, analysis.join('\n'));
  a.deepEqual(analysis.filter((l) => !l.startsWith('BUNDLED ')), [], 'signals, songs and frames start the bundled build only');
  // a proxy: the local FFmpeg, probed itself (its encoders, a 2-frame test), then the encode
  mark = lines().length;
  await fetch(base + '/api/proxy', { method: 'POST', body: JSON.stringify({ srcs: ['/media/a.mp4'], height: 540 }) });
  const ps = await until(async () => { const s = (await (await fetch(base + '/api/proxy/status', { method: 'POST', body: JSON.stringify({ srcs: ['/media/a.mp4'] }) })).json()).status['/media/a.mp4']; return s && ['ready', 'failed'].includes(s.state) && s; }, 'proxy');
  a.equal(ps.state, 'ready', JSON.stringify(ps));
  const proxy = since(mark).filter((l) => l.startsWith('LOCAL '));
  a.ok(proxy.some((l) => /-frames:v 2 .*-c:v libx264/.test(l)), 'the 2-frame test ran on the local FFmpeg\n' + proxy.join('\n'));
  a.ok(proxy.some((l) => /-c:v libx264/.test(l) && /proxies/.test(l)), 'the proxy was encoded by the local FFmpeg');
  a.ok(!since(mark).some((l) => l.startsWith('BUNDLED ') && /libx264/.test(l)));
  // an export: the local FFmpeg encodes it
  mark = lines().length;
  const begin = await (await fetch(base + '/api/export/begin', { method: 'POST', body: JSON.stringify({ fps: 30, duration: 0.5, canvasW: 320, canvasH: 180, hasAudio: false, deliveries: [{ delivery: { preset: 'web' }, name: 'e' }] }) })).json();
  a.ok(begin.id, JSON.stringify(begin));
  const frame = fs.readFileSync(jpg);
  for (let i = 0; i < 15; i++) a.equal((await fetch(`${base}/api/export/frame?id=${begin.id}`, { method: 'POST', body: frame })).status, 200);
  const end = await (await fetch(`${base}/api/export/end?id=${begin.id}`, { method: 'POST' })).json();
  a.ok(end.outputs && end.outputs[0].ok, JSON.stringify(end));
  a.ok(since(mark).some((l) => l.startsWith('LOCAL ') && /-c:v libx264/.test(l)), 'the export was encoded by the local FFmpeg');
  // everything the local FFmpeg was ever asked: its checks, the proxy, the export
  for (const l of lines().filter((x) => x.startsWith('LOCAL ')))
    a.ok(/-version|-encoders|-c:v (libx264|h264_\w+) /.test(l), 'the local FFmpeg ran only checks and H.264 encodes (its own 2-frame tests included): ' + l);
});

/* QQ (c): an FFmpeg below the gate is never the fallback for everything. The gate is what MontClip needs (the
   ebur128 options it measures with), not a version number; Debian 12's 5.1 fails it. */
test('no bundled build: an FFmpeg that fails the gate is not the fallback; one that passes is', (t) => {
  if (process.platform === 'win32') return t.skip('the stand-in programs are shell scripts');
  const w = tmp(t), old = path.join(w, 'old'), ok = path.join(w, 'new');
  const fake = (d, failGate) => {
    fs.mkdirSync(d); for (const n of ['ffmpeg', 'ffprobe'])
      fs.writeFileSync(path.join(d, n), `#!/bin/sh\ncase "$*" in *framelog*) ${failGate ? 'echo "Option framelog not found." >&2; exit 1' : 'exit 0'};; esac\necho "ffmpeg version ${failGate ? '5.1.9' : '9.0.2'}"\n`, { mode: 0o755 });
  };
  fake(old, true); fake(ok, false);
  const none = path.join(w, 'app');   // no vendor folder: no bundled build
  const resolve = (dir) => FF.resolveTool('ffmpeg', { env: { PATH: dir }, appDir: none, platform: process.platform, arch: 'x64', chosenFile: null });
  a.equal(FF.passesGate(path.join(old, 'ffmpeg')), false); a.equal(FF.passesGate(path.join(ok, 'ffmpeg')), true);
  const r = resolve(old); a.equal(r.ok, false); a.equal(r.tooOld, true, 'below the gate: not used, and the card says it is too old');
  const g = resolve(ok); a.equal(g.ok, true); a.equal(g.source, 'path'); a.equal(g.path, path.join(ok, 'ffmpeg'));
  // the real thing where it is installed: Debian 12's ffmpeg 5.1 (europa) fails the gate
  try {
    const v = require('node:child_process').execFileSync('/usr/bin/ffmpeg', ['-version'], { encoding: 'utf8' });
    if (/^ffmpeg version 5\.1/m.test(v)) a.equal(FF.passesGate('/usr/bin/ffmpeg'), false, 'Debian 12 ffmpeg 5.1');
  } catch { }
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
  const app = fs.readFileSync(path.join(__dirname, '..', 'app/app.js'), 'utf8');
  const body = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}', i)); };
  a.match(body('function applyFfmpegState('), /MontClipFfmpegCard\.exportButton\(st, mcView\.get\(\)\.mode, mcView\.get\(\)\.language\)/);
  a.match(body('function updateMontClipView('), /try \{ applyFfmpegState\(\); \}/);
  a.match(body('function populateExportProfileSelect('), /MontClipFfmpegCard\.exportOption\(/);
});

/* Deja 2026-11-05: the fallback (no bundled build) needs FFmpeg 6.0 or newer. On europa, Debian 12's 5.1.9 has no
   aspectralstats measure= (added in 6.0: song finding fails outright) and no ebur128 framelog=quiet. So: a version
   read from -version below 6.0 is never the fallback; a build whose number can't be read (a git build) or that is
   6.0+ must still run the options MontClip uses — the loudness measurement's and song-scan's own filter. The card
   says why (DRAFT for JJ). */
test('the fallback gate: FFmpeg 6.0 or newer, and the options MontClip runs (loudness, song finding)', () => {
  a.equal(FF.MIN_VERSION, '6.0');
  a.equal(FF.versionOf('ffmpeg version 5.1.9-0+deb12u1 Copyright (c) 2000-2025'), '5.1.9');
  a.equal(FF.versionOf('ffmpeg version n9.0.2-20251101 Copyright'), '9.0.2');
  a.equal(FF.versionOf('ffmpeg version 6.0 Copyright'), '6.0');
  a.equal(FF.versionOf('ffmpeg version N-118000-gabc123 Copyright'), null, 'a git build has no number');
  a.equal(FF.versionBelow('5.1.9', '6.0'), true); a.equal(FF.versionBelow('6.0', '6.0'), false); a.equal(FF.versionBelow('10.1', '6.0'), false);
  const filters = FF.GATE_CHECKS.map((args) => args[args.indexOf('-af') + 1]);
  a.ok(filters.includes('ebur128=peak=true:framelog=quiet'), 'the loudness measurement\'s options');
  a.ok(filters.includes(require('../server/song-scan').FILTER), 'song-scan\'s own filter, the very string it runs');
});

test('no bundled build (POSIX): below 6.0 is never the fallback even if it runs the options; 6.0+ or a git build must run them', (t) => {
  if (process.platform === 'win32') return t.skip('the stand-in programs are shell scripts');
  const w = tmp(t), none = path.join(w, 'app');
  const fake = (name, version, failOn) => {
    const d = path.join(w, name); fs.mkdirSync(d);
    for (const n of ['ffmpeg', 'ffprobe']) fs.writeFileSync(path.join(d, n),
      `#!/bin/sh\ncase "$*" in ${failOn ? `*${failOn}*) exit 1;; ` : ''}*-version*) echo "ffmpeg version ${version} Copyright"; exit 0;; esac\nexit 0\n`, { mode: 0o755 });
    return d;
  };
  const resolve = (dir) => FF.resolveTool('ffmpeg', { env: { PATH: dir }, appDir: none, platform: process.platform, arch: 'x64', chosenFile: null });
  const old = resolve(fake('old', '5.1.9-0+deb12u1', null));
  a.equal(old.ok, false); a.equal(old.tooOld, true); a.equal(old.version, '5.1.9'); a.equal(old.why, 'version', 'refused on its number alone');
  const noSongs = resolve(fake('nosongs', '9.0.2', 'measure=flatness'));
  a.equal(noSongs.ok, false); a.equal(noSongs.why, 'options'); a.equal(noSongs.version, '9.0.2');
  a.equal(resolve(fake('six', '6.0', null)).ok, true);
  const git = resolve(fake('git', 'N-118000-gabc123', null)); a.equal(git.ok, true, 'a git build that runs the options');
  a.equal(resolve(fake('gitold', 'N-100000-gdef456', 'framelog')).why, 'options');
  // the real one where it is installed: Debian 12's 5.1 (europa)
  try {
    const v = require('node:child_process').execFileSync('/usr/bin/ffmpeg', ['-version'], { encoding: 'utf8' });
    if (/^ffmpeg version 5\.1/m.test(v)) a.equal(FF.passesGate('/usr/bin/ffmpeg'), false, 'Debian 12 ffmpeg 5.1');
  } catch { }
});

test('server (POSIX): no bundled build and only FFmpeg 5.1 → tooOld, with the version for the card', async (t) => {
  if (process.platform === 'win32') return t.skip('the stand-in programs are shell scripts');
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const w = tmp(t), bin = path.join(w, 'bin'); fs.mkdirSync(bin);
  for (const n of ['ffmpeg', 'ffprobe']) fs.writeFileSync(path.join(bin, n), '#!/bin/sh\necho "ffmpeg version 5.1.9-0+deb12u1 Copyright"\n', { mode: 0o755 });
  const dir = makeDataDir(t, seedProject({ revision: 1 })), gone = path.join(w, 'gone');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_FFMPEG: path.join(gone, 'ffmpeg'), MONTCLIP_FFPROBE: path.join(gone, 'ffprobe'),
    PATH: bin, Path: bin, MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '' });
  const st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.state, 'tooOld'); a.equal(st.ffmpeg.version, '5.1.9'); a.equal(st.ffmpeg.why, 'version'); a.equal(st.ffmpeg.ok, false);
});

test('the too-old card says why: the version found and 6.0, or the missing options (DRAFT for JJ)', () => {
  for (const lang of ['zh-CN', 'en']) for (const platform of ['linux', 'win32']) {
    const v = Card.model({ state: 'tooOld', platform, ffmpeg: { version: '5.1.9', why: 'version' } }, lang);
    a.ok(v.body.includes('5.1.9') && v.body.includes('6.0'), `${lang} ${platform}: ${v.body}`);
    const o = Card.model({ state: 'tooOld', platform, ffmpeg: { version: '9.0.2', why: 'options' } }, lang);
    a.ok(o.body.includes(Card.text[lang].tooOldOptions), `${lang} ${platform}: ${o.body}`);
    const bare = Card.model({ state: 'tooOld', platform, ffmpeg: {} }, lang);
    a.ok(!/undefined|\{v\}|\{min\}/.test(bare.body + v.body + o.body));
  }
});

test('the card\'s 6.0 is ffmpeg-path.js\'s', () => {
  a.match(fs.readFileSync(path.join(__dirname, '..', 'app/ffmpeg-card.js'), 'utf8'), new RegExp(`const MIN_VERSION = "${FF.MIN_VERSION.replace('.', '\.')}"`));
});

/* P10 (Deja 2026-11-05): MONTCLIP_FFMPEG naming Debian's 5.1.9 as THE FFmpeg made song finding fail with ffmpeg's raw
   "Option 'measure' not found". A program named that way passes the same gate as a fallback; refused, it is
   FFMPEG_TOO_OLD with the version and no path, MontClip does not quietly use another one, and nothing starts it. */
test('MONTCLIP_FFMPEG naming an FFmpeg below 6.0 is refused as FFMPEG_TOO_OLD with its version, and nothing else is used instead', () => {
  const plat = process.platform, x = (n) => n + (plat === 'win32' ? '.exe' : '');
  const root = path.parse(process.cwd()).root, named = path.join(root, 'opt', 'old', x('ffmpeg')), onPath = path.join(root, 'usr', 'bin', x('ffmpeg'));
  const r = FF.resolveTool('ffmpeg', { env: { MONTCLIP_FFMPEG: named, PATH: path.dirname(onPath) }, appDir: path.join(root, 'app'), platform: plat, arch: 'x64',
    exists: (f) => f === named || f === onPath, chosenFile: null, usable: (f) => (f === named ? { ok: false, version: '5.1.9', why: 'version' } : { ok: true }) });
  a.equal(r.ok, false); a.equal(r.code, 'FFMPEG_TOO_OLD'); a.equal(r.version, '5.1.9'); a.equal(r.source, 'env'); a.equal(r.tooOld, true);
  a.ok(!r.error.includes(named) && !r.error.includes('old'), 'the reason names no path: ' + r.error);
  const fine = FF.resolveTool('ffmpeg', { env: { MONTCLIP_FFMPEG: named }, appDir: path.join(root, 'app'), platform: plat, arch: 'x64',
    exists: (f) => f === named, chosenFile: null, usable: () => ({ ok: true, version: '7.1' }) });
  a.equal(fine.ok, true); a.equal(fine.source, 'env');
  a.equal(FF.missingCode({ source: 'env', tooOld: true }), 'FFMPEG_TOO_OLD');
});

test('server (POSIX): MONTCLIP_FFMPEG = a 5.1.9 script → FFMPEG_TOO_OLD with the version, no path and no raw ffmpeg error, songs refused before anything runs', async (t) => {
  if (process.platform === 'win32') return t.skip('the stand-in program is a shell script');
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const w = tmp(t), bin = path.join(w, 'old-ffmpeg-bin'), log = path.join(w, 'ran.log'); fs.mkdirSync(bin);
  for (const n of ['ffmpeg', 'ffprobe']) fs.writeFileSync(path.join(bin, n),
    `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in *-version*) echo "ffmpeg version 5.1.9-0+deb12u1 Copyright"; exit 0;; *measure=*) echo "Option 'measure' not found" >&2; exit 1;; esac\nexit 0\n`, { mode: 0o755 });
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true }); fs.writeFileSync(path.join(dir, 'media', 'rec.mp4'), 'x');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_FFMPEG: path.join(bin, 'ffmpeg'), MONTCLIP_FFPROBE: path.join(bin, 'ffprobe'),
    PATH: bin, Path: bin, MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: '', MONTCLIP_EXTERNAL_FFMPEG: '' });
  const st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.state, 'tooOld'); a.equal(st.ffmpeg.code, 'FFMPEG_TOO_OLD'); a.equal(st.ffmpeg.version, '5.1.9');
  const ex = await (await fetch(base + '/api/export/ffmpeg')).json();
  a.equal(ex.available, false); a.equal(ex.code, 'FFMPEG_TOO_OLD'); a.equal(ex.version, '5.1.9');
  const before = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0;
  const r = await fetch(base + '/api/songs', { method: 'POST', body: JSON.stringify({ src: '/media/rec.mp4' }) });
  const j = await r.json();
  a.equal(r.status, 503); a.equal(j.code, 'FFMPEG_TOO_OLD'); a.equal(j.version, '5.1.9');
  for (const body of [JSON.stringify(st), JSON.stringify(ex), JSON.stringify(j)]) {
    a.ok(!body.includes(bin) && !body.includes('old-ffmpeg-bin'), 'no path: ' + body);
    a.ok(!/Option 'measure' not found/.test(body), 'no raw ffmpeg error: ' + body);
  }
  const after = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  a.ok(!after.slice(before).some((l) => /measure=/.test(l)), 'song finding never started the old program');
});
