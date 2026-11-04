'use strict';
// The assistant pane's parts from makecindy/cindy@43001ea (Deja, 2026-11-04), in the real page: fresh profile, hidden
// offscreen window, nothing sent anywhere. Each part is rendered once into a test box with sample data
// (window.MontClipCindyParts.render) and must show its content without a page error:
//  - PermissionSelector: the four MontClip modes, under Cindy's selector (手动 by default; Yolo has the warning icon);
//    in English too;
//  - JumpToBottomChip, InlineReferenceChip, TodoListCard (the four states), ErrorMessageCard, ThinkingCard,
//    ToolCallCard, WorkGroupBlock (with MontClip's edit-step row inside), AskUserQuestionPrompt (its voice button hidden);
//  - every string a part asked for is there (no missing key), in zh-CN and in en.
// It does not show how the pane will look: the parts are not in the pane yet, and Cindy's styles come with the next change.
//   electron desktop/cindy-parts-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → CINDY_PARTS_PASS / CINDY_PARTS_FAIL
const electron = require('electron'), { app, BrowserWindow } = electron, assert = require('node:assert/strict');
if (!process.argv.includes('--montclip-smoke')) throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out = (k, v) => process.stdout.write(k + ' ' + JSON.stringify(v) + '\n');
const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  let ok = false; const report = {};
  try {
    await read(`(async()=>{const until=Date.now()+15000;while(!window.MontClipCindyParts&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!window.MontClipCindyParts)throw Error('NO_PARTS');
      window.__partErrors=[];addEventListener("error",e=>__partErrors.push(String(e.error&&e.error.stack||e.message)));addEventListener('unhandledrejection',e=>__partErrors.push(String(e.reason)));})()`);
    report.names = await read(`MontClipCindyParts.names`);
    assert.deepEqual(report.names, ['PermissionSelector', 'JumpToBottomChip', 'InlineReferenceChip', 'TodoListCard', 'ErrorMessageCard', 'WorkGroupBlock', 'ThinkingCard', 'ToolCallCard', 'AskUserQuestionPrompt']);
    assert.equal(await read(`MontClipCindyParts.commit`), '43001eaaa31ef322de9ae148c4051087277d6198');
    // one test box per part, in the page, out of the editor's way
    const show = async (name, props, language = 'zh-CN') => {
      await read(`(()=>{let box=document.getElementById('partBox_${name}');if(!box){box=document.createElement('div');box.id='partBox_${name}';box.style.cssText='position:relative;width:420px;min-height:40px';document.body.appendChild(box);}
        MontClipCindyParts.render(box,${JSON.stringify(name)},(${props})(),${JSON.stringify(language)});})()`);
      await wait();
      return read(`(()=>{const box=document.getElementById('partBox_${name}');return{text:box.innerText,html:box.innerHTML.length};})()`);
    };
    const sample = {
      PermissionSelector: `()=>({permissionMode:'ask',onPermissionModeChange:m=>{window.__mode=m;}})`,
      JumpToBottomChip: `()=>({visible:true,bottomOffset:8,onClick:()=>{window.__jumped=true;}})`,
      InlineReferenceChip: `()=>({label:'0:12–0:18 那句',tooltip:'引用的字幕'})`,
      TodoListCard: `()=>({todos:[{content:'找出每首歌',status:'completed'},{content:'定开头和结尾',status:'in_progress',activeForm:'正在定开头和结尾'},{content:'放到时间线上',status:'pending'}]})`,
      ErrorMessageCard: `()=>({message:'没发成：密钥不对'})`,
      ThinkingCard: `()=>({content:'看了项目和字幕',isStreaming:true,startedAt:Date.now()-88000,blockKey:'think-1'})`,
      ToolCallCard: `()=>({toolName:'fablecut_patch_project',toolInput:{ops:[]},summary:'改了第 2 段的结尾'})`,
      WorkGroupBlock: `()=>({blockId:'work:smoke',durationMs:58000,isStreaming:false,childItems:[{kind:'tools',key:'t1',resultMap:new Map([['u1','ok']]),settledIds:new Set(['u1']),
        toolCalls:[{clientId:'u1',toolUseId:'u1',role:'tool_use',content:'第 2 段结尾 1:18:42 → 1:18:44（往后 2 秒）',toolName:'fablecut_patch_project',toolInput:{explain:'改片段的开头和结尾'}}]}]})`,
      AskUserQuestionPrompt: `()=>({sessionId:'s1',pending:{requestId:'q1',questions:[{question:'这段要不要留？',header:'留不留',multiSelect:false,options:[{label:'留',description:'放到时间线上'},{label:'不留',description:'先不放'}]}]},onAnswer:(id,a)=>{window.__answer=[id,a];},
        viewerState:'expanded',onViewerStateChange:()=>{},draft:null,onDraftChange:()=>{}})`,
    };
    const shown = {};
    for (const name of report.names) shown[name] = await show(name, sample[name]);
    report.shown = Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.text.replace(/\s+/g, ' ').slice(0, 120)]));
    for (const name of report.names) { if (!(shown[name].html > 0)) report.pageErrors = await read('__partErrors'); assert.ok(shown[name].html > 0, name + ' rendered something'); }
    // the mode switch: Cindy's selector with MontClip's four modes
    assert.match(shown.PermissionSelector.text, /手动/);
    await read(`document.querySelector('#partBox_PermissionSelector button').click();true`); await wait(400);
    report.modes = await read(`[...document.querySelectorAll('[role=menuitemradio],[role=option],[role=menuitem]')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean)`);
    for (const label of ['计划', '手动', '自动', 'Yolo']) assert.ok(report.modes.some((t) => t.startsWith(label)), 'mode ' + label + ' in ' + JSON.stringify(report.modes));
    await read(`[...document.querySelectorAll('[role=menuitemradio],[role=option],[role=menuitem]')].find(e=>e.innerText.trim().startsWith('Yolo')).click();true`); await wait();
    report.picked = await read(`window.__mode`);
    assert.equal(report.picked, 'bypassPermissions');
    assert.equal(await read(`MontClipCindyParts.montclipModeOf(window.__mode)`), 'yolo');
    // the rest show their content
    assert.match(shown.InlineReferenceChip.text, /0:12–0:18 那句/);
    // the plan: folded into a pill (第 2 / 3 步); open, it lists the steps
    assert.match(shown.TodoListCard.text, /第 2 \/ 3 步/);
    await read(`document.querySelector('#partBox_TodoListCard button').click();true`); await wait(400);
    report.plan = await read(`document.body.innerText.includes('找出每首歌')&&document.body.innerText.includes('放到时间线上')`);
    assert.equal(report.plan, true, 'the plan lists its steps');
    // the error card: its title, and the message under 错误详情
    assert.match(shown.ErrorMessageCard.text, /回复未完成/);
    await read(`[...document.querySelectorAll('#partBox_ErrorMessageCard button')].find(b=>b.innerText.includes('错误详情'))?.click();true`); await wait(400);
    report.errorDetail = await read(`document.getElementById('partBox_ErrorMessageCard').innerText.replace(/\\s+/g,' ')`);
    assert.match(report.errorDetail, /密钥不对/);
    assert.match(shown.ToolCallCard.text, /patch_project|改了第 2 段的结尾/);
    assert.match(shown.AskUserQuestionPrompt.text, /这段要不要留/);
    report.voiceButton = await read(`(()=>{const b=document.querySelector('#partBox_AskUserQuestionPrompt [data-testid="ask-user-voice"]');return b?getComputedStyle(b).display:'absent';})()`);
    assert.ok(['none', 'absent'].includes(report.voiceButton), 'no voice button: ' + report.voiceButton);
    // WorkGroupBlock: open the folded steps; MontClip's edit-step row is inside
    await read(`document.querySelector('#partBox_WorkGroupBlock button')?.click();true`); await wait(400);
    report.step = await read(`(()=>{const r=document.querySelector('#partBox_WorkGroupBlock [data-montclip-edit-step]');return r?{change:r.querySelector('[data-edit-change]').textContent,tool:r.querySelector('[data-edit-tool]')?.textContent}:null;})()`);
    assert.deepEqual(report.step, { change: '第 2 段结尾 1:18:42 → 1:18:44（往后 2 秒）', tool: 'patch_project · 改片段的开头和结尾' });
    // English
    const en = await show('PermissionSelector', `()=>({permissionMode:'ask',onPermissionModeChange:()=>{}})`, 'en');
    assert.match(en.text, /Manual/);
    for (const name of report.names.filter((n) => n !== 'PermissionSelector')) shown[name + '_en'] = await show(name, sample[name], 'en');
    report.missingKeys = await read(`MontClipCindyParts.missingKeys()`);
    assert.deepEqual(report.missingKeys, [], 'every string a part asked for is there');
    report.pageErrors = await read(`__partErrors`);
    assert.deepEqual(report.pageErrors, []);
    report.consoleErrors = errors;
    assert.deepEqual(errors, []);
    ok = true;
  } catch (e) { report.error = String(e && e.stack || e).slice(0, 2000); report.consoleErrors = errors; }
  finally { out(ok ? 'CINDY_PARTS_PASS' : 'CINDY_PARTS_FAIL', report); process.exitCode = ok ? 0 : 1; app.exit(ok ? 0 : 1); }
  await new Promise(() => {});
};
{ const Module = require('node:module'), load = Module._load; Module._load = function (id, ...args) { if (id === 'electron') { Module._load = load; return { ...electron, BrowserWindow: class extends BrowserWindow { constructor(o) { super({ ...o, show: false, webPreferences: { ...o.webPreferences, offscreen: true, backgroundThrottling: false } }); } } }; } return load.call(this, id, ...args); }; }
require('./main');
