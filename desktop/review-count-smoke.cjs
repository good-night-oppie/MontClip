'use strict';
// The review before anything goes out is right from its first frame (Deja, 2026-11-04, from the Meta hackathon
// recording: the box opened one frame before its content, reading "0 quoted subtitles, 0 earlier messages"). Two
// subtitles quoted, send: the text the box shows at the very moment it opens must say 2 — "2 quoted subtitles" in
// English, 「引用的 2 条字幕」 in Chinese — and list the message. Synthetic subtitles, a made-up key; nothing is sent
// (the box is cancelled). Hidden offscreen window, fresh profile.
//   electron desktop/review-count-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// Prints REVIEW_COUNT_PASS / REVIEW_COUNT_FAIL with what the box said.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const service=require('./agent-service'),originalService=service.createDiskService;let sent=0;
service.createDiskService=(...args)=>{const real=originalService(...args);return{...real,async send(){sent++;return{ok:false,code:'CANCELLED'};}};};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=250)=>new Promise(r=>setTimeout(r,ms));
 const report={};let ok=false;
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  win.setContentSize(1280,800);await wait(400);
  assert.equal((await read(`montclipAgentService.configure({provider:'openai',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`)).configured,true);
  await read(`(async()=>{const cues=MontClipCaptions.parse('1\\n00:00:00,000 --> 00:00:03,000\\nHi, here are three quick editing tips.\\n\\n2\\n00:00:03,000 --> 00:00:05,000\\nUm, I got that wrong, cut this.\\n\\n3\\n00:00:05,000 --> 00:00:10,000\\nTip one: cut the pauses.\\n');project.clips=cues.map((c,i)=>MontClipCaptions.clip(c,{id:'rc_c'+i,track:'V2'}));rebuildClips();scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  for(const lang of ['en','zh-CN']){
   const T=`MontClipView.text[${JSON.stringify(lang)}]`;
   await read(`updateMontClipView({language:${JSON.stringify(lang)}});setSideTab('assistant');mcAgent.render();true`);await wait(400);
   await read(`(()=>{const b=Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${T}.officialPane_new);if(b)b.click();return true;})()`);await wait(300);
   await read(`setSelection(['rc_c0','rc_c2']);true`);await wait(200);
   assert.ok(await read(`(()=>{const b=Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${T}.officialPane_reference);if(!b)return false;b.click();return true;})()`),'quote button');await wait(300);
   await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Keep only these two sentences');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await wait(300);
   // what the box says at the moment it opens: read from the observer, before any later render
   await read(`(()=>{window.__firstOpen=null;const d=document.querySelector('.cindy-confirm');const o=new MutationObserver(()=>{if(d.open&&!window.__firstOpen){window.__firstOpen={summary:d.querySelector('[data-review-summary]')?.textContent||'',listed:d.textContent.includes('Tip one: cut the pauses.')};o.disconnect();}});o.observe(d,{attributes:true,attributeFilter:['open']});document.querySelector('.cindy-send button').click();return true;})()`);
   await wait(900);
   const first=await read('window.__firstOpen'),later=await read(`document.querySelector('.cindy-confirm[open]')?.querySelector('[data-review-summary]')?.textContent||null`);
   report[lang]={first,later};
   assert.ok(first,'the box opened');
   assert.ok(lang==='en'?first.summary.includes('2 quoted subtitles'):first.summary.includes('引用的 2 条字幕'),lang+' at first frame: '+first.summary);
   assert.equal(first.listed,true,'the message and its quotes are in the box from its first frame');
   assert.equal(later,first.summary,'and it does not change after');
   await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');const c=[...d.querySelectorAll('button')].find(b=>b.textContent===${T}.officialPane_cancel);(c||d).click?.();if(d.open)d.close();return true;})()`);await wait(300);
  }
  assert.equal(sent,0,'nothing was sent');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,800);}
 finally{process.stdout.write((ok?'REVIEW_COUNT_PASS ':'REVIEW_COUNT_FAIL ')+JSON.stringify(report)+'\n');process.exitCode=ok?0:1;app.exit(ok?0:1);}
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
