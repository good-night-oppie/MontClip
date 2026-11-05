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
  const r = (name, have) => FF.resolveTool(name, { env: { PATH: bin }, appDir: app, platform: plat, arch: 'x64', exists: (f) => have.includes(f), chosenFile: settings, readChoice: read });
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
  fs.writeFileSync(ok, 'x'); fs.writeFileSync(other, 'x');
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

// ADR 2026-11-05 (Deja, JJ): several usable ones → the one that can export H.264. Bundled LGPL + a full system FFmpeg
// → the system one. Otherwise the first that runs, in order.
test('several FFmpegs: the first that can export H.264 wins; else the first that runs', async () => {
  const c = (source, p) => ({ ok: true, source, path: p });
  const list = [c('vendor', '/app/vendor/ffmpeg'), c('path', '/usr/bin/ffmpeg'), c('chosen', '/opt/ff/ffmpeg')];
  const has = (set) => async (p) => set.includes(p);
  a.deepEqual(await FF.pick(list, has(['/usr/bin/ffmpeg'])), { ...list[1], h264: true }, 'LGPL bundled + full system → system');
  a.deepEqual(await FF.pick(list, has(['/app/vendor/ffmpeg', '/usr/bin/ffmpeg'])), { ...list[0], h264: true }, 'bundled can → bundled (Windows h264_mf, a graphics card)');
  a.deepEqual(await FF.pick(list, has(['/opt/ff/ffmpeg'])), { ...list[2], h264: true });
  a.deepEqual(await FF.pick(list, has([])), { ...list[0], h264: false }, 'none can → the first, so preview still works');
  a.equal(await FF.pick([], has([])), null);
  let asked = 0; await FF.pick(list, async (p) => { asked++; return p === '/app/vendor/ffmpeg'; });
  a.equal(asked, 1, 'stops at the first that can');
  // every candidate that exists, in order, once
  const root = path.parse(process.cwd()).root, x = (n) => n + (process.platform === 'win32' ? '.exe' : '');
  const v = path.join(root, 'app', 'vendor', 'ffmpeg', `${process.platform}-x64`, x('ffmpeg')), bin = path.join(root, 'usr', 'bin');
  const settings = path.join(root, 'data', 'external-ffmpeg.json');
  const got = FF.candidates('ffmpeg', { env: { PATH: bin }, appDir: path.join(root, 'app'), platform: process.platform, arch: 'x64',
    exists: (f) => [v, path.join(bin, x('ffmpeg')), path.join(root, 'opt', x('ffmpeg'))].includes(f), chosenFile: settings, readChoice: () => ({ path: path.join(root, 'opt', x('ffmpeg')) }) });
  a.deepEqual(got.map((g) => g.source), ['vendor', 'path', 'chosen']);
});

/* ── the card ── */
const quoted = (s) => [...s.matchAll(/[「『“]([^」』”]+)[」』”]/g)].map((m) => m[1]);
const PLATFORMS = ['linux', 'win32', 'darwin'], STATES = ['missing', 'noProbe', 'noH264'];

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
  a.match(gate, /btnExport/); a.match(gate, /st\.state !== "ready"/, 'no exportable FFmpeg (noH264 too) turns export off (ADR 3)');
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

// ADR 2026-11-05 acceptance: "LGPL 版和完整版都在时，选完整版". On europa that is the bundled LGPL build (no H.264) and
// /usr/bin/ffmpeg (libx264) → the system one; on a Windows machine with h264_mf / a graphics card → the bundled one.
test('server: of the FFmpegs on this machine it uses the first that can export H.264', async (t) => {
  const { makeDataDir, seedProject, startServer } = require('./helpers');
  const dir = makeDataDir(t, seedProject({ revision: 1 }));
  const settings = path.join(dir, 'external-ffmpeg.json');
  const list = FF.candidates('ffmpeg', { chosenFile: settings });
  if (!list.length) return t.skip('no ffmpeg on this machine');
  const { base } = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1', MONTCLIP_EXTERNAL_FFMPEG_SETTINGS: settings });
  const can = [];
  for (const c of list) can.push((await (await fetch(base + '/api/ffmpeg/check', { method: 'POST', body: JSON.stringify({ path: c.path }) })).json()).h264);
  const want = list[can.indexOf(true)] || list[0];
  const st = await (await fetch(base + '/api/ffmpeg')).json();
  a.equal(st.ffmpeg.source, want.source, `candidates ${list.map((c, i) => c.source + (can[i] ? '+h264' : '')).join(', ')}`);
  a.equal(st.state === 'ready', can.includes(true));
});

/* JJ, final (2026-11-05, via Deja): the English 「还不能导出 MP4」 card, the Windows card, the path box, the greyed
   Export tooltips and the macOS card — word for word. Buttons are named 〔…〕 and the name must be the button's own. */
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
  a.ok(!/DRAFT/.test(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'ffmpeg-card.js'), 'utf8').split('const text')[1].split('en: {')[0]),
    'no DRAFT mark left in the zh-CN text');
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
