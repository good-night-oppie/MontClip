'use strict';
// VV (package 012ba18): after Cancel in the Save dialog the toast still said the export succeeded, and nothing was in
// the folder. In the desktop app the success message now waits for the save. Deja / QQ (0a2c13b): a cancel keeps the
// export, and the toast says where it still is; once a saved export's copy is removed, its row in the export queue
// says it was saved instead of offering an Open that no longer leads anywhere.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the wording (for JJ): zh and en; 「Open」 is the export list\'s real button name', () => {
  const ui = read('ui-preferences.js');
  a.ok(ui.includes('"save-canceled": ["Save canceled. No file was saved.", "已取消保存，没有保存文件。"]'));
  a.ok(ui.includes('"save-failed": ["The save did not finish. No file was saved.", "保存没有完成，没有保存文件。"]'));
  a.ok(ui.includes('"export-not-saved": ["Not saved. The exported video is still here; click Open in the export list to save it again.", "没有保存。导出的视频还在，可以在导出列表里点「Open」再存一次。"]'));
  a.ok(ui.includes('"queue-saved": ["Saved where you chose", "已保存到你选的位置"]'));
  a.match(read('app.js'), /download>Open<\/a>/, 'the queue button is still called Open');
});

test('main and preload: one fixed channel each way, plain values only', () => {
  const main = read('desktop/main.js'), preload = read('desktop/view-preload.js');
  a.match(main, /win\.webContents\.send\("montclip:download:done", \{ state: v\.state, name: v\.name, removed: v\.removed \}\)/);
  a.match(preload, /contextBridge\.exposeInMainWorld\('montclipDownloads',Object\.freeze\(\{/);
  a.match(preload, /onDone:cb=>\{ipcRenderer\.on\('montclip:download:done',\(_e,v\)=>cb\(\{state:String\(v&&v\.state\),name:String\(v&&v\.name\),removed:v&&v\.removed===true\}\)\);\}/);
  a.match(preload, /expect:name=>ipcRenderer\.send\('montclip:downloads:expect',String\(name\)\)/);
});

test('the page: the export names itself before its download; success only once saved; a cancel says the export is still there', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function saveDownload('), app.indexOf('\n}\n', app.indexOf('function saveDownload(')));
  a.match(fn, /if \(exportFile\) \{ window\.montclipDownloads\.expect\(name\); pendingExports\.add\(name\); \}/);
  a.match(fn, /else if \(savedMsg\) toast\(savedMsg\);/, 'the browser keeps its old order');
  a.match(app, /state === "cancelled"\) toast\(uiText\(wasExport \? "own\.export-not-saved" : "own\.save-canceled"\)\)/);
  a.match(app, /if \(removed\) for \(const q of exportQueue\) if \(q\.file === name\) q\.saved = true;/);
  a.match(app, /q\.saved \? `<span class="dlv-q-saved">\$\{escapeHtml\(uiText\("own\.queue-saved"\)\)\}<\/span>`/);
  // every export path asks; the queue's Open link does not go through saveDownload at all
  a.equal((app.match(/exportFile: true/g) || []).length, 3);
  a.doesNotMatch(app, /a\.download = decodeURIComponent\(end\.src/);
  a.doesNotMatch(app, /toast\(o\.report && !o\.report\.ok \? `Exported/);
});
