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

test('H.264 from PATH only when the bundled build has no H.264 encoder: a graphics card or Windows encoder stays first', async (t) => {
  const d = tmp(t), sys = path.join(d, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'); fs.writeFileSync(sys, 'x');
  const x264 = async (f, args) => args.includes('-encoders') ? { code: 0, stdout: ' V....D libx264  H.264\n' } : { code: 0, stdout: 'ffmpeg version 5.1\n' };
  const ext = X.createExternal({ settingsFile: null, envPath: null, run: x264, setup: 'server', findOnPath: () => sys });
  a.deepEqual([...(await ext.available(new Set(['h264_mf', 'ffv1'])))].sort(), ['ffv1', 'h264_mf'], 'bundled has one: PATH not used');
  a.ok((await ext.available(new Set(['ffv1']))).has('libx264'), 'bundled has none: the PATH FFmpeg with libx264');
  a.equal((await ext.current({ allowPath: true })).source, 'path');
  // europa's Debian FFmpeg lists encoders MontClip never selects: they don't count as having H.264
  a.ok((await ext.available(new Set(['h264_omx', 'h264_v4l2m2m', 'ffv1']))).has('libx264'));
});

/* ── the card ── */
const quoted = (s) => [...s.matchAll(/[「『“]([^」』”]+)[」』”]/g)].map((m) => m[1]);
const PLATFORMS = ['linux', 'win32', 'darwin'], STATES = ['missing', 'noProbe', 'noH264'];

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
    const lines = [c.body, c.status || '', ...Object.values(Card.results(lang, platform))];
    for (const line of lines) for (const q of quoted(line)) {
      // a quote names a control when it is a whole label or a label's key part (「手动选择」 → 「我装在别处了，手动选择」)
      if (/[。.]$/.test(q)) continue;
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

test('the page builds the card from the model, gates only export and proxies, and re-detects without a reload', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  a.match(html, /<script src="ffmpeg-card\.js"><\/script>/); a.match(html, /id="ffmpegCard"/);
  const body = (head) => { const i = app.indexOf(head); a.ok(i >= 0, head); return app.slice(i, app.indexOf('\n}', i)); };
  const render = body('function renderFfmpegCard(');
  a.match(render, /MontClipFfmpegCard\.model\(/);
  const act = body('async function ffmpegCardAction(');
  a.match(act, /fetch\("\/api\/ffmpeg\/detect", \{ method: "POST" \}\)/); a.match(act, /fetch\("\/api\/ffmpeg\/choose"/);
  a.match(act, /window\.montclipExternalFfmpeg\?\.choose\(\)/, 'Windows desktop: the same file dialog as Settings');
  a.match(body('function applyFfmpegState('), /btnExport/);
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
