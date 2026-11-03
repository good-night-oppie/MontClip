'use strict';
// Deja (11-03, #51): a fresh profile, no key. Open the assistant's settings (OpenRouter preselected), close them, and
// over the whole run — start, settings open, settings closed, a quiet wait — count every request that leaves the
// machine: each one any session of the main process sees (main.js's own filter on persist:montclip is wrapped, other
// sessions get a logging filter), and each one the main process itself starts (fetch, http, https, Electron's net).
// Local ones (127.0.0.1, blob:, data:, devtools:) are counted apart. Both outside counts must be 0.
// Hidden offscreen window; no key, no clipboard, no screenshot.
//   electron desktop/agent-no-key-network-smoke.cjs --montclip-smoke --user-data-dir=<fresh dir>
const electron=require('electron'),{app,BrowserWindow,session}=electron,assert=require('node:assert/strict');
const http=require('node:http'),https=require('node:https');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const LOCAL=/^(https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/|blob:|data:|devtools:|chrome-extension:|chrome:|about:)/;
const seen=[],outbound=[],short=u=>String(u).slice(0,200);
// 1. the sessions: wrap whichever filter is registered, so every request is logged with no change to what is decided
const watched=new WeakSet();
function watch(ses,name){
  if(!ses||watched.has(ses))return;watched.add(ses);
  const wr=ses.webRequest,on=wr.onBeforeRequest.bind(wr);
  wr.onBeforeRequest=(a,b)=>{const listener=typeof a==='function'?a:b,filter=typeof a==='function'?null:a;
    const log=(d,cb)=>{seen.push({session:name,url:short(d.url)});return listener(d,cb);};
    return filter?on(filter,log):on(log);};
  wr.onBeforeRequest((d,cb)=>cb({}));   // logs until the app registers its own filter, which then is wrapped too
}
app.on('session-created',(ses)=>watch(ses,ses===session.defaultSession?'default':'partition'));
const fromPartition=session.fromPartition.bind(session);
session.fromPartition=(p,...r)=>{const ses=fromPartition(p,...r);watch(ses,p);return ses;};
// 2. the main process itself
for(const [name,mod] of [['http',http],['https',https]])for(const k of ['request','get']){const o=mod[k];
  mod[k]=function(...a){const x=a[0],u=typeof x==='string'||x instanceof URL?String(x):x?(x.protocol||name+':')+'//'+(x.hostname||x.host||'')+(x.port?':'+x.port:'')+'/':'';
    if(!LOCAL.test(u))outbound.push(name+' '+short(u));return o.apply(this,a);};}
const realFetch=globalThis.fetch;
globalThis.fetch=(i,...r)=>{const u=String(i&&i.url||i);if(!LOCAL.test(u))outbound.push('fetch '+short(u));return realFetch(i,...r);};
const net={};for(const k of ['request','fetch'])net[k]=(i,...r)=>{const u=String(i&&i.url||i);if(!LOCAL.test(u))outbound.push('net '+short(u));return electron.net[k](i,...r);};

const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);await wait();
  const before=await read(`montclipAgentService.get()`);
  assert.equal(before.configured,false,'a fresh profile has no connection');assert.equal(before.provider,'openrouter','OpenRouter preselected');
  // open the assistant, then its settings
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait();
  await read(`(()=>{const b=Array.from(document.querySelectorAll('.cindy-port button')).find(b=>['AI 服务','AI service'].includes(b.textContent));if(!b)throw Error('NO_SETTINGS_BUTTON');b.click();})()`);await wait(400);
  const open=await read(`(()=>{const c=document.querySelector('.cindy-config');return c&&{select:c.querySelector('select')&&c.querySelector('select').value,inputs:c.querySelectorAll('input').length};})()`);
  assert.ok(open&&open.select==='openrouter','the settings are open with OpenRouter selected '+JSON.stringify(open));
  await wait(1500);   // anything the settings might fetch on opening
  // close them (Escape, as a person would)
  await read(`(()=>{const e=document.querySelector('.cindy-config input');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));})()`);await wait(400);
  assert.equal(await read(`!!document.querySelector('.cindy-config')`),false,'the settings are closed');
  await wait(1500);
  const after=await read(`montclipAgentService.get()`);assert.equal(after.configured,false,'still no connection');
  const external=seen.filter(r=>!LOCAL.test(r.url));
  assert.deepEqual(external,[],'outside requests through the sessions');
  assert.deepEqual(outbound,[],'outside requests from the main process');
  process.stdout.write('AGENT_NO_KEY_NETWORK_PASS '+JSON.stringify({provider:before.provider,configured:after.configured,settings:open,sessionRequests:seen.length,local:seen.length-external.length,external:external.length,mainProcess:outbound.length})+'\n');
 }catch(e){process.stdout.write('AGENT_NO_KEY_NETWORK_FAIL '+(e&&e.stack||e)+' '+JSON.stringify({external:seen.filter(r=>!LOCAL.test(r.url)).slice(0,10),outbound:outbound.slice(0,10)})+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken. Every require('electron') gets it, and net goes
// through the counter above.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron')return{...electron,net:{...electron.net,...net},BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};return load.call(this,id,...args);};}
require('./main');
