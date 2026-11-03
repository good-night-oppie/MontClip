'use strict';
// Development-only fault injection, confined to a fresh caller-owned profile.
const {app,BrowserWindow,dialog}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.ok(process.argv.includes('--montclip-smoke'));
const profile=process.argv.find(a=>a.startsWith('--user-data-dir=')).slice(16);
const file=path.join(profile,'agent-sessions-v1.json'),fault=process.env.MONTCLIP_SESSION_FAULT;
assert.ok(['json','schema','read','project','write'].includes(fault));
assert.ok(!fs.existsSync(file),'fresh profile required');
const initial=fault==='schema'?'{}':'{bad JSON';
const hash=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
const initialHash=hash(initial);let projectProof=null;
if(fault==='read')fs.mkdirSync(file);else if(fault!=='write')fs.writeFileSync(file,initial,{flag:'wx'});
if(fault==='write'){
 const open=fs.openSync;fs.openSync=function(p,...args){if(typeof p==='string'&&p.startsWith(file+'.'))throw Object.assign(Error('synthetic write failure'),{code:'EACCES'});return open.call(this,p,...args);};
}
let prompts=0,checked=false;
dialog.showMessageBox=async(win,options)=>{
 assert.ok(fault==='project'||fault==='write','temporary mode must not prompt');
 assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);assert.equal(options.buttons.length,2);
 prompts++;assert.ok(prompts<=2);
 if(prompts===1){const r=await win.webContents.executeJavaScript('({responses:window.__proofResponses,failed:runtime.saveFailed})');assert.ok(r.responses.some(x=>x.status===400&&/rename/.test(x.error)));assert.equal(r.failed,true);process.stdout.write('MONTCLIP_REAL_SAVE_FAILURE '+JSON.stringify(r)+'\n');}
 if(prompts===1)setTimeout(()=>{assert.ok(!win.isDestroyed());win.close();},100);
 return{response:prompts===1?0:1};
};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read(`(async()=>{const end=Date.now()+15000;while(!state.connected&&Date.now()<end)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');await pjLoad();if(!runtime.projectId)throw Error('IDENTITY_MISSING');setSideTab('assistant');mcAgent.render();const d=document.querySelector('[data-draft]');d.value='Synthetic temporary draft';d.dispatchEvent(new Event('input'));document.querySelector('[data-action=new]').click();d.value='Second retained draft';d.dispatchEvent(new Event('input'));document.querySelector('[data-action=projectRef]').click();document.querySelector('[data-sessions] button').click();if(d.value!=='Synthetic temporary draft')throw Error('DRAFT_LOST');document.getElementById('btnTitle').click();if(!await flushSave())throw Error('PROJECT_SETUP_FAILED');})()`);
 const state=await read(`({notice:document.querySelector('[data-local]').textContent,retryHidden:document.querySelector('[data-action=retry]').hidden,assistantFlush:mcAgent.flush()})`);
 assert.equal(state.assistantFlush,fault!=='write');assert.equal(state.retryHidden,fault!=='write');

 const projectFile=path.join(profile,'workspace','project.json');
 const projectBytes=fs.readFileSync(projectFile),disk=JSON.parse(projectBytes);
 assert.ok(disk.clips.length>0);assert.ok(disk.revision>0);
 projectProof={savedRevision:disk.revision,savedClips:disk.clips.length,savedHash:hash(projectBytes)};
 assert.ok(state.notice.includes('关闭前请复制'));assert.equal(state.retryHidden,true);
 if(fault==='project'){
  fs.renameSync(projectFile,projectFile+'.owned-proof-backup');
  fs.mkdirSync(projectFile);
  await read(`(()=>{const real=window.fetch;window.__proofResponses=[];window.fetch=async(...args)=>{const r=await real(...args);if(String(args[0])==='/api/project'&&args[1]?.method==='PUT'){const body=await r.clone().json();window.__proofResponses.push({status:r.status,error:body.error});}return r;};document.getElementById('btnTitle').click();return true;})()`);
 }

 win.once('closed',()=>{
  try{
   assert.equal(prompts,fault==='project'||fault==='write'?2:0);
   if(fault==='read')assert.ok(fs.statSync(file).isDirectory());else if(fault!=='write')assert.equal(fs.readFileSync(file,'utf8'),initial);else assert.equal(fs.existsSync(file),false);
   if(fault==='project'){assert.equal(hash(fs.readFileSync(projectFile+'.owned-proof-backup')),projectProof.savedHash);assert.ok(fs.statSync(projectFile).isDirectory());}
   checked=true;process.stdout.write('MONTCLIP_SESSION_CLOSE_COMPLETE '+JSON.stringify({fault,prompts,defaultWait:prompts>0,explicitForce:prompts>0,originalPreserved:true,badFileBefore:initialHash,badFileAfter:hash(fs.readFileSync(file)),projectProof,...state})+'\n');
  }catch(e){process.exitCode=1;console.error(e);}
 });
 win.close();
 // Leave start pending: the normal smoke's bypass-close path must not run.
 await new Promise(()=>{});
};
app.on('will-quit',()=>{if(!checked)process.exitCode=1;});
setTimeout(()=>{if(!checked){console.error('SESSION_CLOSE_TIMEOUT');app.exit(1);}},20000).unref();
require(path.join(process.env.MONTCLIP_TEST_ROOT,'desktop/main.js'));
