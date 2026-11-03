'use strict';
// The desktop app (fresh profile, hidden offscreen window): 「+ 网址」 is not shown and the service still refuses a URL
// import (403 NETWORK_DISABLED); the sentence button reads 按句选段 in Chinese and Select sentences in English, follows a
// language switch, and is hit at its centre.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  assert.equal(await read(`!!window.montclipViewSettings`),true,'the desktop preload is there');
  const url=await read(`(()=>{const b=document.getElementById('btnImportUrl');return{exists:!!b,shown:!!b&&b.getClientRects().length>0,hidden:!!b&&b.hidden};})()`);
  assert.deepEqual(url,{exists:true,shown:false,hidden:true},'+ URL is not shown in the desktop app');
  const refused=await read(`fetch('/api/import-url',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/a.mp4'})}).then(async r=>({status:r.status,code:(await r.json()).code}))`);
  assert.deepEqual(refused,{status:403,code:'NETWORK_DISABLED'},'the service still refuses');
  const label=async()=>read(`(async()=>{setSideTab('transcript');await new Promise(r=>setTimeout(r,300));const b=document.querySelector('[data-tr-sentences]'),r=b.getBoundingClientRect(),t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{text:b.textContent,hit:!!t&&(t===b||b.contains(t))};})()`);
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait();
  const zh=await label();
  assert.deepEqual(zh,{text:'按句选段',hit:true});
  await read(`updateMontClipView({language:'en'});true`);await wait();
  const en=await label();
  assert.deepEqual(en,{text:'Select sentences',hit:true},'follows the language switch');
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait();
  assert.equal((await label()).text,'按句选段','and back');
  process.stdout.write('URL_SENTENCE_COMPLETE '+JSON.stringify({url,refused,zh,en})+'\n');
 }catch(e){process.stdout.write('URL_SENTENCE_FAIL '+(e&&e.stack)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
