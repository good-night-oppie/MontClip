'use strict';
// #366 part A — the streamer's path on a real Windows desktop: a fresh profile in a new temporary folder; the editor opens a
// synthetic hostile project (nothing here is a real project or a real streamer's file) whose values carry markup — a keyframe
// name (S6, drawn the moment the project loads), the text box (S1), a font (S2), colours written into attributes (S7), a
// composition's size and length (S5), a clip name — and draws every one as text: no element made from a project value, no
// script. The desktop window also has its own page policy; the element count is what shows the escaping itself.
// Run: electron desktop/injection-366-smoke.cjs --montclip-smoke --user-data-dir=<new empty folder>
// Prints INJECTION_PASS {…} or INJECTION_FAIL <why>.
const { app } = require('electron'), fs = require('node:fs');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile = profileArg.slice('--user-data-dir='.length);
if (fs.existsSync(profile) && fs.readdirSync(profile).length) throw Error('--user-data-dir must be a new, empty folder');
app.setPath('userData', profile);

const PWN = (n) => `"><img src=x data-pwn="${n}" onerror="window.__pwn=(window.__pwn||[]).concat('${n}')"><b data-pwn="${n}">`;
const hostile = {
  name: 'hostile ' + PWN('name'), revision: 1000, width: 1280, height: 720, fps: 30,
  media: [], tracks: [{ id: 'V2', kind: 'video' }, { id: 'V1', kind: 'video' }, { id: 'A1', kind: 'audio' }],
  clips: [
    { id: 't1', kind: 'text', mediaId: null, track: 'V1', start: 0, in: 0, duration: 6, name: 'title ' + PWN('clipname'),
      props: { text: 'hello ' + PWN('text'), font: 'Anton' + PWN('font'), color: '#ffffff' + PWN('color'), strokeColor: PWN('stroke'), bgColor: PWN('bg'), glowColor: PWN('glow'), highlightColor: PWN('hl') },
      keyframes: { ['opacity' + PWN('kfkey')]: [{ t: 1, v: 0.5 }, { t: 2, v: 1 }], x: [{ t: 1, v: 0 }, { t: 3, v: 100 }] } },
    { id: 'cc', kind: 'comp', compId: 'c1', mediaId: null, track: 'V2', start: 0, in: 0, duration: 4 },
  ],
  comps: [{ id: 'c1', name: 'comp ' + PWN('compname'), width: '640' + PWN('cw'), height: 360, duration: '4' + PWN('cd'), clips: [] }],
};

const { BrowserWindow } = require('electron');
const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const steps = []; let passed = false;
  const step = (s) => { steps.push(s); process.stdout.write('INJECTION_STEP ' + s + '\n'); };
  try {
    await read(`(async()=>{const until=Date.now()+20000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,50));return state.connected;})()`);
    win.setContentSize(1280, 800);
    win.webContents.setBackgroundThrottling(false);
    /* the hostile project replaces the open one, as an import or a hand-edited file would */
    const put = await read(`fetch('/api/project?force=1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(hostile))} }).then((r) => r.status)`);
    if (put !== 200) throw Error('PUT ' + put);
    await read(`(async()=>{const until=Date.now()+15000;while(!String(project.name||'').startsWith('hostile')&&Date.now()<until)await new Promise(r=>setTimeout(r,100));return true;})()`);
    await wait(800);
    const look = () => read(`({ el: document.querySelectorAll("[data-pwn]").length, ran: (window.__pwn || []).slice(), drawn: document.querySelectorAll(".track-head").length })`);
    const seen = {};
    seen.load = await look();
    await read(`setSelection(["t1"]); true`); await wait(600); seen.inspector = await look();
    await read(`setSideTab("mixer"); true`); await wait(600); seen.mixer = await look();
    await read(`setSideTab("inspector"); setSelection(["cc"]); true`); await wait(600); seen.comp = await look();
    const kfTitle = await read(`[...document.querySelectorAll(".clip-kf")].map((e) => e.title).join("|")`);
    if (!(seen.load.drawn > 0)) throw Error('NOT_DRAWN ' + JSON.stringify(seen.load));
    if (!/data-pwn="kfkey"/.test(kfTitle)) throw Error('S6_TITLE ' + kfTitle.slice(0, 200));
    step('打开一个合成的恶意工程：编辑器画出了 ' + seen.load.drawn + ' 条轨道；关键帧名（S6，一加载就画）作为文字出现在标记的提示里');
    for (const k of ['load', 'inspector', 'mixer', 'comp']) {
      if (seen[k].el !== 0 || seen[k].ran.length) throw Error('INJECTED ' + k + ' ' + JSON.stringify(seen[k]));
    }
    step('加载后、选中文字片段看检查器（S1、S2、S7）、打开调音台、选中合成片段（S5）：页面里由工程值生成的元素 0 个，执行的脚本 0 个');
    passed = true;
    process.stdout.write('INJECTION_PASS ' + JSON.stringify({ steps, seen }) + '\n');
  } catch (e) { process.stdout.write('INJECTION_FAIL ' + e.message + '\n'); }
  finally { process.exitCode = passed ? 0 : 1; setTimeout(() => app.exit(passed ? 0 : 1), 1500); }
};
require('./main');
