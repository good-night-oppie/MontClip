'use strict';
// VV (package 012ba18): after Cancel in the Save dialog the toast still said the export succeeded, and nothing was in
// the folder. In the desktop app the success message now waits for the save; a cancel says nothing was saved.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the wording (for JJ): zh and en', () => {
  global.window = undefined;
  const ui = read('ui-preferences.js');
  a.ok(ui.includes('"save-canceled": ["Save canceled. No file was saved.", "已取消保存，没有保存文件。"]'));
  a.ok(ui.includes('"save-failed": ["The save did not finish. No file was saved.", "保存没有完成，没有保存文件。"]'));
});

test('main tells the page how each download ended, on one fixed channel, with only the state and the name', () => {
  const main = read('desktop/main.js'), preload = read('desktop/view-preload.js');
  a.match(main, /onDone: \(v\) => \{ if \(win && !win\.isDestroyed\(\)\) win\.webContents\.send\("montclip:download:done", \{ state: v\.state, name: v\.name \}\); \}/);
  a.match(preload, /contextBridge\.exposeInMainWorld\('montclipDownloads',Object\.freeze\(\{onDone:cb=>\{ipcRenderer\.on\('montclip:download:done',\(_e,v\)=>cb\(\{state:String\(v&&v\.state\),name:String\(v&&v\.name\)\}\)\);\}\}\)\);/);
});

test('the page: success only once saved, a cancel says nothing was saved; the browser keeps its old order', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function saveDownload('), app.indexOf('\n}\n', app.indexOf('function saveDownload(')));
  a.match(fn, /if \(window\.montclipDownloads\) \{ if \(savedMsg\) pendingSaves\.set\(name, savedMsg\); \}/);
  a.match(fn, /else if \(savedMsg\) toast\(savedMsg\);/);
  a.match(app, /window\.montclipDownloads\?\.onDone\(/);
  a.match(app, /state === "cancelled"\) toast\(uiText\("own\.save-canceled"\)\)/);
  // no export, caption or mapping download clicks its own link any more, and no export toast comes before the save
  a.doesNotMatch(app, /a\.download = decodeURIComponent\(end\.src/);
  a.doesNotMatch(app, /toast\(o\.report && !o\.report\.ok \? `Exported/);
  a.equal((app.match(/saveDownload\(/g) || []).length >= 5, true);
});
