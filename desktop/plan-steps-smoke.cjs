'use strict';
// 「把我唱歌的部分一首一个切片剪出来」 from start to end (Deja, 2026-11-03): a plan of find_songs → keep_ranges (one clip per
// range, its ranges {"$step": 1}) → export_files, in the real page, server and main process. Fresh profile, hidden offscreen
// window, synthetic sound only (test/songs-synth.js: held tones are singing, tone bursts with pauses are talk) and a MOCK
// model: the transport is replaced in the main process and answers with the plan below. Mock replies say nothing about a
// real model's behaviour. The system's Save window is never shown: this smoke answers each save with setSavePath (into the
// profile), the way the window would; pressing Save / Cancel in the real window is VV's check. Checks:
//  - the plan shows each step's plain sentence, never internal names;
//  - 自动: finding and keeping run without asking; the export (sensitive) asks; 〔只批准这次〕;
//  - the songs found become one clip each on the timeline (one undo step of the plan's run) and one file each, every file
//    saved through a Save window (its title, the parts named 「{time} 那段」 while songs.js is below Deja's gate), nothing
//    written anywhere else, the session's copies gone once saved;
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
  await read(`document.querySelector('[data-mode="auto"]').click();true`);await wait();
  const clips=()=>read(`project.clips.filter(c=>c.kind==='audio').map(c=>c.id+':'+c.in+'+'+c.duration).join(',')`);
  const view=()=>read(`(()=>{const p=document.querySelector('[data-plan]');if(!p)return null;return{text:p.textContent,steps:[...p.querySelectorAll('li')].map(li=>({label:li.querySelector('[data-step-label]').textContent,state:li.querySelector('[data-step-state-text]').textContent,reason:li.querySelector('[data-step-reason]')?.textContent||''})),undo:!!p.querySelector('[data-plan-undo]'),note:p.querySelector('[data-plan-note]')?.textContent||''};})()`);
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
  // 2. 〔开始〕 in 自动: find and keep run; the export asks
  const before=await clips();
  // every save answered the way the Save window would be: into Saved/, and what it offered is kept
  const ses=win.webContents.session,dialogs=[];
  ses.on('will-download',(event,item)=>{if(event.defaultPrevented)return;const o=item.getSaveDialogOptions();dialogs.push({title:o.title,name:path.basename(o.defaultPath||''),dir:path.dirname(o.defaultPath||'')});item.setSavePath(path.join(saved,item.getFilename()));});
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const b=await until(box,240000);report.box=b;
  assert.ok(b,'the export asks');assert.equal(b.label,Cap.label('export_files','zh-CN'));assert.match(b.summary,/第 3 步，共 3 步/);
  const mid=await view();report.mid=mid.steps.map(s=>s.state);assert.deepEqual(report.mid,['做完了','做完了','正在做'],'finding and keeping did not ask');
  const cut=await clips();report.cut=cut;
  assert.notEqual(cut,before);assert.equal(cut.split(',').length,2,'one clip per song');
  await shot('steps-export-box');
  await read(`document.querySelector('[data-agent-approval][open] [data-choice="once"]').click();true`);
  const done=await until(async()=>{const v=await view();return v&&v.steps.every(s=>s.state==='做完了')?v:(v&&v.steps.some(s=>s.state==='没做成'||s.reason)?v:null);},420000);
  report.done=done&&{states:done.steps.map(s=>s.state),reasons:done.steps.map(s=>s.reason),note:done.note};
  assert.ok(done&&done.steps.every(s=>s.state==='做完了'),'every step done');
  await shot('steps-done');
  // 3. the files: one per song, each through a Save window, nothing else written
  report.dialogs=dialogs;report.saved=fs.readdirSync(saved);
  assert.equal(dialogs.length,2);
  for(const d of dialogs){assert.equal(d.title,'保存导出的视频');assert.equal(d.dir,downloads);assert.match(d.name,/那段/);assert.ok(!/首歌/.test(d.name),'below the gate: no song numbers');}
  assert.equal(report.saved.length,2);for(const f of report.saved)assert.ok(fs.statSync(path.join(saved,f)).size>1000,f);
  assert.deepEqual(fs.readdirSync(downloads),[],'nothing in Downloads');
  const q=await read(`exportQueue.map(q=>({status:q.status,saved:!!q.saved}))`);report.queue=q;
  assert.deepEqual(q,[{status:'done',saved:true},{status:'done',saved:true}]);
  const exportsLeft=fs.readdirSync(path.join(app.getPath('userData'),'workspace','exports')).filter(f=>/\.(mp4|mov|mkv|webm)$/.test(f));
  report.exportsLeft=exportsLeft.length;assert.equal(exportsLeft.length,0,'the session’s copies go once saved');
  const run=await read(`(()=>{const e=eventLog().list().filter(e=>e.actor==='ai'&&e.runId);const last=e.at(-1);return e.filter(x=>x.runId===last.runId).map(x=>({step:x.step,capability:x.capability,state:x.state}));})()`);
  report.events=run;
  assert.deepEqual(run.map(e=>[e.step,e.capability]),[[1,'find_songs'],[2,'keep_ranges'],[3,'export_files']]);
  // 4. 〔撤销整个计划〕: the edit back (the saved files are the streamer's now)
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
