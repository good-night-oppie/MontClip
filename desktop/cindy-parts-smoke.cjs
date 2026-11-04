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
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!require('node:path').isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
// MONTCLIP_SHOTS_OUT=<absolute folder> saves the hidden offscreen window's own page as PNGs (capturePage of this window only)
const shotOf=(win)=>async(name)=>{if(!shotsDir)return;await new Promise(r=>setTimeout(r,200));require('node:fs').writeFileSync(require('node:path').join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
const original = BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL = async function (...args) {
  await original.apply(this, args);
  const win = this, read = (s) => win.webContents.executeJavaScript(s), wait = (ms = 200) => new Promise((r) => setTimeout(r, ms)), shot = shotOf(win);
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
      await read(`(()=>{let box=document.getElementById('partBox_${name}');if(!box){let g=document.getElementById('partGallery');if(!g){g=document.createElement('div');g.id='partGallery';g.style.cssText='position:fixed;inset:0;z-index:45;background:var(--bg,#0e0e10);display:flex;flex-wrap:wrap;align-content:flex-start;gap:12px;padding:12px;overflow:auto';document.body.appendChild(g);}box=document.createElement('div');box.id='partBox_${name}';box.style.cssText='position:relative;width:400px;min-height:40px'+('${name}'==='PermissionSelector'?';margin-top:360px':'');g.appendChild(box);}
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
    await shot('cindy-parts-zh');
    // the mode switch: Cindy's selector with MontClip's four modes
    assert.match(shown.PermissionSelector.text, /手动/);
    await read(`document.querySelector('#partBox_PermissionSelector button').click();true`); await wait(400);
    report.modes = await read(`[...document.querySelectorAll('[role=menuitemradio],[role=option],[role=menuitem]')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean)`);
    for (const label of ['计划', '手动', '自动', 'Yolo']) assert.ok(report.modes.some((t) => t.startsWith(label)), 'mode ' + label + ' in ' + JSON.stringify(report.modes));
    await shot('cindy-parts-modes-menu');
    await read(`[...document.querySelectorAll('[role=menuitemradio],[role=option],[role=menuitem]')].find(e=>e.innerText.trim().startsWith('Yolo')).click();true`); await wait();
    report.picked = await read(`window.__mode`);
    assert.equal(report.picked, 'bypassPermissions');
    assert.equal(await read(`MontClipCindyParts.montclipModeOf(window.__mode)`), 'yolo');
    // Cindy's styles (cindy-parts.css, the second change): inside the parts Cindy's look with MontClip's colours; MontClip's
    // own page as it was (its --accent and --border, its buttons)
    await show('PermissionSelector', `()=>({permissionMode:'bypassPermissions',onPermissionModeChange:()=>{}})`);
    report.styles = await read(`(()=>{const root=getComputedStyle(document.documentElement),cs=(e)=>e&&getComputedStyle(e);
      const trigger=document.querySelector('#partBox_PermissionSelector button'),q=document.querySelector('#partBox_AskUserQuestionPrompt button'),
        own=document.getElementById('mcUndo'),exp=document.getElementById('btnExport'),part=cs(document.getElementById('partBox_PermissionSelector'));
      return{accent:root.getPropertyValue('--accent').trim(),border:root.getPropertyValue('--border').trim(),cindyBorder:part.getPropertyValue('--cindy-border').trim(),
        focusRing:part.getPropertyValue('--focus-ring').trim(),textPrimary:part.getPropertyValue('--text-primary').trim(),
        onRoot:['--muted','--text-primary','--focus-ring','--cindy-border','--tw-ring-offset-width'].filter(n=>root.getPropertyValue(n).trim()),
        yolo:cs(trigger.querySelector('span')||trigger).color,partButtonBg:cs(q).backgroundColor,partButtonBorder:cs(q).borderTopStyle,
        ownButton:{bg:cs(own).backgroundColor,border:cs(own).borderTopWidth,radius:cs(own).borderTopLeftRadius},exportBg:cs(exp).backgroundImage};})()`);
    assert.equal(report.styles.accent, '#7b6cff', "MontClip's --accent is its own");
    assert.equal(report.styles.border, '#2c2c35', "MontClip's --border is its own");
    assert.ok(report.styles.cindyBorder && report.styles.textPrimary, "Cindy's theme is there, in a part");
    assert.deepEqual(report.styles.onRoot, [], "no Cindy variable on the page's root (VV on f3df7db: --muted)");
    assert.equal(report.styles.focusRing, '#7b6cff', "the focus ring is MontClip's accent");
    assert.equal(report.styles.yolo, 'rgb(229, 72, 77)', "Yolo in MontClip's red");
    assert.equal(report.styles.partButtonBg, 'rgba(0, 0, 0, 0)', "a part's button has no browser face (preflight, inside the parts)");
    // MontClip's own page with cindy-parts.css on and off: the same (a few of its controls, measured both ways)
    report.ownPage = await read(`(()=>{const link=document.querySelector('link[href="cindy-parts.css"]'),ids=['mcUndo','btnExport','btnPlay','projectName','sideTabs'];
      const props=['backgroundColor','backgroundImage','color','borderTopWidth','borderTopStyle','borderTopLeftRadius','paddingTop','paddingLeft','fontSize','fontFamily','lineHeight','boxSizing','width','height'];
      const take=()=>ids.map(id=>{const s=getComputedStyle(document.getElementById(id));return id+' '+props.map(p=>s[p]).join('|');});
      const on=take();link.disabled=true;const off=take();link.disabled=false;return{on,off};})()`);
    assert.deepEqual(report.ownPage.on, report.ownPage.off, "MontClip's own controls look the same with Cindy's styles loaded");
    // VV's grey texts (var(--muted, #9a9aaa)) and MontClip classes Cindy has too, on elements of MontClip's: the same on and off
    report.ownProbes = await read(`(()=>{const link=document.querySelector('link[href="cindy-parts.css"]'),host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:300px';
      host.innerHTML='<ul class="xq-list"><li><div class="xq-sub">a</div></li></ul><div class="dlv-wh-in"><span>b</span></div><div class="cindy-plan-what">c</div><div class="dlv-batch-list"><div class="bo-empty">d</div></div><div class="grid">e</div><div class="block">f</div><div class="fixed">g</div><div class="sr-only">h</div><div class="filter">i</div>';
      document.body.appendChild(host);const els=[...host.querySelectorAll('div,span')].filter(e=>!e.children.length);
      const take=()=>els.map(e=>[e.className||e.parentNode.className+' span',getComputedStyle(e).color,getComputedStyle(e).display,getComputedStyle(e).position,getComputedStyle(e).width].join('|'));
      const on=take();link.disabled=true;const off=take();link.disabled=false;host.remove();return{on,off};})()`);
    assert.deepEqual(report.ownProbes.on, report.ownProbes.off, "MontClip's grey texts and same-named classes are not touched by Cindy's file");
    for (const c of ['xq-sub', 'dlv-wh-in span', 'cindy-plan-what', 'bo-empty']) assert.ok(report.ownProbes.on.find((l) => l.startsWith(c + '|')).includes(c === 'cindy-plan-what' ? 'rgb(154, 160, 170)' : 'rgb(154, 154, 170)'), c + ' keeps its grey (as on main, VV): ' + report.ownProbes.on.find((l) => l.startsWith(c + '|')));
    assert.match(report.styles.exportBg, /linear-gradient/, "MontClip's main button keeps its gradient");
    await show('PermissionSelector', `()=>({permissionMode:'ask',onPermissionModeChange:m=>{window.__mode=m;}})`);
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
    // thinking and work times in Chinese words (v7.2 「正在想… N 秒」; VV on f3df7db: it said Thinking, 1m 29s, 58s)
    assert.match(shown.ThinkingCard.text, /^正在想\s*1 分 2\d 秒/);
    assert.doesNotMatch(shown.ThinkingCard.text, /Thinking|\d+[ms]\b/);
    report.dots = await read(`[...document.querySelectorAll('#partBox_ThinkingCard .thinking-dot')].map(e=>{const c=getComputedStyle(e);return c.width+' '+c.animationName;})`);
    assert.deepEqual(report.dots, ['4px thinking-dot-wave', '4px thinking-dot-wave', '4px thinking-dot-wave'], 'the three dots of 正在想…');
    assert.match(shown.WorkGroupBlock.text, /用了 58 秒/);
    report.thoughtDone = (await show('ThinkingCard', `()=>({content:'看了项目和字幕',isStreaming:false,durationMs:58000,blockKey:'think-2'})`)).text.replace(/\s+/g, ' ');
    assert.match(report.thoughtDone, /想了 58 秒/, 'the finished thinking card (JJ)');
    report.thoughtStopped = (await show('ThinkingCard', `()=>({content:'看了项目',isStreaming:false,aborted:true,durationMs:12000,blockKey:'think-3'})`)).text.replace(/\s+/g, ' ');
    assert.match(report.thoughtStopped, /想了 12 秒，停下了/, 'the stopped thinking card (JJ)');
    assert.doesNotMatch(shown.WorkGroupBlock.text, /\d+s\b/);
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
    report.shownEn = { ThinkingCard: shown.ThinkingCard_en.text.replace(/\s+/g, ' '), WorkGroupBlock: shown.WorkGroupBlock_en.text.replace(/\s+/g, ' ').slice(0, 60) };
    assert.match(report.shownEn.ThinkingCard, /^Thinking\s*1m 2\ds/, "English as in Cindy");
    assert.match(report.shownEn.WorkGroupBlock, /Took 58s/);
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
