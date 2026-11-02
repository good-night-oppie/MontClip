'use strict';
// Development-only fault injection, confined to a fresh caller-owned profile.
const {app,BrowserWindow,dialog}=require('electron');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.ok(process.argv.includes('--montclip-smoke'));
const profile=process.argv.find(a=>a.startsWith('--user-data-dir=')).slice(16);
const file=path.join(profile,'agent-sessions-v1.json'),fault=process.env.MONTCLIP_SESSION_FAULT;
assert.ok(['json','schema','read','project','write'].includes(fault));
assert.ok(!fs.existsSync(file),'fresh profile required');
const initial=fault==='schema'?'{}':'{bad JSON';
if(fault==='read')fs.mkdirSync(file);else if(fault!=='write')fs.writeFileSync(file,initial,{flag:'wx'});
if(fault==='write'){
 const open=fs.openSync;fs.openSync=function(p,...args){if(typeof p==='string'&&p.startsWith(file+'.'))throw Object.assign(Error('synthetic write failure'),{code:'EACCES'});return open.call(this,p,...args);};
}
let prompts=0,checked=false;
dialog.showMessageBox=async(win,options)=>{
 assert.ok(fault==='project'||fault==='write','temporary mode must not prompt');
 assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);assert.equal(options.buttons.length,2);
 prompts++;assert.ok(prompts<=2);
 if(prompts===1)setTimeout(()=>{assert.ok(!win.isDestroyed());win.close();},100);
 return{response:prompts===1?0:1};
};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read(`(async()=>{const end=Date.now()+15000;while(!state.connected&&Date.now()<end)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');await pjLoad();if(!runtime.projectId)throw Error('IDENTITY_MISSING');setSideTab('assistant');mcAgent.render();const d=document.querySelector('[data-draft]');d.value='Synthetic temporary draft';d.dispatchEvent(new Event('input'));document.querySelector('[data-action=new]').click();d.value='Second retained draft';d.dispatchEvent(new Event('input'));document.querySelector('[data-action=projectRef]').click();document.querySelector('[data-sessions] button').click();if(d.value!=='Synthetic temporary draft')throw Error('DRAFT_LOST');document.getElementById('btnTitle').click();if(!await flushSave())throw Error('PROJECT_SETUP_FAILED');})()`);
 const state=await read(`({notice:document.querySelector('[data-local]').textContent,retryHidden:document.querySelector('[data-action=retry]').hidden,assistantFlush:mcAgent.flush()})`);
 assert.equal(state.assistantFlush,fault!=='write');assert.equal(state.retryHidden,fault!=='write');
 if(fault==='project')await read(`(()=>{const real=window.fetch;window.fetch=(url,opts)=>String(url)==='/api/project'&&opts?.method==='PUT'?Promise.resolve(new Response('{}',{status:503})):real(url,opts);document.getElementById('btnTitle').click();return true;})()`);
 win.once('closed',()=>{
  try{
   assert.equal(prompts,fault==='project'||fault==='write'?2:0);
   if(fault==='read')assert.ok(fs.statSync(file).isDirectory());else if(fault!=='write')assert.equal(fs.readFileSync(file,'utf8'),initial);else assert.equal(fs.existsSync(file),false);
   checked=true;process.stdout.write('MONTCLIP_SESSION_CLOSE_COMPLETE '+JSON.stringify({fault,prompts,defaultWait:prompts>0,explicitForce:prompts>0,originalPreserved:true,...state})+'\n');
  }catch(e){process.exitCode=1;console.error(e);}
 });
 win.close();
 // Leave start pending: the normal smoke's bypass-close path must not run.
 await new Promise(()=>{});
};
app.on('will-quit',()=>{if(!checked)process.exitCode=1;});
setTimeout(()=>{if(!checked){console.error('SESSION_CLOSE_TIMEOUT');app.exit(1);}},20000).unref();
require('./main');
