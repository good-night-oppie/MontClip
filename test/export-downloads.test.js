'use strict';
// VV (internal package fccc225): the Save dialog's title was the download URL (http://127.0.0.1:…/exports/… or
// blob:…), and every export left a hidden copy in workspace/exports that fills the disk. desktop/export-downloads.js
// gives the dialog a plain title in the interface language and a default file name, and once the user has saved the
// file — or cancelled — removes that one export file from workspace/exports. A failed save keeps it.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { EventEmitter } = require('node:events');
const X = require('../desktop/export-downloads.js');
const ORIGIN = 'http://127.0.0.1:43679';

function item(url, filename) {
  const e = new EventEmitter();
  return Object.assign(e, { getURL: () => url, getFilename: () => filename, options: null, savePath: '',
    setSaveDialogOptions(o) { this.options = o; }, getSavePath() { return this.savePath; } });
}
function dir(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-exp-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }

test('the Save dialog: a plain title by kind, in the interface language, and the file name', () => {
  const cases = [
    ['Untitled Project_master_720p.mp4', 'zh-CN', '保存导出的视频'], ['clip.mov', 'en', 'Save the exported video'],
    ['a.webm', 'zh-CN', '保存导出的视频'], ['a.mkv', 'en', 'Save the exported video'],
    ['录播.srt', 'zh-CN', '保存字幕'], ['x.vtt', 'en', 'Save captions'],
    ['MontClip.mapping.json', 'zh-CN', '保存导出的文件'], ['MontClip.mapping.json', 'en', 'Save the exported file'],
  ];
  for (const [name, lang, title] of cases) {
    const o = X.saveDialogOptions(name, lang);
    a.equal(o.title, title, name + ' ' + lang);
    a.equal(path.basename(o.defaultPath), name);
  }
  a.equal(X.saveDialogOptions('a.mp4', 'fr').title, '保存导出的视频', 'an unknown language reads as Chinese, the default');
});

test('the copy to remove: only a file directly in /exports/ of this origin', () => {
  const exportsDir = path.join(os.tmpdir(), 'exp');
  a.equal(X.exportCopy(ORIGIN + '/exports/Untitled%20Project_master_720p.mp4', { origin: ORIGIN, exportsDir }), path.join(exportsDir, 'Untitled Project_master_720p.mp4'));
  for (const url of ['blob:' + ORIGIN + '/123', ORIGIN + '/media/a.mp4', ORIGIN + '/exports/', ORIGIN + '/exports/a/b.mp4', ORIGIN + '/exports/..%2Fproject.json',
    ORIGIN + '/exports/%2e%2e', 'http://127.0.0.1:1/exports/a.mp4', 'https://example.com/exports/a.mp4', 'not a url'])
    a.equal(X.exportCopy(url, { origin: ORIGIN, exportsDir }), null, url);
});

// QQ (0a2c13b) and Deja: a copy is removed only when (1) it is this session's new export, registered by the server when
// /api/export/end made it, (2) the page's own export download asked for it, and (3) the Save dialog reports the save
// completed somewhere else. A cancel or a failed save keeps it (it may be the only copy of a 30-minute render); the
// export queue's Open, or any download of an older file in exports/, never removes anything.
function run(t, { state, expected = true, fresh = true, saveOnCopy = false, url, name = 'Untitled Project_master_720p.mp4' } = {}) {
  const exportsDir = dir(t), copy = path.join(exportsDir, name), other = path.join(exportsDir, 'older export.mp4');
  fs.writeFileSync(copy, 'video'); fs.writeFileSync(other, 'keep');
  const it = item(url || ORIGIN + '/exports/' + encodeURIComponent(name), name), claimed = [];
  return new Promise((resolve) => {
    X.attach(it, { origin: ORIGIN, exportsDir, language: 'en', expected, claim: async (n) => { claimed.push(n); return fresh; },
      onDone: (v) => resolve({ v, claimed, kept: fs.existsSync(copy), otherKept: fs.existsSync(other), options: it.options }) });
    it.savePath = saveOnCopy ? copy : path.join(dir(t), 'mine.mp4');
    it.emit('done', {}, state);
  });
}

test('saved: only this session\'s registered export is removed, once the save completes', async (t) => {
  const r = await run(t, { state: 'completed' });
  a.equal(r.options.title, 'Save the exported video');
  a.deepEqual(r.claimed, ['Untitled Project_master_720p.mp4'], 'asked the server whether it made this file');
  a.equal(r.kept, false); a.equal(r.otherKept, true, 'nothing else in exports/');
  a.deepEqual(r.v, { state: 'completed', name: 'Untitled Project_master_720p.mp4', removed: true });
});

test('cancelled or interrupted: the export is kept (it may be the only copy)', async (t) => {
  for (const state of ['cancelled', 'interrupted']) {
    const r = await run(t, { state });
    a.equal(r.kept, true, state); a.deepEqual(r.claimed, [], state + ': not even claimed');
    a.deepEqual(r.v, { state, name: 'Untitled Project_master_720p.mp4', removed: false });
  }
});

test('Open in the export queue, clicked again and again, removes nothing (the page did not ask for it)', async (t) => {
  for (let i = 0; i < 3; i++) {
    const r = await run(t, { state: 'completed', expected: false });
    a.equal(r.kept, true); a.deepEqual(r.claimed, []); a.equal(r.v.removed, false);
  }
});

test('an older file in exports/ (or an agent\'s export) is not this session\'s: the server says so, nothing is removed', async (t) => {
  const r = await run(t, { state: 'completed', fresh: false });
  a.deepEqual(r.claimed, ['Untitled Project_master_720p.mp4']);
  a.equal(r.kept, true); a.equal(r.v.removed, false);
});

test('saving onto the copy itself, or a blob download, removes nothing', async (t) => {
  const r = await run(t, { state: 'completed', saveOnCopy: true });
  a.equal(r.kept, true); a.deepEqual(r.claimed, []);
  const b = await run(t, { state: 'completed', url: 'blob:' + ORIGIN + '/x', name: '录播.srt' });
  a.equal(b.options.title, 'Save captions'); a.equal(b.kept, true); a.deepEqual(b.claimed, []);
});

test('main.js: the page names its export before the download, the server is asked, and the page hears the outcome', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.match(main, /require\("\.\/export-downloads"\)\.attach\(item, \{ origin, exportsDir: path\.join\(env\.FABLECUT_DATA_DIR, "exports"\), language: languageOf\(settings\.get\(\)\), downloadsDir: app\.getPath\("downloads"\),/);
  a.match(main, /expected: expectedExports\.delete\(item\.getFilename\(\)\)/, 'one expectation per export, used up by its download');
  a.match(main, /ipcMain\.on\("montclip:downloads:expect", \(event, name\) => \{ if \(settingsAllowed\(event, win, origin\) && /, 'only the editor page may ask');
  a.match(main, /fetch\(origin \+ "\/api\/export\/claim\?name=" \+ encodeURIComponent\(n\), \{ method: "POST", headers: \{ "X-MontClip-Session": token \} \}\)/);
  a.match(main, /win\.webContents\.send\("montclip:download:done", \{ state: v\.state, name: v\.name, removed: v\.removed \}\)/);
});

test('the server lets go of a file when its download stops half way (pipeline, not .pipe)', () => {
  // With .pipe(res) a cancelled download left the read stream open, so on Windows the export could not be removed
  // (desktop/export-download-smoke.cjs: EPERM, the file stayed). pipeline() closes the file when the response closes.
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const serveFile = server.slice(server.indexOf('function serveFile('), server.indexOf('\n}\n', server.indexOf('function serveFile(')));
  a.doesNotMatch(serveFile, /createReadStream\([^)]*\)\.pipe\(res\)/);
  a.equal((serveFile.match(/pipeline\(fs\.createReadStream\(filePath(, \{ start, end \})?\), res, /g) || []).length, 2);
});

test('every download says how it ended (VV, 012ba18: a cancelled save still read "Exported … checks passed")', async (t) => {
  for (const [state, url, name] of [['completed', null, 'a.mp4'], ['cancelled', null, 'b.mp4'], ['interrupted', null, 'c.mp4'], ['cancelled', 'blob:' + ORIGIN + '/x', '录播.srt']]) {
    const r = await run(t, { state, expected: false, url, name });
    a.deepEqual(r.v, { state, name, removed: false }, name);
  }
});
