'use strict';
// project.danmaku survives the editor (Deja 2026-11-03: danmaku was lost on load). Fresh profile, hidden offscreen window,
// synthetic data. project.json is written with danmaku (every field, Chinese text), the editor loads it: the page has
// it, the highlight signals read it, an edit by hand is saved and project.json still has every entry and field; a new
// project opened after it has none (nothing left over).
//   electron desktop/danmaku-keep-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → DANMAKU_KEEP_PASS / DANMAKU_KEEP_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const DANMAKU=[{t:2},{t:3.5,text:'哈哈哈',color:16777215,mode:1,sent:1730550000000},{t:4,text:'好听',mode:5}];
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'弹幕 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
  // project.json written from outside with danmaku, then loaded by the editor
  const loaded=await read(`(async()=>{const doc=await fetch('/api/project').then(r=>r.json());doc.danmaku=${JSON.stringify(DANMAKU)};doc.revision=(doc.revision||0)+1;
   doc.clips=[{id:'t1',kind:'text',mediaId:null,track:'V2',start:0,in:0,duration:10,props:{text:'x'}}];
   const put=await fetch('/api/project',{method:'PUT',headers:{'X-FableCut-Project':runtime.projectId},body:JSON.stringify(doc)});if(!put.ok)throw Error('PUT '+put.status);
   for(let i=0;i<100&&project.revision!==doc.revision;i++){await syncFromServer();await new Promise(r=>setTimeout(r,50));}
   const sig=await highlightSignals();return{inPage:project.danmaku,signals:sig&&sig.danmaku.length};})()`);
  report.loaded=loaded;assert.deepEqual(loaded.inPage,DANMAKU,'the page has every entry and field');assert.equal(loaded.signals,3,'the highlight signals read them');
  const saved=await read(`(async()=>{pushUndo();project.clips[0].duration=9;scheduleSave();if(!await flushSave())throw Error('SAVE');return (await fetch('/api/project').then(r=>r.json())).danmaku;})()`);
  report.saved=saved;assert.deepEqual(saved,DANMAKU,'project.json still has them after the editor saved');
  const next=await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'没有弹幕',open:true});if(!await syncFromServer(true))throw Error('CREATE');return project.danmaku;})()`);
  report.nextProject=next;assert.equal(next,null,'a project without danmaku has none');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1200);}
 finally{out(ok?'DANMAKU_KEEP_PASS':'DANMAKU_KEEP_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
