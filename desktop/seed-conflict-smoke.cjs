'use strict';
// Hidden window, fresh profile, synthetic credentials only. Proves the startup conflict is visible and cannot send.
const electron=require('electron'),{app,BrowserWindow}=electron;
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),a=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const seedDir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-conflict-smoke-'));
const Seed=require('./agent-seed'),seed=path.join(seedDir,Seed.SEED_NAME);
fs.writeFileSync(seed,Seed.seedText({model:'synthetic-model',apiKey:'synthetic-package-key'}));
process.env.MONTCLIP_SEED_FILE=seed;
let requests=0;global.fetch=async()=>{requests++;throw Error('Synthetic transport only');};
const Service=require('./agent-service'),create=Service.createDiskService;
Service.createDiskService=(...args)=>{const svc=create(...args);a.equal(svc.configure({provider:'deepseek',model:'synthetic-model',apiKey:'synthetic-existing-key'}).ok,true);return svc;};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 let ok=false;
 try{
  await original.apply(this,args);
  const read=s=>this.webContents.executeJavaScript(s);
  const until=async expression=>{for(let i=0;i<100;i++){if(await read(expression))return true;await new Promise(r=>setTimeout(r,50));}return false;};
  a.ok(await until('state.connected'));
  const cfg=await read('montclipAgentService.get()');
  a.equal(cfg.configured,false);a.equal(cfg.code,'SEED_CONFLICT');a.ok(fs.existsSync(seed));
  for(const lang of ['zh-CN','en']){
   await read(`updateMontClipView({language:${JSON.stringify(lang)}});setSideTab('assistant');mcAgent.render();true`);
   a.ok(await until("!!document.querySelector('.cindy-port')"));
   if(!await read("!!document.querySelector('.cindy-config')"))await read("[...document.querySelectorAll('.agent-toolbar button')].find(b=>['AI 服务','AI service'].includes(b.textContent)).click();true");
   a.ok(await until("!!document.querySelector('[data-connection-status]')"));
   const ui=await read(`(()=>{const p=document.querySelector('.cindy-config'),t=MontClipView.text[${JSON.stringify(lang)}];return {status:p.querySelector('[data-connection-status]').textContent,expected:t.officialPane_seedConflict,ready:t.officialPane_configured,remove:!!p.querySelector('[data-remove-connection]'),saveDisabled:p.querySelector('button').disabled};})()`);
   a.ok(ui.expected);a.equal(ui.status,ui.expected);a.notEqual(ui.status,ui.ready);a.equal(ui.remove,true);a.equal(ui.saveDisabled,true);
  }
  a.equal((await read("montclipAgentService.send({version:1,requestId:'blocked',projectId:'p',sequenceId:null,revision:0,gen:0,messages:[{role:'user',content:'synthetic'}]})")).code,'SEED_CONFLICT');
  a.equal(requests,0);
  await read("document.querySelector('[data-remove-connection]').click();true");
  a.ok(await until("!!document.querySelector('[data-remove-dialog][open]')"));
  await read("document.querySelector('[data-remove-confirm]').click();true");
  a.ok(await until("montclipAgentService.get().then(v=>!v.configured&&v.code===null)"));
  a.ok(fs.existsSync(seed),'explicit removal leaves the seed available for next launch');
  ok=true;process.stdout.write('SEED_CONFLICT_PASS '+JSON.stringify({languages:2,configured:false,requests,removalAvailable:true,recoverySeedKept:true})+'\n');
 }catch(e){process.stdout.write('SEED_CONFLICT_FAIL '+String(e?.stack||e)+'\n');}
 finally{fs.rmSync(seedDir,{recursive:true,force:true});setTimeout(()=>app.exit(ok?0:1),100);}
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true}});}}};}return load.call(this,id,...args);};}
require('./main');
