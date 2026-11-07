'use strict';
// P4, second half (Deja, 2026-11-03): the plan list in the real page. Fresh profile, hidden offscreen window, a synthetic
// project (no media file is read) and a MOCK model: the transport is replaced in the main process and answers with the plan
// the smoke sets for that turn. Mock replies say nothing about a real model's behaviour. Checks:
//  - a plan reply shows as a list (what each step changes, the capability's plain sentence under it, 待做; v7.2 states ○ 待做 / 进行中 / ✓ 完成 / ✕ 没做成), never its JSON or internal names;
//  - before it starts, a step can be deleted;
//  - 〔开始〕 in 手动: the host's box for the first step, 「这个聊天中都批准」, the next step of the same kind runs without
//    asking; one step 进行中 at a time; every step an event of one run; 〔撤销整个计划〕 takes them all back at once;
//  - a step that no longer fits the project fails and stops the plan there; the rest stay 待做, with the reason;
//  - a step the assistant can't do yet stops the plan, saying so;
//  - 计划 mode: 〔开始〕 is off; 〔整个不要〕 drops a plan and nothing is done.
//   electron desktop/agent-plan-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → PLAN_PASS / PLAN_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!require('node:path').isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
// evidence for the PR (Deja): MONTCLIP_SHOTS_OUT=<absolute folder> saves the hidden offscreen window's own page as PNGs (capturePage of
// this window only; nothing on the desktop is captured)
const shotOf=(win)=>async(name)=>{if(!shotsDir)return;await new Promise(r=>setTimeout(r,150));require('node:fs').writeFileSync(require('node:path').join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
const Cap=require('../capabilities');
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
  // a reload started by the server's own change event can overtake this one (it then answers nothing): wait until the new
  // project is the open one instead of trusting that one answer
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');const made=await pjPost({action:'new',name:'计划清单 smoke',open:true});if(!made||!made.id)throw Error('CREATE');for(let i=0;i<50&&runtime.projectId!==made.id;i++){await syncFromServer(true);await new Promise(r=>setTimeout(r,100));}if(runtime.projectId!==made.id)throw Error('CREATE');})()`);await wait();
  await read(`(async()=>{const doc=projectJSON();Object.assign(doc,{media:[{id:'m1',src:'/media/none.mp4',kind:'video',name:'合成.mp4',duration:120}],clips:[{id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:120,props:{volume:0}}]});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait();
  assert.equal((await read(`montclipAgentService.configure({provider:'openrouter',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`)).configured,true);
  const clips=()=>read(`project.clips.filter(c=>c.kind==='video').map(c=>c.id+':'+c.duration).join(',')`);
  const turn=async(plan,text='先剪掉最后 5 秒，再剪 5 秒')=>{reply=plan;
   await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
   await read(`document.querySelector('.cindy-send button').click();true`);await wait();
   await read(`document.querySelector('.cindy-confirm[open] button').click();true`);await wait(500);
  };
  const view=()=>read(`(()=>{const p=document.querySelector('[data-plan]');if(!p)return null;return{text:p.textContent,steps:[...p.querySelectorAll('li')].map(li=>({label:li.querySelector('[data-step-label]').textContent,detail:li.querySelector('[data-step-detail]')?.textContent||'',mark:li.querySelector('[data-step-mark]').textContent,state:li.querySelector('[data-step-state-text]').textContent,reason:li.querySelector('[data-step-reason]')?.textContent||''})),
   start:p.querySelector('[data-plan-start]')?{disabled:p.querySelector('[data-plan-start]').disabled}:null,undo:!!p.querySelector('[data-plan-undo]'),note:p.querySelector('[data-plan-note]')?.textContent||''};})()`);
  const box=()=>read(`(()=>{const d=document.querySelector('[data-host-card="approval"]');if(!d)return null;const sec=d.querySelector('[data-host-card-second]'),first=d.querySelector('[data-host-card-first]').textContent;return{text:d.textContent,first,detail:sec?first:null,label:sec?sec.textContent:first,summary:d.querySelector('[data-host-card-more]')?.textContent||'',choices:[...d.querySelectorAll('[data-host-choice]')].map(b=>[b.dataset.hostChoice,b.textContent]),focus:document.activeElement?.dataset?.hostChoice||null,inStream:!!d.closest('.cindy-thread'),dialogs:document.querySelectorAll('dialog[open]').length,waiting:document.querySelector('[data-approval-waiting]')?.textContent||null};})()`);
  const until=async(f,ms=6000)=>{const end=Date.now()+ms;let v;while(!(v=await f())&&Date.now()<end)await wait(100);return v;};
  // 1. a plan of three steps shows as a list; delete the third
  await turn({type:'plan',steps:[keep('v1',0,115),keep('range0_v1',0,110),{capability:'fablecut_export',args:{}}]});
  const v1=await view();report.list=v1&&v1.steps;
  if(!v1)report.debug=await read(`(()=>{try{return {log:document.querySelector('[role=log]').textContent.slice(-300),plan:typeof MontClipPlan,mode:agentPolicy.mode,opt:typeof window.montclipAgentPolicy,status:document.querySelector('.cindy-port [role=status]:last-of-type')?.textContent};}catch(e){return String(e)}})()`);
  assert.ok(v1,'the plan list is shown');
  assert.deepEqual(v1.steps.map(s=>s.label),[Cap.label('keep_ranges','zh-CN'),Cap.label('keep_ranges','zh-CN'),Cap.label('fablecut_export','zh-CN')]);
  assert.deepEqual(v1.steps.map(s=>s.state),['待做','待做','待做']);
  // what each step changes, first (VV on #84 53f641d): the two keep steps differ; the export says nothing more
  assert.deepEqual(v1.steps.map(s=>s.detail),['保留 0:00–1:55','保留 0:00–1:50','']);
  assert.deepEqual(v1.steps.map(s=>s.mark),['○','○','○']);
  assert.ok(!/keep_ranges|fablecut_|"type"/.test(v1.text),'no internal names, no JSON');
  await shot('plan-todo');
  assert.match(await read(`document.querySelector('[role=log] .cindy-message:last-child').textContent`),/已排好计划，共 3 步/);
  await read(`document.querySelectorAll('[data-plan] [data-step-remove]')[2].click();true`);await wait();
  assert.equal((await view()).steps.length,2,'deleted before it started');
  // 2. 〔开始〕 in 手动: the box for step 1 (one step 进行中), 「都批准」, step 2 runs without asking
  const before=await clips();
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const b1=await until(box);report.box=b1;assert.ok(b1,'手动 asks for the first step');assert.equal(b1.label,Cap.label('keep_ranges','zh-CN'));const vAsk=await view();assert.equal(vAsk.steps[0].state,'进行中','while its card waits, the step is 进行中 (Deja, step 3)');
  // VV on #84 (Deja, 2026-11-04; v7.2): the box's first line is what this step changes (stepDetail), the plain sentence second
  assert.equal(b1.first,'保留 0:00–1:55');assert.equal(b1.detail,'保留 0:00–1:55');
  assert.deepEqual((await view()).steps.map(s=>s.state),['进行中','待做'],'one step 进行中');
  await shot('plan-doing');
  assert.equal(await read(`document.querySelector('[data-plan] [data-step-remove]')`),null,'no deleting once started');
  await read(`document.querySelector('[data-host-card="approval"] [data-host-choice="session"]').click();true`);
  const done=await until(async()=>{const v=await view();return v&&v.steps.every(s=>s.state==='完成')&&v.undo?v:null;},10000);
  report.done=done&&{states:done.steps.map(s=>s.state),note:done.note};
  assert.ok(done,'both steps done; the second without asking');await shot('plan-done');assert.match(done.note,/每一步都做完了/);
  const after=await clips();report.clips=[before,after];assert.equal(after,'range0_range0_v1:110');
  const run=await read(`(()=>{const e=eventLog().list().filter(e=>e.actor==='ai'&&e.capability==='keep_ranges');const last=e.at(-1);return e.filter(x=>x.runId===last.runId).map(x=>({step:x.step,state:x.state}));})()`);
  report.events=run;assert.deepEqual(run,[{step:1,state:'applied'},{step:2,state:'applied'}]);
  // 3. 〔撤销整个计划〕: both at once
  await read(`document.querySelector('[data-plan-undo]').click();true`);await wait(300);
  assert.equal(await clips(),before,'the whole plan undone at once');
  const undone=await read(`(()=>{const e=eventLog().list().filter(e=>e.actor==='ai'&&e.capability==='keep_ranges');const last=e.at(-1);return e.filter(x=>x.runId===last.runId).map(x=>x.state);})()`);
  assert.deepEqual(undone,['undone','undone']);
  await read(`flushSave()`);await wait();
  // 4. 自动, a step that no longer fits: step 1 done, step 2 fails, step 3 stays 待做 — the plan stopped there
  await read(`document.querySelector('[data-mode="auto"]').click();true`);await wait();
  await turn({type:'plan',steps:[keep('v1',0,115),keep('v1',0,100),keep('range0_v1',0,90)]});
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const stopped=await until(async()=>{const v=await view();return v&&v.steps.some(s=>s.state==='没做成')?v:null;},10000);
  report.stopped=stopped&&stopped.steps;
  assert.deepEqual(stopped.steps.map(s=>s.state),['完成','没做成','待做']);
  assert.equal(stopped.steps[1].reason,'和现在的项目对不上。');await shot('plan-failed');assert.match(stopped.note,/计划停在了这一步/);
  assert.equal(await box(),null,'自动 did not ask');
  await read(`document.querySelector('[data-plan-undo]').click();true`);await wait(300);assert.equal(await clips(),before);
  await read(`flushSave()`);await wait();
  // 5. a step the assistant can't do yet stops the plan, saying so
  await turn({type:'plan',steps:[{capability:'fablecut_scopes',args:{}},keep('v1',0,115)]});
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const cant=await until(async()=>{const v=await view();return v&&v.steps[0].state==='没做成'?v:null;});
  assert.equal(cant.steps[0].reason,'助手现在还做不了这一步。');assert.equal(cant.steps[1].state,'待做');assert.equal(await clips(),before);
  // 6. 计划 mode: 〔开始〕 off; 〔整个不要〕 drops it, nothing done
  await read(`document.querySelector('[data-mode="plan"]').click();true`);await wait();
  await turn({type:'plan',steps:[keep('v1',0,115)]});
  const pm=await view();report.planMode={start:pm.start,note:pm.note};
  assert.equal(pm.start.disabled,true);assert.match(pm.note,/计划模式只出计划/);
  await read(`document.querySelector('[data-plan-discard]').click();true`);await wait();
  const dropped=await view();assert.equal(dropped.start,null);assert.match(dropped.note,/这个计划不要了/);assert.equal(await clips(),before);
  // 7. a plan with a step the table refuses is no plan at all
  await read(`document.querySelector('[data-mode="manual"]').click();true`);await wait();
  await turn({type:'plan',steps:[keep('v1',0,115),{capability:'overwrite_existing_file',args:{}}]});
  assert.equal(await view(),null);assert.match(await read(`document.querySelector('[role=log] .cindy-message:last-child').textContent`),/像是计划，但用不了/);
  // 8. in English too: the box's first line is the step's detail in English, the plain sentence second; declined, nothing done
  // (a new chat: step 2's 「这个聊天中都批准」 holds in the first one)
  await read(`updateMontClipView({language:'en'});mcAgent.render();document.querySelector('.cindy-port .agent-toolbar button').click();true`);await wait();
  await turn({type:'plan',steps:[keep('v1',0,115)]},'Keep all but the last 5 seconds');
  await read(`document.querySelector('[data-plan-start]').click();true`);
  const en=await until(box);report.boxEn=en;
  assert.ok(en,'manual asks in English too');assert.equal(en.first,'Keep 0:00–1:55');assert.equal(en.detail,'Keep 0:00–1:55');
  assert.equal(en.label,Cap.label('keep_ranges','en'));
  await read(`document.querySelector('[data-host-card="approval"] [data-host-choice="deny"]').click();true`);await wait(400);
  assert.equal(await clips(),before,'declined: nothing done');
  await read(`updateMontClipView({language:'zh-CN'});true`);
  report.requests=requests;report.transport='mock-test-only';
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'PLAN_PASS':'PLAN_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
