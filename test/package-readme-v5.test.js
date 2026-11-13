'use strict';
// JJ's notes v5, kept in v6 (Deja, 2026-11-02): under 导出视频要注意 / the export notes, one more line on deleting the hidden copies in
// %APPDATA%\MontClip\workspace\exports. The path must reach the tester exactly as written, backslashes and all, and
// it must be where the packaged app really keeps them; deleting them (with MontClip closed) must not break anything.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { render, read } = require('../desktop/package-readme/render.js');
const { makeDataDir, startServer, rawGet } = require('./helpers');
const ROOT = path.join(__dirname, '..');
const PATH = '%APPDATA%\\MontClip\\workspace\\exports';   // one backslash between each part

test('both notes name the folder exactly: %APPDATA%\\MontClip\\workspace\\exports', () => {
  a.equal(PATH.length, 36);   // %APPDATA% 9 + MontClip 9 + workspace 10 + exports 8
  for (const lang of ['zh-CN', 'en']) {
    const raw = read(lang);
    a.ok(raw.includes(PATH), lang + ' notes name the folder');
    a.ok(!raw.includes('\\\\'), 'no doubled backslash');
    a.doesNotMatch(raw, /%APPDATA%\/MontClip/, 'no forward slashes');
    // and as they go into the zip (BOM, CRLF, placeholders filled; with or without the URL line swap)
    for (const urlHidden of [false, true]) a.ok(render(raw, { lang, buildId: '20261103-abc1234', urlHidden }).text.includes(PATH), lang + ' rendered');
  }
});

test('that is where the packaged app keeps its exports', () => {
  const main = fs.readFileSync(path.join(ROOT, 'desktop', 'main.js'), 'utf8');
  // userData is %APPDATA%\<app name>: the app is named MontClip before anything asks for userData
  a.match(main, /^app\.setName\("MontClip"\);/m);
  a.ok(main.indexOf('app.setName("MontClip")') < main.indexOf('app.getPath("userData")'));
  a.match(fs.readFileSync(path.join(ROOT, 'desktop', 'package-win.cjs'), 'utf8'), /productName: 'MontClip'/);
  // the server's data folder is userData\workspace, and its exports are DATA_DIR\exports
  a.match(main, /FABLECUT_DATA_DIR: path\.join\(app\.getPath\("userData"\), "workspace"\)/);
  a.match(fs.readFileSync(path.join(ROOT, 'server/paths.js'), 'utf8'), /const EXPORTS_DIR = path\.join\(DATA_DIR, "exports"\);/);
});

test('nothing refers to a file in exports: media and analysis only read /media/ and /library/', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server/server.js'), 'utf8');
  const resolve = server.slice(server.indexOf('function resolveSrc('), server.indexOf('\n}\n', server.indexOf('function resolveSrc(')));
  a.match(resolve, /"\/media\/"/); a.match(resolve, /"\/library\/"/); a.doesNotMatch(resolve, /exports/);
  // the export queue is the tab's own, not saved
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  a.doesNotMatch(app, /localStorage\.setItem\([^)]*[Qq]ueue/);
});

test('with MontClip closed, deleting the exports folder\'s files (or the folder) breaks nothing on the next start', async (t) => {
  // a workspace as MontClip leaves it: a project, and earlier exports (with a leftover temp folder of an export)
  const dir = makeDataDir(t), exportsDir = path.join(dir, 'exports');
  fs.mkdirSync(path.join(exportsDir, 'fablecut-abc123'), { recursive: true });
  fs.writeFileSync(path.join(exportsDir, 'Untitled Project_master_720p.mp4'), 'video');
  fs.writeFileSync(path.join(exportsDir, 'Untitled Project.srt'), '1');
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  // the tester deletes what is in exports — and even the folder — then starts MontClip again
  fs.rmSync(exportsDir, { recursive: true, force: true });
  const again = await startServer(t, dir, { FABLECUT_NO_FS_WATCH: '1' });
  const r = await rawGet(again.port, '/api/project');
  a.equal(r.status, 200);
  const after = JSON.parse(r.body);
  a.deepEqual({ clips: after.clips, media: after.media }, { clips: before.clips, media: before.media }, 'the project is as it was');
  a.ok(fs.statSync(exportsDir).isDirectory(), 'the folder is made again on start');
  a.equal((await rawGet(again.port, '/exports/' + encodeURIComponent('Untitled Project_master_720p.mp4'))).status, 404, 'the old copy is simply gone');
});
