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

test('saved: the dialog is set up, and the export copy is removed once the save completes', (t) => {
  const exportsDir = dir(t), other = path.join(exportsDir, 'older export.mp4');
  fs.writeFileSync(path.join(exportsDir, 'Untitled Project_master_720p.mp4'), 'video'); fs.writeFileSync(other, 'keep');
  const it = item(ORIGIN + '/exports/Untitled%20Project_master_720p.mp4', 'Untitled Project_master_720p.mp4');
  const removed = [];
  X.attach(it, { origin: ORIGIN, exportsDir, language: 'en', onRemoved: (f) => removed.push(path.basename(f)) });
  a.equal(it.options.title, 'Save the exported video');
  it.savePath = path.join(dir(t), 'mine.mp4');
  it.emit('done', {}, 'completed');
  a.deepEqual(fs.readdirSync(exportsDir), ['older export.mp4'], 'only this export file is removed');
  a.deepEqual(removed, ['Untitled Project_master_720p.mp4']);
});

test('cancelled: the copy is removed too; interrupted: it is kept', (t) => {
  const exportsDir = dir(t);
  for (const [state, kept] of [['cancelled', false], ['interrupted', true]]) {
    const f = path.join(exportsDir, state + '.mp4'); fs.writeFileSync(f, 'v');
    const it = item(ORIGIN + '/exports/' + state + '.mp4', state + '.mp4');
    X.attach(it, { origin: ORIGIN, exportsDir, language: 'zh-CN' });
    it.emit('done', {}, state);
    a.equal(fs.existsSync(f), kept, state);
  }
});

test('saving onto the copy itself, or a blob download, removes nothing', (t) => {
  const exportsDir = dir(t), f = path.join(exportsDir, 'a.mp4'); fs.writeFileSync(f, 'v');
  const it = item(ORIGIN + '/exports/a.mp4', 'a.mp4');
  X.attach(it, { origin: ORIGIN, exportsDir, language: 'zh-CN' });
  it.savePath = f; it.emit('done', {}, 'completed');
  a.ok(fs.existsSync(f), 'the user chose that very file');
  const blob = item('blob:' + ORIGIN + '/x', '录播.srt');
  X.attach(blob, { origin: ORIGIN, exportsDir, language: 'zh-CN' });
  a.equal(blob.options.title, '保存字幕');
  blob.emit('done', {}, 'completed');
  a.ok(fs.existsSync(f));
});

test('main.js uses it for the editor\'s own downloads, in the interface language', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.match(main, /require\("\.\/export-downloads"\)\.attach\(item, \{ origin, exportsDir: path\.join\(env\.FABLECUT_DATA_DIR, "exports"\), language: languageOf\(settings\.get\(\)\), downloadsDir: app\.getPath\("downloads"\) \}\);/);
});

test('the server lets go of a file when its download stops half way (pipeline, not .pipe)', () => {
  // With .pipe(res) a cancelled download left the read stream open, so on Windows the export could not be removed
  // (desktop/export-download-smoke.cjs: EPERM, the file stayed). pipeline() closes the file when the response closes.
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const serveFile = server.slice(server.indexOf('function serveFile('), server.indexOf('\n}\n', server.indexOf('function serveFile(')));
  a.doesNotMatch(serveFile, /createReadStream\([^)]*\)\.pipe\(res\)/);
  a.equal((serveFile.match(/pipeline\(fs\.createReadStream\(filePath(, \{ start, end \})?\), res, /g) || []).length, 2);
});

test('every download says how it ended (VV, 012ba18: a cancelled save still read "Exported … checks passed")', (t) => {
  const exportsDir = dir(t);
  for (const [url, name, state] of [[ORIGIN + '/exports/a.mp4', 'a.mp4', 'completed'], [ORIGIN + '/exports/b.mp4', 'b.mp4', 'cancelled'],
    [ORIGIN + '/exports/c.mp4', 'c.mp4', 'interrupted'], ['blob:' + ORIGIN + '/x', '录播.srt', 'cancelled']]) {
    const it = item(url, name), seen = [];
    X.attach(it, { origin: ORIGIN, exportsDir, language: 'zh-CN', onDone: (v) => seen.push(v) });
    it.savePath = path.join(exportsDir, 'elsewhere-' + name);
    it.emit('done', {}, state);
    a.deepEqual(seen, [{ state, name }], name);
  }
});
