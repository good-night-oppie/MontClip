'use strict';
// VV's offscreen review of #84 53f641d (Deja, 2026-11-04): at 630×460 the chat pane was 242×144 — the plan list showed a
// step and a half, the conversation not at all, and with Yolo on its bar took the rest (conversation 0 px high).
// v7.2: when the window is narrow, the chat pane lies over the window and can be put away (〔收起〕).
// Fresh profile, hidden offscreen window with its content set to 630×460 (frameless offscreen windows are given a lower
// minimum, as in VV's review, so the content is the size a real 640×480 window's would be), a synthetic project (no media
// file is read) and a MOCK model: the transport is replaced in the main process and answers with a plan of three steps.
// Mock replies say nothing about a real model's behaviour. Checks, at 630×460:
//  - the conversation is at least 3 lines high, and the plan list shows 3 steps whole, without scrolling;
//  - with Yolo on, its bar is one line and the conversation still at least 3 lines; the plan list still 3 steps;
//  - the input box is whole in both;
//  - the pane lies over the editor (most of the window), 〔收起〕 puts it away and the editor is back in full;
//  - at 1280×820 the pane stays beside the editor, as before, and the plan's 〔开始〕 is in sight without scrolling.
//   electron desktop/agent-narrow-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → NARROW_PASS / NARROW_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!require('node:path').isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
// MONTCLIP_SHOTS_OUT=<absolute folder> saves the hidden offscreen window's own page as PNGs (capturePage of this window only)
const shotOf=(win)=>async(name)=>{if(!shotsDir)return;await new Promise(r=>setTimeout(r,150));require('node:fs').writeFileSync(require('node:path').join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
delete process.env.MONTCLIP_SMOKE_YOLO_CONSENT;
let reply=null,requests=0;
const service=require('./agent-service'),originalService=service.createDiskService;
service.createDiskService=(...args)=>{const real=originalService(...args);return{...real,async send(p){assert.ok(service.validPayload(p));requests++;return{ok:true,requestId:p.requestId,text:JSON.stringify(reply)};}};};
const keep=(clipId,from,to)=>({capability:'keep_ranges',args:{output_mode:'one_file',ranges:[{clipId,from,to}]}});
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms)),shot=shotOf(win);
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'窄窗 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);await wait();
  await read(`(async()=>{const doc=projectJSON();Object.assign(doc,{media:[{id:'m1',src:'/media/none.mp4',kind:'video',name:'合成.mp4',duration:120}],clips:[{id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:120,props:{volume:0}}]});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait();
  assert.equal((await read(`montclipAgentService.configure({provider:'openrouter',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`)).configured,true);
  const size=async(w,h)=>{win.setMinimumSize(600,400);win.setContentSize(w,h);await wait(500);return read(`[innerWidth,innerHeight]`);};
  report.inner=await size(630,460);
  assert.ok(Math.abs(report.inner[0]-630)<=3&&Math.abs(report.inner[1]-460)<=3,'content 630×460: '+report.inner);
  // a short conversation and a plan of three steps
  reply={type:'plan',steps:[keep('v1',0,115),keep('range0_v1',0,110),keep('range0_range0_v1',0,105)]};
  await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'先剪掉最后 5 秒，再剪 5 秒，再剪 5 秒');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  await read(`document.querySelector('.cindy-send button').click();true`);await wait();
  await read(`document.querySelector('.cindy-confirm[open] button').click();true`);await wait(700);
  // how much of each one shows: its box, cut by every scrolling or clipping box it sits in and by the window
  const measure=()=>read(`(()=>{
   const visible=(el)=>{if(!el)return null;let r=el.getBoundingClientRect(),top=r.top,bottom=r.bottom,left=r.left,right=r.right;
    for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.overflow!=='visible'||s.overflowY!=='visible'){const q=p.getBoundingClientRect();top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);left=Math.max(left,q.left);right=Math.min(right,q.right);}}
    top=Math.max(top,0);bottom=Math.min(bottom,innerHeight);return{h:Math.max(0,Math.round(bottom-top)),w:Math.max(0,Math.round(right-left)),top:Math.round(top),bottom:Math.round(bottom)};};
   const line=(el)=>{const s=el&&getComputedStyle(el);return s?(parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.3):16;};
   const pane=document.getElementById('mcAssistantPanel'),thread=document.querySelector('.cindy-thread'),msg=document.querySelector('.cindy-thread .cindy-message');
   const steps=[...document.querySelectorAll('[data-plan] li')],yolo=document.querySelector('[data-yolo-on]');
   const whole=steps.filter(li=>{const v=visible(li),r=li.getBoundingClientRect();return v&&v.h>=Math.floor(r.height)-1;}).length;
   const p=pane.getBoundingClientRect();
   return{pane:{w:Math.round(p.width),h:Math.round(p.height),hidden:pane.classList.contains('hidden')},thread:visible(thread),threadLines:Math.floor((visible(thread)?.h||0)/line(msg)),
    steps:steps.length,stepsWhole:whole,yolo:yolo?{...visible(yolo),lines:Math.round(yolo.getBoundingClientRect().height/line(yolo))}:null,
    composer:visible(document.querySelector('[data-cindy-draft]'))};})()`);
  const narrow=await measure();report.narrow=narrow;await shot('narrow-630x460');
  assert.equal(narrow.steps,3,'the plan is shown');
  assert.ok(narrow.threadLines>=3,'the conversation shows at least 3 lines: '+JSON.stringify(narrow.thread));
  assert.ok(narrow.stepsWhole>=3,'the plan shows its 3 steps whole: '+narrow.stepsWhole);
  assert.ok(narrow.pane.w>=0.8*630&&narrow.pane.h>=0.7*460,'the pane lies over the window: '+JSON.stringify(narrow.pane));
  // Yolo on: its bar one line; the conversation and the plan still there
  process.env.MONTCLIP_SMOKE_YOLO_CONSENT='1';
  await read(`document.querySelector('[data-mode="yolo"]').click();true`);await wait(400);
  delete process.env.MONTCLIP_SMOKE_YOLO_CONSENT;
  assert.equal(await read('agentPolicy.mode'),'yolo');
  const yolo=await measure();report.yolo=yolo;await shot('narrow-630x460-yolo');
  assert.ok(yolo.yolo&&yolo.yolo.h>0,'the Yolo bar shows');
  assert.equal(yolo.yolo.lines,1,'the Yolo bar is one line');
  assert.ok(yolo.thread.h>0&&yolo.threadLines>=3,'with Yolo on the conversation still shows at least 3 lines: '+JSON.stringify(yolo.thread));
  assert.ok(yolo.stepsWhole>=3,'with Yolo on the plan still shows its 3 steps: '+yolo.stepsWhole);
  // and the input box is whole, in both (it fell off the bottom once the steps took two lines)
  for(const [k,m] of [['narrow',narrow],['yolo',yolo]])assert.ok(m.composer.h>=28,k+': the input box is in sight: '+JSON.stringify(m.composer));
  // 〔收起〕 puts it away; the editor has the window back
  await read(`document.getElementById('mcAssistantClose').click();true`);await wait(300);
  // put away, nothing lies over the editor: the column is in its place again and the player is not covered
  report.closed=await read(`(()=>{const m=document.getElementById('monitorPanel').getBoundingClientRect(),hit=document.elementFromPoint(m.left+m.width/2,m.top+m.height/2);
   return{hidden:document.getElementById('mcAssistantPanel').classList.contains('hidden'),column:getComputedStyle(document.querySelector('.upper > .inspector')).position,monitor:Math.round(m.width),playerUncovered:!!hit&&document.getElementById('monitorPanel').contains(hit)};})()`);
  assert.equal(report.closed.hidden,true);assert.notEqual(report.closed.column,'fixed');assert.equal(report.closed.playerUncovered,true,'the editor is back: '+JSON.stringify(report.closed));
  // 1280×820: beside the editor, as before
  await read(`setSideTab('assistant');mcAgent.render();true`);
  report.wideInner=await size(1280,820);
  const wide=await measure();report.wide=wide;await shot('wide-1280x820');
  assert.ok(wide.pane.w<0.5*1280,'at 1280 the pane sits beside the editor: '+wide.pane.w);
  assert.ok(wide.threadLines>=3&&wide.stepsWhole>=3);
  // and the plan's buttons are in sight without scrolling (VV on #84 53f641d: at 1280 〔开始〕 needed a scroll)
  report.wideStart=await read(`(()=>{const b=document.querySelector('[data-plan-start]'),r=b.getBoundingClientRect();let top=r.top,bottom=r.bottom;for(let p=b.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowY!=='visible'){const q=p.getBoundingClientRect();top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);}}return{h:Math.round(r.height),visible:Math.round(Math.max(0,Math.min(bottom,innerHeight)-Math.max(top,0)))};})()`);
  assert.ok(report.wideStart.visible>=report.wideStart.h-1,'〔开始〕 in sight at 1280: '+JSON.stringify(report.wideStart));
  // step 3 (Deja): the approval card in the stream, whole and above the input box, at 1280×820 and 630×460
  await read(`setAgentMode('manual')`);await wait(300);
  assert.equal(await read('agentPolicy.mode'),'manual');
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const cardSeen=()=>read(`(()=>{const c=document.querySelector('[data-host-card="approval"]');if(!c)return null;const r=c.getBoundingClientRect();let top=r.top,bottom=r.bottom;
   for(let p=c.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowY!=='visible'){const q=p.getBoundingClientRect();top=Math.max(top,q.top);bottom=Math.min(bottom,q.bottom);}}
   const comp=document.querySelector('[data-cindy-draft]').getBoundingClientRect();
   return{h:Math.round(r.height),visible:Math.round(Math.max(0,Math.min(bottom,innerHeight)-Math.max(top,0))),bottom:Math.round(r.bottom),composerTop:Math.round(comp.top),composerH:Math.round(comp.height),
    sizes:[...c.querySelectorAll('[data-host-card-first],[data-host-card-second]')].map(e=>getComputedStyle(e).fontSize),focus:document.activeElement?.dataset?.hostChoice||null,cardFocus:document.activeElement?.dataset?.hostCard||null,step:document.querySelector('[data-plan] li [data-step-state-text]')?.textContent||null};})()`);
  for(let i=0;i<30&&!await cardSeen();i++)await wait(100);
  for(const [w,h,name] of [[1280,820,'wide'],[630,460,'narrow']]){
   if(name==='narrow'){await size(w,h);await read(`setSideTab('assistant');mcAgent.render();true`);await wait(300);}
   const c=await cardSeen();report['card_'+name]=c;await shot('card-'+w+'x'+h);
   assert.ok(c,name+': the card is shown');
   assert.ok(c.visible>=c.h-1,name+': the card is whole: '+JSON.stringify(c));
   assert.ok(c.bottom<=c.composerTop+1&&c.composerH>=28,name+': above the input box, which is in sight: '+JSON.stringify(c));
   assert.equal(c.step,'进行中');
   assert.deepEqual(c.sizes,['15px','12px'],name+': what changes in 15 px, the sentence under it in 12 px (v7.2)');
  }
  assert.equal(report.card_wide.cardFocus,'approval','the card itself has the focus');
  assert.equal(report.card_wide.focus,null,'no approve button is focused');
  await read(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));true`);await wait(200);
  assert.ok(await read(`!!document.querySelector('[data-host-card="approval"] [data-host-choice="once"]')`),'a stray Space approves nothing');
  await read(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`);await wait(300);
  assert.ok(await read(`(document.querySelector('[data-host-card-done="approval"]')||{textContent:''}).textContent.includes('你没有同意')`),'Esc on the card counts as 不同意');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'NARROW_PASS':'NARROW_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
