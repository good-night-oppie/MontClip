'use strict';
// 打码 in the desktop editor (#163, VV's interaction review 2026-11-05). Fresh profile, hidden offscreen window, a
// synthetic picture only. Real mouse input (CDP) for the menu, the boxes on the monitor and the buttons. Checks:
//  - right-click a clip: 〔给这块打码〕 is its own group right after 停用 / 锁定 (separators on both sides);
//  - dragging a box adds 第 1 块: the timeline clip says 打码·1, the Inspector title 打码区域（1）, and the section has
//    been scrolled into view; a second box makes it 第 1 块 / 第 2 块, 打码·2, 打码区域（2）;
//  - 第 N 块 picks it (the monitor draws its box highlighted);
//  - 〔重新框选〕 then a new box replaces that area: same number of areas, its style and strength kept, the other one
//    untouched; one Ctrl+Z puts the old area back (style and strength still the same);
//  - 〔重新框选〕 then Esc: nothing changes, and the tool is off.
//   electron desktop/cover-region-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → COVER_REGION_PASS / COVER_REGION_FAIL
//   MONTCLIP_SHOTS_OUT=<dir> also saves the menu, the panel after adding, and a picked area (synthetic picture only).
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT,fs=require('node:fs'),path=require('node:path');
const shot=async(win,name)=>{if(shotsDir)fs.writeFileSync(path.join(shotsDir,name),(await win.webContents.capturePage()).toPNG());};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(80);}throw Error('TIMEOUT '+expr);};
 try{
  win.setContentSize(1280,800);
  await until(`state.connected`,15000);
  // the switch to a fresh project can take a moment to land: try the sync for a few seconds before calling it a failure
  report.created=await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');const r=await pjPost({action:'new',name:'打码 smoke',open:true});
   for(let i=0;;i++){if(await syncFromServer(true))return {id:r&&r.id,tries:i+1};if(i>=40)throw Error('CREATE '+JSON.stringify(r).slice(0,200));await new Promise(r=>setTimeout(r,250));}})()`);
  // a synthetic still (no footage of anyone), on V1, the playhead over it, the Inspector showing
  await read(`(async()=>{const cv=document.createElement('canvas');cv.width=1280;cv.height=720;const g=cv.getContext('2d');g.fillStyle='#334';g.fillRect(0,0,1280,720);
   g.fillStyle='#fc0';g.fillRect(800,100,300,300);g.fillStyle='#fff';g.font='48px sans-serif';g.fillText('viewer_names_123',100,650);
   const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const [m]=await importFiles([new File([blob],'synthetic.png',{type:'image/png'})]);if(!m)throw Error('IMPORT');
   updateMontClipView({mode:'advanced'});addClipFromMedia(m,'V1',0);if(!await flushSave())throw Error('SAVE');setTime(1);setSideTab('inspector');})()`);
  await until(`project.clips.some(c=>c.kind==='image')`);
  win.webContents.debugger.attach('1.3');
  const mouse=async(type,p,button='left')=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,button,clickCount:type==='mouseMoved'?0:1,x:p.x,y:p.y});
  const click=async(selector,button='left')=>{const p=await read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   if(!p)throw Error('NO '+selector);await mouse('mousePressed',p,button);await mouse('mouseReleased',p,button);await wait(120);};
  const key=async(k)=>{for(const type of ['keyDown','keyUp'])await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key:k,code:k,windowsVirtualKeyCode:k==='Escape'?27:k==='z'?90:0,modifiers:k==='z'?2:0});await wait(120);};
  // drag a box on the monitor over picture fractions (u0, v0) → (u1, v1): through the mask box, as the editor maps it
  const drag=async(u0,v0,u1,v1)=>{
   await until(`(()=>{const c=project.clips.find(c=>c.kind==='image');return !!(c&&maskBox(c));})()`);
   const P=await read(`(()=>{const c=project.clips.find(c=>c.kind==='image'),B=maskBox(c),r=els.preview.getBoundingClientRect(),k=r.width/els.preview.width;
    const at=(u,v)=>{const q=B.toCanvas(u*B.bw,v*B.bh);return{x:r.left+q.x*k,y:r.top+q.y*k};};return[at(${u0},${v0}),at(${(u0+u1)/2},${(v0+v1)/2}),at(${u1},${v1})];})()`);
   await mouse('mouseMoved',P[0]);await mouse('mousePressed',P[0]);await mouse('mouseMoved',P[1]);await mouse('mouseMoved',P[2]);await mouse('mouseReleased',P[2]);await wait(200);};
  const look=()=>read(`(()=>{const c=project.clips.find(c=>c.kind==='image'),list=clipCovers(c),sec=els.inspector.querySelector('[data-cover-section]');
   const ir=els.inspector.getBoundingClientRect(),sr=sec&&sec.getBoundingClientRect(),el=els.tracks.querySelector('.clip[data-id="'+c.id+'"] .clip-label');
   return{list,title:sec&&sec.querySelector('[data-cover-title]').textContent,rows:[...els.inspector.querySelectorAll('[data-cover-pick]')].map(b=>b.textContent),
    badge:el&&el.textContent,inView:!!(sr&&sr.top<ir.bottom&&sr.bottom>ir.top),tool:coverUi.clip,sel:coverSelFor(c),undo:runtime.undo.length};})()`);

  // 1. the right-click menu: its own group after 停用 / 锁定
  const clipEl=`.track[data-track="V1"] .clip`;
  await click(clipEl);await click(clipEl,'right');
  await shot(win,'cover-menu.png');
  report.menu=await read(`[...document.querySelectorAll('#trackCtxMenu > *')].map(e=>e.classList.contains('ctx-sep')?'—':e.querySelector('span').textContent)`);
  const cover=await read(`uiText('own.cover-area')`),lock=await read(`uiText('own.clip-lock')`),dis=await read(`uiText('own.clip-disable')`);
  assert.deepEqual(report.menu.slice(0,5),[dis,lock,'—',cover,'—'],'停用, 锁定, then 打码 on its own');
  await click(`#trackCtxMenu .ctx-item:nth-of-type(3)`);   // 〔给这块打码〕 (the 3rd button)
  assert.equal(await read(`coverUi.clip===project.clips.find(c=>c.kind==='image').id`),true,'the box tool is on');
  await read(`els.inspector.scrollTop=0;true`);
  // 2. drag a box: 第 1 块, 打码·1, 打码区域（1）, scrolled into view
  await drag(0.6,0.1,0.9,0.5);
  let s=await look();report.one=s;
  assert.equal(s.list.length,1);assert.deepEqual(s.rows,[await read(`uiText('own.cover-area-n',{n:1})`)]);
  assert.equal(s.title,await read(`uiText('own.cover-section-n',{n:1})`));assert.ok(s.badge.includes(await read(`uiText('own.cover-badge',{n:1})`)),s.badge);
  assert.equal(s.inView,true,'the 打码 section is in view after adding');assert.equal(s.tool,null);
  assert.ok(Math.abs(s.list[0].x-0.75)<0.01&&Math.abs(s.list[0].y-0.3)<0.01&&Math.abs(s.list[0].w-0.3)<0.01&&Math.abs(s.list[0].h-0.4)<0.01,'centre and size: '+JSON.stringify(s.list[0]));
  // a second one from the panel: numbering and counts agree
  await click('[data-cover-add]');await drag(0.05,0.85,0.5,0.95);
  s=await look();report.two=s;
  await shot(win,'cover-panel-two.png');
  assert.deepEqual(s.rows,[await read(`uiText('own.cover-area-n',{n:1})`),await read(`uiText('own.cover-area-n',{n:2})`)]);
  assert.equal(s.title,await read(`uiText('own.cover-section-n',{n:2})`));assert.ok(s.badge.includes(await read(`uiText('own.cover-badge',{n:2})`)),s.badge);
  // style and strength on 第 1 块, then pick it: highlighted
  await read(`(()=>{const o=els.inspector.querySelector('[data-cover-opts="0"]');const sel=o.querySelector('[data-cover-style]');sel.value='blur';sel.dispatchEvent(new Event('change'));return true;})()`);
  await read(`(()=>{const o=els.inspector.querySelector('[data-cover-opts="0"]');const r=o.querySelector('[data-cover-strength]');r.value='30';r.dispatchEvent(new Event('change'));return true;})()`);
  await click('[data-cover="0"] [data-cover-pick]');
  assert.equal((await look()).sel,0,'第 1 块 picked');
  await wait(200);await shot(win,'cover-picked.png');
  const before=(await look()).list;
  // 3. 重新框选 第 1 块: a new area, style and strength kept, 第 2 块 untouched; one undo puts it back
  await click('[data-cover="0"] [data-cover-redo]');
  assert.equal(await read(`coverUi.replace`),0);
  const depth=(await look()).undo;
  await drag(0.1,0.1,0.3,0.3);
  s=await look();report.redo=s;
  assert.equal(s.list.length,2);assert.equal(s.list[0].style,'blur');assert.equal(s.list[0].strength,30);
  assert.ok(Math.abs(s.list[0].x-0.2)<0.01&&Math.abs(s.list[0].w-0.2)<0.01,'the new area: '+JSON.stringify(s.list[0]));
  assert.deepEqual(s.list[1],before[1],'第 2 块 untouched');assert.equal(s.undo,depth+1,'one undo step');assert.equal(s.sel,0);
  await read(`undo();true`);await wait(150);
  s=await look();report.undone=s;assert.deepEqual(s.list,before,'one undo puts the old area back, style and strength as they were');
  // 4. 重新框选 then Esc: nothing changes, the tool is off
  await click('[data-cover="0"] [data-cover-redo]');
  // the note under the rows says what to do, Esc in the interface's key style
  report.redoNote=await read(`(()=>{const p=[...els.inspector.querySelectorAll('[data-cover-section] .cl-note')].pop();return p&&p.innerHTML;})()`);
  assert.equal(report.redoNote,await read(`escapeHtml(uiText('own.cover-redo-drag',{n:1})).replace(/Esc/,'<kbd>Esc</kbd>')`));assert.ok(report.redoNote.includes('<kbd>Esc</kbd>'));
  await key('Escape');
  s=await look();report.esc=s;assert.deepEqual(s.list,before,'Esc keeps it as it is');assert.equal(s.tool,null);assert.equal(s.undo,depth,'nothing written');
  // 5. in English the interface shows JJ's words exactly: the menu item, the title, the rows, the badge
  await read(`updateMontClipView({language:'en'});renderInspector();state.dirtyTimeline=true;true`);await wait(300);
  await click(clipEl);await click(clipEl,'right');
  report.en=await read(`(()=>{const items=[...document.querySelectorAll('#trackCtxMenu .ctx-item span')].map(e=>e.textContent);hideTrackCtxMenu();
   const sec=els.inspector.querySelector('[data-cover-section]'),c=project.clips.find(c=>c.kind==='image');
   return{menu:items,title:sec.querySelector('[data-cover-title]').textContent,rows:[...sec.querySelectorAll('[data-cover-pick]')].map(b=>b.textContent),
    redo:[...sec.querySelectorAll('[data-cover-redo]')].map(b=>b.textContent),remove:[...sec.querySelectorAll('[data-cover-del]')].map(b=>b.textContent),
    badge:els.tracks.querySelector('.clip[data-id="'+c.id+'"] .clip-label').textContent};})()`);
  assert.ok(report.en.menu.includes('Hide this area'),'menu: '+report.en.menu);assert.equal(report.en.title,'Hidden areas (2)');
  assert.deepEqual(report.en.rows,['Area 1','Area 2']);assert.deepEqual(report.en.redo,['Redraw','Redraw']);assert.deepEqual(report.en.remove,['Remove','Remove']);
  assert.ok(report.en.badge.startsWith('Hidden · 2'),report.en.badge);
  await read(`updateMontClipView({language:'zh-CN'});true`);
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'COVER_REGION_PASS':'COVER_REGION_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
