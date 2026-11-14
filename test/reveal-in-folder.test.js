'use strict';
/* 「在文件夹里显示」(WIP 2): the desktop shell shows an exported file or a media file in its folder
   (Explorer/Finder). The page passes only the same /exports/… or /media|/library/… name it already
   serves; the main process resolves it inside this session's data folder and calls
   shell.showItemInFolder. No absolute path ever crosses the bridge in either direction.
   Visible wording is a draft until JJ finalizes it (草稿，待 JJ 定稿). */
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the preload exposes only a show(src) string channel — no path comes back', () => {
  const pre = read('desktop/view-preload.js');
  a.match(pre, /contextBridge\.exposeInMainWorld\('montclipReveal',Object\.freeze\(\{show:src=>ipcRenderer\.invoke\('montclip:reveal',String\(src\)\)\}\)\)/);
  const block = pre.slice(pre.indexOf('montclipReveal'), pre.indexOf('montclipReveal') + 300);
  a.ok(!/sendSync|getPathForFile|showItemInFolder/.test(block), 'no sync call, no file path helper, no shell in the page');
});

test('main resolves only a name under exports/, media/ or library/ of this data dir, inside the root', () => {
  const main = read('desktop/main.js');
  a.match(main, /const \{ app, BrowserWindow, dialog, session, utilityProcess, ipcMain, safeStorage, Notification, shell \} = require\("electron"\);/);
  a.match(main, /p\.startsWith\("\/exports\/"\) \? \[path\.join\(env\.FABLECUT_DATA_DIR, "exports"\), p\.slice\(9\)\]/);
  a.match(main, /p\.startsWith\("\/media\/"\) \? \[path\.join\(env\.FABLECUT_DATA_DIR, "media"\), p\.slice\(7\)\]/);
  a.match(main, /p\.startsWith\("\/library\/"\) \? \[path\.join\(env\.FABLECUT_DATA_DIR, "library"\), p\.slice\(9\)\]/);
  a.match(main, /if \(!file\.startsWith\(path\.normalize\(root \+ path\.sep\)\)\) return null;/, 'a ".." name cannot leave the folder');
  a.match(main, /fs\.statSync\(realFile\)\.isFile\(\) \? realFile : null/, 'a missing file answers NOT_FOUND, not an Explorer error');
  a.match(main, /if \(!settingsAllowed\(event, win, origin\)\) return \{ ok: false, code: "REVEAL_FORBIDDEN" \};/, 'only the editor page may ask');
  a.match(main, /shell\.showItemInFolder\(file\);\s*\n\s*return \{ ok: true \};/);
});

test('a finished export in the queue gets 在文件夹里显示 (desktop only); the click reveals it', () => {
  const app = read('app/app.js');
  a.match(app, /q\.status === "done" && q\.src && window\.montclipReveal \? `<button type="button" class="btn tiny" data-q-reveal="\$\{q\.id\}">\$\{escapeHtml\(uiText\("own\.q-reveal"\)\)\}<\/button>` : "",/, 'no dead button in a plain browser');
  a.match(app, /rv = e\.target\.dataset\.qReveal;/);
  a.match(app, /if \(rv\) \{ revealFileBySrc\(q\.src\); return; \}/, 'reveal does not disturb the save flow');
  a.match(app, /async function revealFileBySrc\(src\) \{\s*\n\s*if \(!window\.montclipReveal/, 'a browser without the shell bridge quietly keeps its old behaviour');
  a.match(app, /if \(!r \|\| r\.ok !== true\) toast\(uiText\(r && r\.code === "REVEAL_NOT_FOUND" \? "own\.reveal-not-found" : "own\.reveal-failed"\)\);/, 'a vanished file is said in plain words');
});

test('the media right-click menu shows 在文件夹里显示, disabled (with the reason) when the file is offline', () => {
  const app = read('app/app.js');
  a.match(app, /item\(uiText\("own\.reveal-in-folder"\), \(\) => revealFileBySrc\(m\.src\), isMediaOffline\(m\.id\) \? uiText\("own\.reveal-offline"\)/, 'an offline file cannot be shown');
  a.match(app, /\|\| !window\.montclipReveal \? uiText\("own\.needs-desktop"\) : null\)\);/, 'outside the desktop app it is disabled');
});

test('the visible words are bilingual drafts in the own-wording table (草稿，待 JJ 定稿)', () => {
  const prefs = read('shared/ui-preferences.js');
  for (const [key, en, zh] of [
    ['q-reveal', 'Show in folder', '在文件夹里显示'],
    ['reveal-in-folder', 'Show in folder', '在文件夹里显示'],
    ['reveal-offline', 'The file is offline', '文件不在，先重新链接'],
    ['reveal-not-found', "The file isn't there any more", '文件已经不在了'],
    ['reveal-failed', "Couldn't open the folder", '没能打开文件夹'],
    ['needs-desktop', 'Only in the desktop app', '只在桌面版里能用'],
  ]) a.ok(prefs.includes(`"${key}": ["${en}", "${zh}"]`), key);
});
