'use strict';
// 「把我唱歌的部分一首一个切片剪出来」 from start to end (Deja, 2026-11-03): a plan of find_songs → keep_ranges (one clip per
// range, its ranges {"$step": 1}) → export_files, in the real page, server and main process. Fresh profile, hidden offscreen
// window, synthetic sound only (test/songs-synth.js: held tones are singing, tone bursts with pauses are talk) and a MOCK
// model: the transport is replaced in the main process and answers with the plan below. Mock replies say nothing about a
// real model's behaviour. The system's Save window is never shown: this smoke answers each save with setSavePath (into the
// profile), the way the window would; pressing Save / Cancel in the real window is VV's check. Checks:
//  - the plan shows each step's plain sentence, never internal names;
//  - 手动 (Deja's guards): every step goes through the host's box; one clip per range asks the first time with three choices
//    and lists each clip's times; the export (sensitive) asks with two;
//  - the songs found become one clip each on the timeline (one undo step of the plan's run) and one file each, every file
//    through its own Save window (its title, the parts named 「{time} 那段」 while songs.js is below Deja's gate): the first
//    is cancelled — that file only is 没做成：你取消了保存, the next one still asks and is saved; nothing written anywhere
//    else; the saved file's session copy goes, the cancelled one stays in the queue with 〔保存〕;
//  - an export the streamer had waiting in the queue stays waiting, in its place, never rendered;
//  - 〔撤销整个计划〕 takes the edit back.
//   electron desktop/plan-steps-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → PLAN_STEPS_PASS / PLAN_STEPS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length);
const downloads=path.join(profile,'Downloads'),saved=path.join(profile,'Saved');
fs.mkdirSync(downloads,{recursive:true});fs.mkdirSync(saved,{recursive:true});
app.setPath('downloads',downloads);
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!path.isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
// evidence for the PR: MONTCLIP_SHOTS_OUT=<absolute folder> saves this hidden offscreen window's own page as PNGs (nothing on the desktop)
const shotOf=(win)=>async(name)=>{if(!shotsDir)return;await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
const {wav}=require('../test/songs-synth');
// no speech engine: nothing is transcribed
process.env.MONTCLIP_ASR_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-noasr-'));
delete process.env.MONTCLIP_SMOKE_YOLO_CONSENT;
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]];
const Cap=require('../capabilities');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
let reply=null,requests=0;
const service=require('./agent-service'),originalService=service.createDiskService;
service.createDiskService=(...args)=>{const real=originalService(...args);return{...real,async send(p){assert.ok(service.validPayload(p));requests++;return{ok:true,requestId:p.requestId,text:JSON.stringify(reply)};}};};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms)),shot=shotOf(win);
 let ok=false;const report={};
 const watchdog=setTimeout(()=>{out('PLAN_STEPS_FAIL',{watchdog:'10 min',...report});app.exit(1);},600000);
 const until=async(f,ms=6000)=>{const end=Date.now()+ms;let v;while(!(v=await f())&&Date.now()<end)await wait(150);return v;};
 try{
  await until(()=>read(`state.connected`),15000);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'唱歌切片 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait();
  assert.equal((await read(`montclipAgentService.configure({provider:'openrouter',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`)).configured,true);
  assert.equal(await read(`agentPolicy.mode`),'manual','the default');
  const clips=()=>read(`project.clips.filter(c=>c.kind==='audio').map(c=>c.id+':'+c.in+'+'+c.duration).join(',')`);
  const view=()=>read(`(()=>{const p=document.querySelector('[data-plan]');if(!p)return null;return{text:p.textContent,steps:[...p.querySelectorAll(':scope > ol > li')].map(li=>({label:li.querySelector('[data-step-label]').textContent,state:li.querySelector('[data-step-state-text]').textContent,reason:li.querySelector('[data-step-reason]')?.textContent||''})),undo:!!p.querySelector('[data-plan-undo]'),note:p.querySelector('[data-plan-note]')?.textContent||''};})()`);
  const box=()=>read(`(()=>{const d=document.querySelector('[data-agent-approval][open]');return d?{label:d.querySelector('[data-ap-label]').textContent,summary:d.querySelector('[data-ap-summary]').textContent,choices:[...d.querySelectorAll('[data-choice]')].map(b=>b.dataset.choice)}:null;})()`);
  // 1. the plan
  reply={type:'plan',steps:[{capability:'find_songs',args:{}},{capability:'keep_ranges',args:{output_mode:'per_range',ranges:{$step:1}}},{capability:'export_files',args:{}}]};
  await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'把我唱歌的部分一首一个切片剪出来');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  await read(`document.querySelector('.cindy-send button').click();true`);await wait();
  await read(`document.querySelector('.cindy-confirm[open] button').click();true`);
  const v1=await until(view,8000);report.list=v1&&v1.steps;
  assert.ok(v1,'the plan list is shown');
  assert.deepEqual(v1.steps.map(s=>s.label),['find_songs','keep_ranges','export_files'].map(n=>Cap.label(n,'zh-CN')));
  assert.ok(!/find_songs|keep_ranges|export_files|\$step|"type"/.test(v1.text),'no internal names, no JSON');
  await shot('steps-todo');
  // 2. an export the streamer queued earlier, waiting (not started)
  await read(`queueAdd(normalizeDelivery(Delivery.DEFAULT_PRESET).spec,'主播自己排的');exportQueue[0].id='q_own';renderQueue();true`);
  // 3. 〔开始〕 in 手动: each step through the host's box
  const before=await clips();
  // every save answered the way the Save window would be: the first cancelled (a save path so no window opens, then
  // cancelled before any byte), the others into Saved/; what each window offered is kept
  const ses=win.webContents.session,dialogs=[],cancelled=path.join(profile,'Cancelled');fs.mkdirSync(cancelled,{recursive:true});
  ses.on('will-download',(event,item)=>{if(event.defaultPrevented)return;const o=item.getSaveDialogOptions();dialogs.push({title:o.title,name:path.basename(o.defaultPath||''),dir:path.dirname(o.defaultPath||'')});
   if(dialogs.length===1){item.setSavePath(path.join(cancelled,item.getFilename()));item.cancel();}else item.setSavePath(path.join(saved,item.getFilename()));});
  const answer=async(label,choice,ms)=>{const b=await until(box,ms);assert.ok(b,label+' asks');await read(`document.querySelector('[data-agent-approval][open] [data-choice="${choice}"]').click();true`);await wait(200);return b;};
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const b1=await answer('finding','once',10000);report.box1=b1;assert.equal(b1.label,Cap.label('find_songs','zh-CN'));
  // one clip per range: asked the first time, three choices, each clip's times listed
  const b2=await until(box,240000);
  const lines=await read(`(()=>{const d=document.querySelector('[data-agent-approval][open]');return {head:d.querySelector('[data-ap-lines-head]')?.textContent||'',items:[...d.querySelectorAll('[data-ap-lines] li')].map(li=>li.textContent)};})()`);
  report.box2={...b2,lines};
  assert.equal(b2.label,Cap.label('keep_ranges','zh-CN'));assert.deepEqual(b2.choices,['once','session','deny'],'undoable, first time: three choices');
  assert.equal(lines.head,'这一步会切成 2 条，每条一个文件：');assert.equal(lines.items.length,2);
  for(const t of lines.items)assert.match(t,/那段.*\d+:\d\d.*\d+:\d\d/,'each clip with its times: '+t);
  await shot('steps-box-slices');
  assert.equal(await clips(),before,'nothing cut before the answer');
  await read(`document.querySelector('[data-agent-approval][open] [data-choice="once"]').click();true`);await wait(200);
  const b3=await answer('the export','once',20000);report.box3=b3;
  assert.equal(b3.label,Cap.label('export_files','zh-CN'));assert.deepEqual(b3.choices,['once','deny'],'sensitive: every time, two choices');
  const cut=await clips();report.cut=cut;
  assert.notEqual(cut,before);assert.equal(cut.split(',').length,2,'one clip per song');
  // while the plan's files render, the streamer's own waits in its place
  const during=await until(()=>read(`queueRunning?exportQueue.map(q=>q.id==='q_own'?'own:'+q.status:q.status).join(' '):null`),20000);report.during=during;
  assert.match(during,/^own:held /,'the streamer’s own export waits, first in the queue');
  const done=await until(async()=>{const v=await view();return v&&v.steps[2].state!=='正在做'?v:null;},420000);
  report.done=done&&{states:done.steps.map(s=>s.state),reasons:done.steps.map(s=>s.reason),note:done.note};
  assert.deepEqual(report.done.states,['做完了','做完了','做完了'],'one file saved: the step is done');
  const files=await read(`[...document.querySelectorAll('[data-plan] [data-step-files] li')].map(li=>({ok:li.dataset.fileOk,text:li.textContent}))`);report.files=files;
  assert.equal(files.length,2);
  assert.equal(files[0].ok,'0');assert.match(files[0].text,/那段.*：没做成：你取消了保存$/,'that file only');
  assert.equal(files[1].ok,'1');assert.match(files[1].text,/那段.*：存好了$/,'the next one still asked and was saved');
  await shot('steps-done');
  // 4. the files: each through its own Save window, nothing written anywhere else
  report.dialogs=dialogs;report.saved=fs.readdirSync(saved);
  assert.equal(dialogs.length,2,'every file asked');
  for(const d of dialogs){assert.equal(d.title,'保存导出的视频');assert.equal(d.dir,downloads);assert.match(d.name,/那段/);assert.ok(!/首歌/.test(d.name),'below the gate: no song numbers');}
  assert.equal(report.saved.length,1);assert.ok(fs.statSync(path.join(saved,report.saved[0])).size>1000);
  assert.deepEqual(fs.readdirSync(downloads),[],'nothing in Downloads');
  const q=await read(`exportQueue.map(q=>({id:q.id==='q_own'?'own':'plan',status:q.status,saved:!!q.saved,src:!!q.src}))`);report.queue=q;
  assert.deepEqual(q,[{id:'own',status:'pending',saved:false,src:false},{id:'plan',status:'done',saved:false,src:true},{id:'plan',status:'done',saved:true,src:true}],
   'the streamer’s own still waiting, first, never rendered; the cancelled file kept in the queue to save later; the saved one saved');
  const exportsLeft=fs.readdirSync(path.join(app.getPath('userData'),'workspace','exports')).filter(f=>/\.(mp4|mov|mkv|webm)$/.test(f));
  report.exportsLeft=exportsLeft.length;assert.equal(exportsLeft.length,1,'the saved file’s copy goes; the cancelled one’s stays for its 〔保存〕');
  const run=await read(`(()=>{const e=eventLog().list().filter(e=>e.actor==='ai'&&e.runId);const last=e.at(-1);return e.filter(x=>x.runId===last.runId).map(x=>({step:x.step,capability:x.capability,state:x.state}));})()`);
  report.events=run;
  assert.deepEqual(run.map(e=>[e.step,e.capability]),[[1,'find_songs'],[2,'keep_ranges'],[3,'export_files']]);
  // 5. 〔撤销整个计划〕: the edit back (the saved files are the streamer's now)
  await read(`document.querySelector('[data-plan-undo]').click();true`);await wait(400);
  assert.equal(await clips(),before,'the edit undone');
  report.requests=requests;report.transport='mock-test-only';
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{clearTimeout(watchdog);out(ok?'PLAN_STEPS_PASS':'PLAN_STEPS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
