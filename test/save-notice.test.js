'use strict';
// VV (package 012ba18): after Cancel in the Save dialog the toast still said the export succeeded. Deja / QQ (0a2c13b):
// a cancel keeps the export; JJ's final wording (2026-11-02): the export queue's buttons and states in the interface
// language — 导出队列 / Export queue (· n), 保存 / Save on each item (it opens the save window again), 已保存 / Saved
// once saved — and the toasts after a cancel say how to save again.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test("JJ's wording, zh and en, word for word", () => {
  const ui = read('ui-preferences.js');
  for (const line of [
    '"q-save": ["Save", "保存"]',
    '"q-list": ["Export queue", "导出队列"]',
    '"q-list-n": ["Export queue · {n}", "导出队列 · {n}"]',
    '"q-saved": ["Saved", "已保存"]',
    '"export-save-cancelled": ["Not saved. The exported video is still here: open the export queue and click Save on this item to save it again.", "没有保存。导出的视频还在，打开『导出队列』，在这一条后面点『保存』就能再存一次。"]',
    '"captions-save-cancelled": ["Captions not saved. Click export captions again to save them.", "字幕没有保存。可以再点一次导出字幕。"]',
    // JJ on 71cd650: a failed save of an export says it is still there; the general cancel and failure lines
    '"export-save-failed": ["The save did not finish. The exported video is still here: open the export queue and click Save on this item to try again. If it still fails, choose another location or check that it has enough space.", "没有保存成功。导出的视频还在，打开『导出队列』，在这一条后面点『保存』再试一次；还不行的话，换个位置保存，或者看看那里的空间够不够。"]',
    '"save-failed": ["The save did not finish. Try another location, or check that it has enough space.", "没有保存成功。请换个位置再试，或者看看那里的空间够不够。"]',
    '"save-canceled": ["Not saved. Click again if you need it.", "没有保存。需要的话再点一次。"]',
  ]) a.ok(ui.includes(line), line);
  a.doesNotMatch(ui, /"export-not-saved"|"queue-saved"/, 'the earlier drafts are gone');
});

test('main and preload: one fixed channel each way, plain values only', () => {
  const main = read('desktop/main.js'), preload = read('desktop/view-preload.js');
  a.match(main, /win\.webContents\.send\("montclip:download:done", \{ state: v\.state, name: v\.name, removed: v\.removed \}\)/);
  a.match(preload, /onDone:cb=>\{ipcRenderer\.on\('montclip:download:done',\(_e,v\)=>cb\(\{state:String\(v&&v\.state\),name:String\(v&&v\.name\),removed:v&&v\.removed===true\}\)\);\}/);
  a.match(preload, /expect:name=>ipcRenderer\.send\('montclip:downloads:expect',String\(name\)\)/);
});

test('the queue: its button, Save on each item and Saved come from the interface language; no English left in them', () => {
  const app = read('app.js'), html = read('index.html');
  a.doesNotMatch(app, /download>Open<\/a>/, 'no hard-coded Open');
  a.doesNotMatch(app, /`Queue · \$\{/, 'no hard-coded Queue · n');
  a.match(app, /btnOpen\.textContent = exportQueue\.length \? uiText\("own\.q-list-n", \{ n: pending \|\| exportQueue\.length \}\) : uiText\("own\.q-list"\);/);
  a.match(app, /<button type="button" class="btn tiny" data-q-save="\$\{q\.id\}">\$\{escapeHtml\(uiText\("own\.q-save"\)\)\}<\/button>/);
  a.match(app, /<span class="dlv-q-saved">\$\{escapeHtml\(uiText\("own\.q-saved"\)\)\}<\/span>/);
  a.match(html, /id="btnOpenQueue"[^>]*data-i18n="own\.q-list"/);
  a.match(app, /renderMontClipView\(\);\s*try \{ renderQueue\(\); \} catch \{ \/\* not built yet \*\/ \}/, 'a language switch relabels the queue');
});

test("the queue's Save saves this export again: it names itself, so only a completed save removes the copy", () => {
  const app = read('app.js');
  a.match(app, /if \(s\) \{ saveDownload\(q\.src, q\.file \|\| decodeURIComponent\(q\.src\.split\("\/"\)\.pop\(\)\), \{ exportFile: true \}\); return; \}/);
});

test('the page: success only once saved; a cancel says how to save again; captions say so too', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function saveDownload('), app.indexOf('\n}\n', app.indexOf('function saveDownload(')));
  a.match(fn, /if \(exportFile\) \{ window\.montclipDownloads\.expect\(name\); pendingExports\.add\(name\); \}/);
  a.match(fn, /if \(kind\) pendingKinds\.set\(name, kind\);/);
  a.match(fn, /else if \(savedMsg\) toast\(savedMsg\);/, 'the browser keeps its old order');
  a.match(app, /state === "cancelled"\) toast\(uiText\(wasExport \? "own\.export-save-cancelled" : kind === "captions" \? "own\.captions-save-cancelled" : "own\.save-canceled"\)\)/);
  a.match(app, /else toast\(uiText\(wasExport \? "own\.export-save-failed" : "own\.save-failed"\)\);/, 'a failed save: the export line for an export, the general one otherwise');
  a.match(app, /saveDownload\(url, name, \{ kind: "captions", savedMsg:/);
  a.equal((app.match(/exportFile: true/g) || []).length, 4, 'three export paths and the queue\'s Save');
  a.doesNotMatch(app, /toast\(o\.report && !o\.report\.ok \? `Exported/);
});

test("VV on 71cd650: the queue's Save is greyed while its save is open; a saved item shows only 已保存, no path", () => {
  const app = read('app.js');
  a.match(app, /if \(s\) \{ if \(q\.saving\) return; q\.saving = true; renderQueue\(\); saveDownload\(/, 'a second click does nothing while the first save is open');
  a.match(app, /for \(const q of exportQueue\) if \(q\.file === name\) \{ q\.saving = false; if \(removed\) q\.saved = true; \}/, 'the end of that save frees the button');
  a.match(app, /<button type="button" class="btn tiny" data-q-save="\$\{q\.id\}"\$\{q\.saving \? " disabled" : ""\}>/);
  a.match(app, /: q\.status === "done" \? \(q\.saved \? "" : `Done → exports\/\$\{q\.file \|\| q\.name \+ ext\}`\)/, 'no path for a saved item');
});
