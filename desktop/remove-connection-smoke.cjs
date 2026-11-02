'use strict';
// Development-only check of 「删除这个连接」 in the real pane: own fresh profile, hidden offscreen window, no network
// (the only request tried is refused before any network call because nothing is configured any more).
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length),file=path.join(profile,'agent-connection-v1.json');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait();
  const lang=await read(`document.documentElement.lang==='en'?'en':'zh-CN'`),T=await read(`(()=>{const t=MontClipView.text[${JSON.stringify(lang)}];return{remove:t.officialPane_removeConnection,confirm:t.officialPane_removeConfirm,removed:t.officialPane_connectionRemoved,unconfigured:t.officialPane_unconfigured,config:t.officialPane_config};})()`);
  const openConfig=`(()=>{const b=Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(T.config)});b.click();return true;})()`;
  // nothing saved: no button
  await read(openConfig);await wait();
  assert.equal(await read(`!!document.querySelector('[data-remove-connection]')`),false,'no remove button before anything is saved');
  assert.equal((await read(`montclipAgentService.configure({provider:'deepseek',model:'synthetic-model',apiKey:'synthetic-key'})`)).ok,true);
  assert.ok(fs.existsSync(file));
  await read(openConfig);await wait();await read(openConfig);await wait();// close and reopen: the pane reads the saved state
  assert.equal(await read(`document.querySelector('[data-remove-connection]')?.textContent`),T.remove);
  // the button only asks
  await read(`document.querySelector('[data-remove-connection]').click();true`);await wait();
  assert.equal(await read(`document.querySelector('[data-remove-dialog]').open`),true);
  assert.equal(await read(`document.querySelector('[data-remove-dialog] p').textContent`),T.confirm);
  await read(`document.querySelector('[data-remove-cancel]').click();true`);await wait();
  assert.equal(await read(`document.querySelector('[data-remove-dialog]').open`),false);
  assert.ok(fs.existsSync(file),'cancel keeps the connection');
  process.stdout.write('REMOVE_CANCEL kept\n');
  // confirm
  await read(`document.querySelector('[data-remove-connection]').click();true`);await wait();
  await read(`document.querySelector('[data-remove-confirm]').click();true`);await wait(400);
  assert.equal(fs.existsSync(file),false,'connection file removed');
  assert.deepEqual(fs.readdirSync(profile).filter(n=>n.startsWith('agent-connection')),[]);
  assert.equal(await read(`document.querySelector('.cindy-port [role=status]:not(:empty)')?.textContent||Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join('|')`).then(s=>s.includes(T.removed)),true,'removed notice shown');
  assert.equal(await read(`Array.from(document.querySelectorAll('.cindy-config p')).some(p=>p.textContent===${JSON.stringify(T.unconfigured)})`),true,'shows not configured');
  assert.equal(await read(`!!document.querySelector('[data-remove-connection]')`),false,'button gone');
  const sent=await read(`montclipAgentService.send({version:1,requestId:'after-remove',projectId:'p',sequenceId:null,revision:0,gen:0,messages:[{role:'user',content:'hello'}]})`);
  assert.equal(sent.code,'UNCONFIGURED','sending is refused after removal');
  await win.webContents.capturePage();// the app's own page only, never the screen; not written to disk
  process.stdout.write('REMOVE_COMPLETE '+JSON.stringify({lang,fileGone:true,send:sent.code})+'\n');
 }catch(e){process.stdout.write('REMOVE_FAIL '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
