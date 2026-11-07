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
function run(t, { state, expected = true, fresh = true, saveOnCopy = false, url, name = 'Untitled Project_master_720p.mp4', fileName } = {}) {
  const exportsDir = dir(t), copy = path.join(exportsDir, name), other = path.join(exportsDir, 'older export.mp4');
  fs.writeFileSync(copy, 'video'); fs.writeFileSync(other, 'keep');
  const it = item(url || ORIGIN + '/exports/' + encodeURIComponent(name), fileName || name), claimed = [];
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

test('completed expected export supplies its final save path privately to the main process', async t => {
  const exportsDir=dir(t), copy=path.join(exportsDir,'a.mp4'), saved=path.join(dir(t),'chosen.mp4');
  fs.writeFileSync(copy,'synthetic');fs.writeFileSync(saved,'synthetic');
  const it=item(ORIGIN+'/exports/a.mp4','a.mp4'),receipts=[];
  const done=new Promise(resolve=>X.attach(it,{origin:ORIGIN,exportsDir,expected:true,claim:async()=>true,
    onSaved:(from,to)=>receipts.push([from,to]),onDone:resolve}));
  it.savePath=saved;it.emit('done',{},'completed');const result=await done;
  a.deepEqual(receipts,[[copy,saved]]);a.ok(!fs.existsSync(copy));a.ok(fs.existsSync(saved));
  a.equal(JSON.stringify(result).includes(saved),false,'public result never carries a local path');
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

test('the file to remove (from the URL) and the name the page and the server know (the download file name) must be the same, or nothing is removed (QQ, 71cd650)', async (t) => {
  const r = await run(t, { state: 'completed', fileName: 'another name.mp4' });
  a.equal(r.kept, true); a.deepEqual(r.claimed, [], 'not even claimed');
  a.equal(r.v.removed, false);
  const ok = await run(t, { state: 'completed' });
  a.deepEqual(ok.claimed, [path.basename('Untitled Project_master_720p.mp4')], 'claimed by the name of the copy itself');
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
  a.match(main, /take: \(n\) => expectedExports\.delete\(n\)/, 'one expectation per export, used up by its download');
  a.match(main, /busy: exportDownloads,/, 'one download of an export at a time');
  a.match(main, /if \(!require\("\.\/export-downloads"\)\.attach\(item, \{/, 'a refused download is cancelled');
  a.match(main, /\}\)\) \{\n\s+event\.preventDefault\(\);/);
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

test('one download of an export at a time (VV, 71cd650): a second one of the same file while the first is open is refused; the copy goes only after the first is saved', async (t) => {
  const exportsDir = dir(t), name = 'big recording.mp4', copy = path.join(exportsDir, name);
  fs.writeFileSync(copy, 'video');
  const busy = new Set(), url = ORIGIN + '/exports/' + encodeURIComponent(name), outcomes = [];
  const first = item(url, name), second = item(url, name), third = item(url, name);
  const opts = { origin: ORIGIN, exportsDir, language: 'en', busy, take: () => true, claim: async () => true, onDone: (v) => outcomes.push(v) };
  a.equal(X.attach(first, opts), true, 'the first is taken');
  a.equal(X.attach(second, opts), false, 'a second of the same file while the first is open is refused');
  a.equal(second.options, null, 'nothing set up for the refused one');
  a.ok(fs.existsSync(copy));
  first.savePath = path.join(dir(t), 'saved.mp4');
  await new Promise((resolve) => { first.once('done', () => setTimeout(resolve, 50)); first.emit('done', {}, 'completed'); });
  a.equal(fs.existsSync(copy), false, 'removed once the only open download was saved');
  a.deepEqual(outcomes.map((o) => [o.state, o.removed]), [['completed', true]]);
  a.equal(busy.size, 0, 'free again');
  a.equal(X.attach(third, { ...opts, claim: async () => false }), true, 'another download may start after the first ended');
});

test('a cancelled or failed download frees the file for the next try', async (t) => {
  const exportsDir = dir(t), name = 'x.mp4'; fs.writeFileSync(path.join(exportsDir, name), 'v');
  const busy = new Set(), url = ORIGIN + '/exports/' + name;
  for (const state of ['cancelled', 'interrupted']) {
    const it = item(url, name);
    a.equal(X.attach(it, { origin: ORIGIN, exportsDir, language: 'en', busy, take: () => true }), true);
    it.emit('done', {}, state); await new Promise((r) => setTimeout(r, 20));
    a.equal(busy.size, 0, state);
  }
});

// VV (2333c24): saving over a file another program holds open left the download stuck — Chromium reports a resumable
// interruption through 'updated', never 'done' — so the page never heard anything and Save stayed grey.
test('every download ends exactly once: an interruption reported through updated ends it as interrupted (the copy stays)', async (t) => {
  const exportsDir = dir(t), name = 'locked.mp4', copy = path.join(exportsDir, name); fs.writeFileSync(copy, 'v');
  const it = item(ORIGIN + '/exports/' + name, name), outcomes = [], busy = new Set();
  let cancelled = 0; it.cancel = () => { cancelled++; it.emit('done', {}, 'cancelled'); };
  it.getState = () => 'interrupted';
  X.attach(it, { origin: ORIGIN, exportsDir, language: 'en', busy, take: () => true, claim: async () => true, onDone: (v) => outcomes.push(v) });
  it.savePath = path.join(dir(t), 'target.mp4');
  it.emit('updated', {}, 'interrupted');
  await new Promise((r) => setTimeout(r, 50));
  a.deepEqual(outcomes, [{ state: 'interrupted', name, removed: false }], 'one outcome, interrupted');
  a.equal(cancelled, 1, 'the stuck download is cancelled so nothing is left half written');
  a.equal(fs.existsSync(copy), true); a.equal(busy.size, 0, 'free for the next try');
});

test('a download that stops moving after its save path is set ends as interrupted (watchdog); one that keeps moving does not', async (t) => {
  const exportsDir = dir(t), name = 'stall.mp4'; fs.writeFileSync(path.join(exportsDir, name), 'v');
  const mk = () => { const it = item(ORIGIN + '/exports/' + name, name); it.cancel = () => it.emit('done', {}, 'cancelled'); it.getState = () => 'progressing'; return it; };
  // stalls: the save path is set, then nothing for longer than the limit
  const stall = mk(), out1 = [];
  X.attach(stall, { origin: ORIGIN, exportsDir, language: 'en', onDone: (v) => out1.push(v), stallMs: 120, checkMs: 20 });
  stall.savePath = path.join(dir(t), 'a.mp4');
  await new Promise((r) => setTimeout(r, 400));
  a.deepEqual(out1.map((o) => o.state), ['interrupted']);
  // keeps receiving: an update every 50 ms for 400 ms, then completes
  const busy = mk(), out2 = [];
  X.attach(busy, { origin: ORIGIN, exportsDir, language: 'en', onDone: (v) => out2.push(v), stallMs: 120, checkMs: 20 });
  busy.savePath = path.join(dir(t), 'b.mp4');
  for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); busy.emit('updated', {}, 'progressing'); }
  busy.emit('done', {}, 'completed'); await new Promise((r) => setTimeout(r, 50));
  a.deepEqual(out2.map((o) => o.state), ['completed'], 'progress keeps it alive');
  // while the save window is open (no save path yet) the watchdog does not run
  const open = mk(), out3 = [];
  X.attach(open, { origin: ORIGIN, exportsDir, language: 'en', onDone: (v) => out3.push(v), stallMs: 60, checkMs: 20 });
  await new Promise((r) => setTimeout(r, 250));
  a.deepEqual(out3, [], 'no save path yet: the user is still choosing');
  open.emit('done', {}, 'cancelled'); await new Promise((r) => setTimeout(r, 30));
  a.deepEqual(out3.map((o) => o.state), ['cancelled']);
});

test('main reports a refused download to the page (state refused), and the stall limit is generous', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'main.js'), 'utf8');
  a.match(main, /win\.webContents\.send\("montclip:download:done", \{ state: "refused", name: item\.getFilename\(\), removed: false \}\)/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'export-downloads.js'), 'utf8');
  a.match(src, /stallMs = 120000/, 'two minutes without any progress after the save path is set');
});
