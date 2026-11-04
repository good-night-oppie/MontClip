'use strict';
// Development-only check of what actually goes to DeepSeek (QQ via DD and Deja, 2026-11-04), in the real pane: own fresh
// profile, hidden offscreen window, a synthetic project and a synthetic key, and no network — the main process's fetch to
// api.deepseek.com is answered here with a synthetic reply, and its request (address, body, header names) is kept.
//   1. the first send shows the 「AI 数据说明」 first (MONTCLIP_SMOKE_NOTICE=show), naming api.deepseek.com; read, it is not
//      shown again; then the review box, naming api.deepseek.com; nothing is sent before the review's 〔发送〕
//   2. what is sent with a plain instruction: her words and the timeline's numbers and clip ids — no caption text, no
//      danmaku text, no file names or paths
//   3. a subtitle she quotes (〔让 AI 看〕) is sent, and only then
//   4. Yolo with a session approval does not skip the review box
//   5. the reply is marked 「AI 生成」
// Prints OUTGOING_PASS {…} (with the captured bodies, the key replaced) or OUTGOING_FAIL.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
process.env.MONTCLIP_SMOKE_NOTICE='show';
const KEY='sk-synthetic-outgoing-'+Date.now().toString(36);
const CAPTION='第一句是合成字幕原文', DANMAKU='合成弹幕原文不该发出', FILE='合成素材名字.mp4';
// the main process's fetch: the local service as usual; DeepSeek answered here; anything else is a failure
const sent=[],elsewhere=[],realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{const u=String(url);
 if(/^http:\/\/127\.0\.0\.1:/.test(u))return realFetch(url,opts);
 if(u.startsWith('https://api.deepseek.com/')){const h=opts.headers||{};sent.push({url:u,method:opts.method,headers:Object.keys(h).sort(),auth:h.Authorization==='Bearer '+KEY,body:JSON.parse(opts.body)});
  return new Response(JSON.stringify({choices:[{message:{content:'这是合成回复，只用于测试。'}}]}),{status:200,headers:{'Content-Type':'application/json'}});}
 elsewhere.push(u);throw Error('NETWORK');};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const until=async(js,ms=8000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(js))return true;await wait(100);}return false;};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`updateMontClipView({language:'zh-CN'});true`);
  // a synthetic project: one shot, two subtitles, a danmaku line with text
  await read(`(async()=>{const doc=JSON.parse(JSON.stringify(project));doc.media=[{id:'m_syn',name:${JSON.stringify(FILE)},kind:'video',src:'/media/'+${JSON.stringify(FILE)},duration:20,width:640,height:360}];
   doc.clips=[{id:'c_v1',mediaId:'m_syn',kind:'video',track:'V1',start:0,in:0,duration:20,props:{volume:0}},
    {id:'cap1',kind:'text',mediaId:null,track:'V2',start:1,in:0,duration:3,props:{text:${JSON.stringify(CAPTION)},caption:true}},
    {id:'cap2',kind:'text',mediaId:null,track:'V2',start:5,in:0,duration:3,props:{text:'第二句合成字幕',caption:true}}];
   doc.danmaku=[{t:2,text:${JSON.stringify(DANMAKU)},user:'合成观众'}];applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  assert.equal((await read(`montclipAgentService.configure({provider:'deepseek',model:'synthetic-flash-model',apiKey:${JSON.stringify(KEY)}})`)).configured,true);
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait(400);
  const draft=async(text)=>{await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();};
  const send=()=>read(`document.querySelector('.cindy-send button').click();true`);
  const reviewOpen=`!!document.querySelector('.cindy-confirm:not([data-data-notice])[open]')`,noticeOpen=`!!document.querySelector('[data-data-notice][open]')`;
  const out={};
  // 1. the notice first, once
  await draft('只保留第一句');await send();
  assert.ok(await until(noticeOpen),'the 「AI 数据说明」 shows before the first send');
  out.notice=await read(`({title:document.querySelector('[data-data-notice] h3').textContent,body:document.querySelector('[data-data-notice-body]').textContent})`);
  // JJ's words (test/agent-seed.test.js locks each line); one button, and it is not a yes to sending
  assert.equal(out.notice.title,'用 AI 之前，先说清楚这几件事');
  assert.match(out.notice.body,/^发给谁：DeepSeek（api\.deepseek\.com），数据存在中国境内。/);assert.match(out.notice.body,/会不会被拿去训练：可能会。/);assert.match(out.notice.body,/不用 AI，剪辑照常能用。$/);
  assert.deepEqual(await read(`[...document.querySelectorAll('[data-data-notice] button')].map(b=>b.textContent)`),['我知道了'],'one button only');
  assert.equal(await read(reviewOpen),false);assert.equal(sent.length,0,'nothing sent before the notice is read');
  await read(`document.querySelector('[data-data-notice-ok]').click();true`);
  assert.ok(await until(reviewOpen),'then the review box');
  out.review=await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] p').textContent`);
  assert.match(out.review,/api\.deepseek\.com/);assert.equal(sent.length,0,'nothing sent before the review');
  out.noticeKept=(await read('montclipAgentService.noticeGet()')).accepted;assert.equal(out.noticeKept,true);
  // 2. a plain instruction
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button').click();true`);
  assert.ok(await until(`document.querySelectorAll('.cindy-message.assistant').length>=1`),'a reply');
  assert.equal(sent.length,1);
  out.plain=sent[0];
  const plainText=JSON.stringify(out.plain.body);
  for(const leak of [CAPTION,DANMAKU,'合成观众',FILE,'/media/',KEY])assert.equal(plainText.includes(leak),false,'the plain request holds '+leak);
  assert.equal(out.plain.auth,true);
  // 5. the reply says it is AI-made
  out.aiLabel=await read(`document.querySelector('.cindy-message.assistant [data-ai-generated]')?.textContent||null`);assert.equal(out.aiLabel,'AI 生成');
  // 3. a quoted subtitle goes, and only then; the notice is not shown again
  await read(`setSelection(['cap1']);true`);await wait();
  await read(`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent==='让 AI 看').click();true`);await wait();
  await draft('这一句保留');await send();
  assert.ok(await until(reviewOpen),'the review box again');assert.equal(await read(noticeOpen),false,'the notice is not shown twice');
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button').click();true`);
  assert.ok(await until(`document.querySelectorAll('.cindy-message.assistant').length>=2`));
  out.quoted=sent[1];const quotedText=JSON.stringify(out.quoted.body);
  assert.equal(quotedText.includes(CAPTION),true,'the quoted subtitle is sent');
  for(const leak of [DANMAKU,'合成观众',FILE,'/media/',KEY])assert.equal(quotedText.includes(leak),false,'the quoted request holds '+leak);
  // 4. Yolo, with this chat's approvals: the review box still comes first
  process.env.MONTCLIP_SMOKE_YOLO_CONSENT='1';
  await read(`document.querySelector('[data-mode="yolo"]')?.click();true`);await wait(400);
  out.yoloMode=await read('typeof agentPolicy!=="undefined"?agentPolicy.mode:null');
  await draft('再看一次');await send();
  assert.ok(await until(reviewOpen),'Yolo: the review box still shows');assert.equal(sent.length,2,'Yolo: nothing sent before the review');
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button:last-child').click();true`);await wait();
  assert.equal(sent.length,2,'cancelled: nothing sent');
  assert.deepEqual(elsewhere,[],'no other address was asked');
  const all=JSON.stringify({out,elsewhere});assert.equal(all.includes(KEY),false);
  const shown=JSON.parse(all);for(const k of ['plain','quoted']){shown.out[k].body.messages=shown.out[k].body.messages.map(m=>({role:m.role,content:m.content.length>600?m.content.slice(0,300)+' …['+m.content.length+' chars]… '+m.content.slice(-300):m.content}));}
  process.stdout.write('OUTGOING_PASS '+JSON.stringify(shown.out)+'\n');
 }catch(e){process.stdout.write('OUTGOING_FAIL '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true}});}}};}return load.call(this,id,...args);};}
require('./main');
