'use strict';
// Development-only check of what actually goes to DeepSeek (QQ via DD and Deja, 2026-11-04), in the real pane: own fresh
// profile, hidden offscreen window, a synthetic project and a synthetic key, and no network — the main process's fetch to
// api.deepseek.com is answered here with a synthetic reply, and its request (address, body, header names) is kept.
//   1. opening the assistant the first time shows the 「AI 数据说明」 over the whole window (MONTCLIP_SMOKE_NOTICE=show), in
//      JJ's v3 words; Esc does not close it; until 〔我知道了〕 the main process refuses a send (NOTICE_REQUIRED) and
//      nothing goes out; read, it is kept and not shown again, and 〔我知道了〕 is not a send
//   2. the review box names api.deepseek.com and links to the notice (数据说明), which shows over it and closes back to it
//   3. what is sent with a plain instruction: her words and the selected clips' numbers and ids — no caption or danmaku
//      text, no transcript or danmaku field, no file names or paths; nothing selected, no clips
//   4. a subtitle she quotes (〔让 AI 看〕) is sent, and only then
//   5. Yolo with a session approval does not skip the review box
//   6. the panel says 「回复由 AI 生成」 at the top, always; no label on each reply
//   7. 设置 › AI 助手 › 用 AI 助手 off: the panel folds away; the main process refuses (AI_OFF), the pane says so and opens no review box, and
//      not one request goes out; 设置's 数据说明 shows the notice again; on again, the line goes
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
  const draft=async(text)=>{await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();};
  const send=()=>read(`document.querySelector('.cindy-send button').click();true`);
  const reviewOpen=`!!document.querySelector('.cindy-confirm:not([data-data-notice])[open]')`,noticeOpen=`!!document.querySelector('[data-data-notice][open]')`;
  const out={};
  // 1. opening the assistant: the notice, the whole window, before anything else
  assert.equal(await read(noticeOpen),false,'not before the assistant is opened');
  await read(`setSideTab('assistant');mcAgent.render();true`);
  assert.ok(await until(noticeOpen),'the 「AI 数据说明」 shows when the assistant is first opened');
  out.notice=await read(`(()=>{const d=document.querySelector('[data-data-notice]'),r=d.getBoundingClientRect();return {title:d.querySelector('h3').textContent,body:d.querySelector('[data-data-notice-body]').textContent,
   cover:[Math.round(r.width),Math.round(r.height),innerWidth,innerHeight]};})()`);
  assert.ok(out.notice.cover[0]>=out.notice.cover[2]-2&&out.notice.cover[1]>=out.notice.cover[3]-2,'the whole window: '+out.notice.cover);
  // JJ's v3 words (test/agent-seed.test.js locks each line); one button, and it is not a yes to sending
  assert.equal(out.notice.title,'用 AI 之前，先说清楚这几件事');
  assert.match(out.notice.body,/^发了什么：你在助手里写的话，加上你选中的片段的时间、长度这类数字。/);
  assert.match(out.notice.body,/发给谁：直接发给 DeepSeek（深度求索）的官方接口 api\.deepseek\.com，/);assert.match(out.notice.body,/DeepSeek 会怎么用：/);
  assert.match(out.notice.body,/怎么关：在「设置 › AI 助手」里关掉「用 AI 助手」，就一次都不发了。/);
  assert.match(out.notice.body,/标「AI 生成」：助手面板顶上写着「回复由 AI 生成」；它给的剪辑计划，单独标「AI 生成」。/);
  assert.match(out.notice.body,/依据：DeepSeek 隐私政策（2026 年 2 月 10 日版）、DeepSeek 开放平台服务条款（2026 年 4 月 29 日生效）。它们改了，这页也会跟着改。$/);
  assert.deepEqual(await read(`[...document.querySelectorAll('[data-data-notice] button')].map(b=>b.textContent)`),['我知道了'],'one button only');
  // Esc does not close it
  await read(`document.querySelector('[data-data-notice]').dispatchEvent(new Event('cancel',{cancelable:true}));true`);await wait();
  assert.equal(await read(noticeOpen),true,'Esc leaves it open');
  // not read yet: the main process refuses, whatever the page asks
  out.beforeNotice=await read(`montclipAgentService.send({version:1,requestId:'r-early',messages:[{role:'user',content:'早'}]})`);
  assert.equal(out.beforeNotice.code,'NOTICE_REQUIRED');assert.equal(sent.length,0,'nothing sent before the notice is read');
  await read(`document.querySelector('[data-data-notice-ok]').click();true`);await wait(400);
  assert.equal(await read(noticeOpen),false);assert.equal(await read(reviewOpen),false,'〔我知道了〕 is not a send: no review box');
  out.noticeKept=(await read('montclipAgentService.noticeGet()')).accepted;assert.equal(out.noticeKept,true);
  // 2. the review box names the address and links to the notice
  await draft('只保留第一句');await send();
  assert.ok(await until(reviewOpen),'the review box');assert.equal(await read(noticeOpen),false,'the notice is not shown again');
  out.review=await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] p').textContent`);
  assert.match(out.review,/api\.deepseek\.com/);assert.equal(sent.length,0,'nothing sent before the review');
  out.link=await read(`document.querySelector('[data-notice-link]')?.textContent||null`);assert.equal(out.link,'数据说明');
  await read(`document.querySelector('[data-notice-link]').click();true`);
  assert.ok(await until(noticeOpen),'the link shows the notice');
  await read(`document.querySelector('[data-data-notice-ok]').click();true`);await wait();
  assert.equal(await read(noticeOpen),false);assert.equal(await read(reviewOpen),true,'back to the review box');assert.equal(sent.length,0);
  // 3. a plain instruction, nothing selected
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button').click();true`);
  assert.ok(await until(`document.querySelectorAll('.cindy-message.assistant').length>=1`),'a reply');
  assert.equal(sent.length,1);
  out.plain=sent[0];
  const plainText=JSON.stringify(out.plain.body);
  for(const leak of [CAPTION,DANMAKU,'合成观众',FILE,'/media/',KEY])assert.equal(plainText.includes(leak),false,'the plain request holds '+leak);
  assert.equal(out.plain.auth,true);
  // no transcript or danmaku field at all, and nothing selected means no clip numbers
  for(const k of ['danmaku','transcript','captions','words'])assert.equal(plainText.includes('\\"'+k+'\\"'),false,'a '+k+' field');
  const last=out.plain.body.messages.at(-1).content;out.plainFacts=JSON.parse(last.slice(last.indexOf('\n\n{')+2)).facts;
  assert.deepEqual(out.plainFacts,{clips:[]},'nothing selected: no clips');
  // 6. the reply says it is AI-made
  out.aiLine=await read(`document.querySelector('[data-ai-replies-line]')?.textContent||null`);assert.equal(out.aiLine,'回复由 AI 生成');
  assert.equal(await read(`document.querySelectorAll('.cindy-message [data-ai-generated]').length`),0,'no label on each reply');
  // 4. a quoted subtitle goes, and only then; the notice is not shown again
  await read(`setSelection(['cap1']);true`);await wait();
  await read(`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent==='让 AI 看').click();true`);await wait();
  await draft('这一句保留');await send();
  assert.ok(await until(reviewOpen),'the review box again');assert.equal(await read(noticeOpen),false,'the notice is not shown twice');
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button').click();true`);
  assert.ok(await until(`document.querySelectorAll('.cindy-message.assistant').length>=2`));
  out.quoted=sent[1];const quotedText=JSON.stringify(out.quoted.body);
  assert.equal(quotedText.includes(CAPTION),true,'the quoted subtitle is sent');
  for(const leak of [DANMAKU,'合成观众',FILE,'/media/',KEY])assert.equal(quotedText.includes(leak),false,'the quoted request holds '+leak);
  // 5. Yolo, with this chat's approvals: the review box still comes first
  process.env.MONTCLIP_SMOKE_YOLO_CONSENT='1';
  await read(`document.querySelector('[data-mode="yolo"]')?.click();true`);await wait(400);
  out.yoloMode=await read('typeof agentPolicy!=="undefined"?agentPolicy.mode:null');
  await draft('再看一次');await send();
  assert.ok(await until(reviewOpen),'Yolo: the review box still shows');assert.equal(sent.length,2,'Yolo: nothing sent before the review');
  await read(`document.querySelector('.cindy-confirm:not([data-data-notice])[open] button:last-child').click();true`);await wait();
  assert.equal(sent.length,2,'cancelled: nothing sent');
  assert.equal(await read(reviewOpen),false,'cancelled: the review box is closed '+JSON.stringify(await read(`[...document.querySelectorAll('dialog[open]')].map(d=>d.className+' '+[...d.querySelectorAll('button')].map(b=>b.textContent).join('|'))`)));
  // 7. 设置 › AI 助手 › 用 AI 助手, off: not one request
  await read(`document.getElementById('btnSettings').click();true`);await wait(400);
  out.setting=await read(`(()=>{const b=document.getElementById('setAi');return {shown:!b.classList.contains('hidden'),title:b.querySelector('h3').textContent,label:b.querySelector('.settings-label').textContent,checked:document.getElementById('setAiEnabled').checked,button:document.getElementById('btnAiNotice').textContent};})()`);
  assert.deepEqual(out.setting,{shown:true,title:'AI 助手',label:'用 AI 助手',checked:true,button:'数据说明'});
  await read(`document.getElementById('setAiEnabled').click();true`);
  assert.ok(await until(`montclipAgentService.switchGet().then(r=>r.enabled===false)`),'kept by the main process');
  await read(`document.getElementById('btnCloseSettings').click();true`);await wait(400);
  out.folded=await read(`document.getElementById('mcAssistantPanel').classList.contains('hidden')`);assert.equal(out.folded,true,'off: the panel folds away');
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait(400);
  out.offLine=await read(`document.querySelector('[data-ai-off]')?.textContent||null`);
  assert.equal(out.offLine,'AI 助手关着，什么都不会发出去。要用的话，到「设置 › AI 助手」里打开。');
  out.offDirect=await read(`montclipAgentService.send({version:1,requestId:'r-off',messages:[{role:'user',content:'关着'}]})`);assert.equal(out.offDirect.code,'AI_OFF');
  await draft('关着也试试');await send();await wait(600);
  assert.equal(await read(reviewOpen),false,'off: no review box');assert.equal(sent.length,2,'off: not one request');
  // 设置's 「数据说明」 shows the notice again, and it only closes
  await read(`document.getElementById('btnSettings').click();true`);await wait(300);
  await read(`document.getElementById('btnAiNotice').click();true`);
  assert.ok(await until(noticeOpen),'设置 › 数据说明 shows the notice');
  await read(`document.querySelector('[data-data-notice-ok]').click();true`);await wait();assert.equal(await read(reviewOpen),false);assert.equal(sent.length,2);
  // on again: the line goes
  await read(`document.getElementById('btnSettings').click();true`);await wait(300);
  await read(`document.getElementById('setAiEnabled').click();true`);
  assert.ok(await until(`montclipAgentService.switchGet().then(r=>r.enabled===true)`));
  await read(`document.getElementById('btnCloseSettings').click();true`);
  assert.ok(await until(`!document.querySelector('[data-ai-off]')`),'on: the line goes');
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
