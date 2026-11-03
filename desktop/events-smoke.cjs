'use strict';
// P1 (Deja, 2026-11-03): every step is an editor event. Fresh profile, hidden offscreen window, synthetic project (no media
// files are read). Checks, in the real page:
//  - an edit by hand is an event (actor streamer), applied, with the revision its save wrote, kept in project.json;
//  - an AI run of two steps (keep_ranges, checked by the real check, applied through the real review dialog) is undone as a
//    whole with undoRun, back to the timeline before it; both events end undone;
//  - a run with the streamer's edit after it is refused (RUN_INTERLEAVED) and nothing is undone;
//  - before an AI run the host keeps an agent version of the project;
//  - capabilities come from the main process, read-only.
//   electron desktop/events-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → EVENTS_PASS / EVENTS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'事件 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);await wait();
  const caps=await read(`montclipCapabilities.get()`);report.capabilities={ok:caps.ok,count:caps.capabilities.length,keep_ranges:caps.capabilities.find(c=>c.name==='keep_ranges').risk,export:caps.capabilities.find(c=>c.name==='fablecut_export').risk};
  assert.equal(caps.ok,true);assert.equal(report.capabilities.count,require('../capabilities').list().length);
  // a synthetic 60 s recording on V1 (no file is read: nothing plays)
  await read(`(async()=>{const doc=projectJSON();Object.assign(doc,{media:[{id:'m1',src:'/media/none.mp4',kind:'video',name:'合成.mp4',duration:60}],clips:[{id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:60,props:{volume:0}}]});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  // 1. by hand: a split is one undo step and one streamer event; the save writes its revision; project.json has it
  await read(`(()=>{setTime(20);splitAtPlayhead?.();return true;})()`).catch(()=>null);
  const manual=await read(`(async()=>{if(!runtime.undo.length){pushUndo();project.clips[0].duration=59;}if(!await flushSave())throw Error('SAVE');const e=eventLog().list().filter(e=>e.actor==='streamer').at(-1);const disk=await fetch('/api/project').then(r=>r.json());return{e,disk:disk.agentLog&&disk.agentLog.events.length,top:eventIdOf(runtime.undo.at(-1))===e.id};})()`);
  report.manual={capability:manual.e.capability,state:manual.e.state,revisionBefore:manual.e.revisionBefore,revisionAfter:manual.e.revisionAfter,onDisk:manual.disk,undoStepCarriesId:manual.top};
  assert.equal(manual.e.state,'applied');assert.ok(manual.e.revisionAfter>manual.e.revisionBefore);assert.ok(manual.disk>=1);assert.ok(manual.top);
  // 2. an AI run of two steps through the real check and the real review dialog, then undone as a whole
  const versionsBefore=await read(`fetch('/api/versions').then(r=>r.json()).then(v=>v.versions.filter(x=>x.kind==='agent').length)`);
  const step=async(n,from,to)=>read(`(async()=>{if(!await flushSave())throw Error('SAVE');for(let i=0;i<100&&(runtime.saveTimer||runtime.saveRequests);i++)await new Promise(r=>setTimeout(r,30));const c=agentProjectContext(),meta={id:'ai_${n}_'+Date.now(),runId:'run_smoke',step:${n},actor:'ai',at:new Date().toISOString(),revision:project.revision};
   if(${n}===1)await versionBeforeAgent();
   const p=MontClipProposal.prepare({type:'keep_ranges',output_mode:'one_file',ranges:[(()=>{const v=project.clips.find(c=>c.kind==='video');return{clipId:v.id,from:v.in+${from},to:v.in+Math.min(${to},v.duration)};})()]},{doc:projectJSON(),context:{...c,generation:c.gen},references:[]});
   const ev=recordAgentEvent(MontClipProposal.event(p,meta));p.eventId=ev.id;
   await showSentenceSelection(p);const d=document.querySelector('.sentence-dialog[open]');if(!d)throw Error('NO_DIALOG step ${n}');
   d.querySelector('[data-apply]').click();if(!await flushSave())throw Error('SAVE');return eventLog().get(ev.id);})()`);
  const before=await read('JSON.stringify(project.clips)');
  const s1=await step(1,0,30),s2=await step(2,0,10);
  report.run={states:[s1.state,s2.state],revisions:[[s1.revisionBefore,s1.revisionAfter],[s2.revisionBefore,s2.revisionAfter]]};
  assert.deepEqual(report.run.states,['applied','applied']);
  report.agentVersions=(await read(`fetch('/api/versions').then(r=>r.json()).then(v=>v.versions.filter(x=>x.kind==='agent').length)`))-versionsBefore;
  assert.ok(report.agentVersions>=1,'an agent version before the run');
  const undone=await read(`(()=>{const r=undoRun('run_smoke');return{r,states:eventLog().list().filter(e=>e.runId==='run_smoke').map(e=>e.state)};})()`);
  report.undoRun=undone;assert.equal(undone.r.ok,true);assert.deepEqual(undone.states,['undone','undone']);
  assert.equal(await read('JSON.stringify(project.clips)'),before,'back to the timeline before the run');
  // 3. a run with the streamer's edit after it: refused, nothing undone
  const r3=await step(3,0,20);
  await read(`(()=>{pushUndo();project.clips[0].duration-=1;scheduleSave();return true;})()`);
  const blocked=await read(`(()=>{const depth=runtime.undo.length,r=undoRun('run_smoke');return{r,same:runtime.undo.length===depth,state:eventLog().get(${JSON.stringify(r3.id)}).state};})()`);
  report.interleaved=blocked;assert.equal(blocked.r.code,'RUN_INTERLEAVED');assert.ok(blocked.same);assert.equal(blocked.state,'applied');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1200);}
 finally{out(ok?'EVENTS_PASS':'EVENTS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
