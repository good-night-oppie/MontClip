'use strict';
// Explicit development-only runner (run-narrow-pane.cjs). Own profile; visible window;
// no clipboard, no OS-level input: clicks are webContents.sendInputEvent at the real
// window coordinates of each control. Provider is an injected test transport.
// Uses the DEFAULT project of a fresh profile (no dashboard "new project"), which is
// where VV found projectId null.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_NARROW_OUT;if(!out)throw Error('MONTCLIP_NARROW_OUT required');
const service=require('./agent-service'),originalService=service.createDiskService;let requests=0;
service.createDiskService=(...args)=>{const real=originalService(...args);return{...real,async send(p){assert.ok(service.validPayload(p));requests++;const content=p.messages.at(-1).content,at=content.indexOf('{"references"'),refs=at<0?[]:JSON.parse(content.slice(at)).references;return{ok:true,text:JSON.stringify({type:'keep_sentences',ranges:refs.filter(r=>r.type==='caption').map(r=>({clipId:r.clipId,sourceCaptionId:r.sourceCaptionId,from:r.start,to:r.end}))})};}};};
const log=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 try{
 await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
 await wait(400);
 log('NARROW_START',{visible:win.isVisible(),projectId:await read('runtime.projectId')});
 await read(`montclipAgentService.configure({provider:'openai',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`);
 await read(`(()=>{const cues=MontClipCaptions.parse('1\\n00:00:01,000 --> 00:00:02,800\\n合成句子一\\n\\n2\\n00:00:03,000 --> 00:00:04,000\\n合成句子二\\n');project.clips=cues.map((c,i)=>MontClipCaptions.clip(c,{id:'synthetic_c'+i,track:'V1'}));rebuildClips();setSelection(project.clips.map(c=>c.id));scheduleSave();})()`);
 assert.ok(await read('flushSave()'));
 await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait();
 // real window coordinates of an element's centre, after checking it is the topmost element there
 const point=async sel=>read(`(()=>{const e=${sel};if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,n=document.elementFromPoint(x,y);return{x:Math.round(x),y:Math.round(y),hit:e===n||e.contains(n),rect:[r.x,r.y,r.width,r.height]};})()`);
 const click=async(sel,name)=>{const p=await point(sel);assert.ok(p,name+' missing');assert.ok(p.hit,name+' covered at its own centre '+JSON.stringify(p));for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:p.x,y:p.y,button:'left',clickCount:1});await wait(250);return p;};
 const byText=t=>`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(t)})`;
 // screenshots are the app's own page only (webContents.capturePage), never the screen: privacy
 const shoot=async name=>{fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());};
 for(const [w,h] of [[630,452],[804,535],[1270,800]]){
  win.setContentSize(w,h);await wait(600);
  if(process.env.MONTCLIP_NARROW_DEBUG)log('NARROW_DEBUG',await read(`[...Array.from(document.querySelector('.upper > .inspector').children).map((e,i)=>'.upper > .inspector > :nth-child('+(i+1)+')'),'#mcAssistantPanel','#mcAssistantClose','#mcAgentContent','.cindy-port','.cindy-port > .agent-toolbar','.cindy-thread','[data-reference-actions]','.cindy-composer','.upper > .inspector'].map(s=>{const e=document.querySelector(s);if(!e)return s+':none';const r=e.getBoundingClientRect(),c=getComputedStyle(e);return s+':'+[r.x,r.y,r.width,r.height].map(Math.round).join(',')+' pos='+c.position+' scrollTop='+e.scrollTop+' sh='+e.scrollHeight+' ch='+e.clientHeight;})`));
  await click(byText('新会话'),'new session');
  const refs=[];for(const t of ['引用选中字幕','引用所选范围','引用当前项目'])refs.push(await point(byText(t)));
  const fullyVisible=sel=>read(`(()=>{const e=${sel};if(!e)return false;const r=e.getBoundingClientRect();let p=e.parentElement;while(p){const s=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(s.overflow+s.overflowY)){const q=p.getBoundingClientRect();if(r.top<q.top-0.5||r.bottom>q.bottom+0.5)return false;}p=p.parentElement;}return r.top>=0&&r.bottom<=innerHeight&&r.height>0;})()`);
  const refsVisible=[];for(const t of ['引用选中字幕','引用所选范围','引用当前项目'])refsVisible.push(await fullyVisible(byText(t)));
  await click(byText('引用选中字幕'),'caption reference');
  const chips=await read(`document.querySelector('[data-reference-chips], .cindy-references')?.textContent||''`);
  await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'保留这两句');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  const before=requests;await click(`document.querySelector('.cindy-send button')`,'send');
  const status=await read(`Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join(' | ')`);
  const dialogOpen=await read(`!!document.querySelector('.cindy-confirm[open]')`);
  log('NARROW_SEND',{size:[w,h],projectId:await read('runtime.projectId'),status,dialogOpen,chips});
  assert.ok(dialogOpen,'send must open the review, got status: '+status);
  await click(`document.querySelector('.cindy-confirm[open] button')`,'confirm');await wait(500);
  assert.equal(requests,before+1);
  const view=await read(`(()=>{const t=document.querySelector('.cindy-thread').getBoundingClientRect(),m=Array.from(document.querySelectorAll('[role=log] .cindy-message.assistant')).at(-1),r=m.getBoundingClientRect();return{thread:[t.top,t.height],reply:[r.top,r.height],replyInside:r.top>=t.top-0.5&&r.bottom<=t.bottom+0.5,text:m.textContent};})()`);
  const proposal=await point(`document.querySelector('[data-review-proposal]')`),proposalVisible=await fullyVisible(`document.querySelector('[data-review-proposal]')`);
  const refHits=[];for(const t of ['引用选中字幕','引用所选范围','引用当前项目'])refHits.push((await point(byText(t)))?.hit);
  const overflow=await read('document.documentElement.scrollHeight-innerHeight');
  log('NARROW_VIEW',{size:[w,h],view,proposal,proposalVisible,refsVisible,refHits,overflow});
  await shoot(`pr26-narrow-${w}x${h}`);
  assert.ok(view.replyInside,'a whole reply is visible without scrolling');assert.ok(/成片约 \d\d:\d\d/.test(view.text),'duration shows mm:ss: '+view.text);
  assert.ok(proposal&&proposal.hit&&proposalVisible,'proposal button visible and hit');
  assert.ok(refsVisible.every(Boolean)&&refHits.every(Boolean),'three reference buttons fully visible and hit');
  assert.ok(overflow<=1);
 }
 // VV 2026-11-02: at 630x452 with More open, referencing two subtitles must not push the
 // composer out; Esc folds More first, then hides the pane; the pane reopens folded.
 {win.setContentSize(630,452);await wait(600);await click(byText('新会话'),'new session');
  if(await read(`document.querySelector('[data-more]').getAttribute('aria-expanded')`)==='false')await click(`document.querySelector('[data-more]')`,'More');
  await click(byText('引用选中字幕'),'caption reference');
  const fv=sel=>read(`(()=>{const e=${sel};if(!e)return false;const r=e.getBoundingClientRect();let p=e.parentElement;while(p){const s=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(s.overflow+s.overflowY)){const q=p.getBoundingClientRect();if(r.top<q.top-0.5||r.bottom>q.bottom+0.5)return false;}p=p.parentElement;}return r.top>=0&&r.bottom<=innerHeight&&r.height>0;})()`);
  const r={moreOpen:await read(`document.querySelector('[data-more]').getAttribute('aria-expanded')`),chips:await read(`document.querySelectorAll('[data-reference-chips] > div').length`),
   draft:{visible:await fv(`document.querySelector('[data-cindy-draft]')`),...(await point(`document.querySelector('[data-cindy-draft]')`))},
   send:{visible:await fv(`document.querySelector('.cindy-send button')`),...(await point(`document.querySelector('.cindy-send button')`))}};
  log('NARROW_MORE_REFS',r);await shoot('p630-more-refs');
  assert.equal(r.moreOpen,'true');assert.equal(r.chips,2);assert.ok(r.draft.visible&&r.draft.hit,'draft visible and hit');assert.ok(r.send.visible&&r.send.hit,'send visible and hit');
  await click(`document.querySelector('[data-cindy-draft]')`,'draft');
  const esc=async()=>{for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Escape'});await wait(250);};
  await esc();const e1={more:await read(`document.querySelector('[data-more]')?.getAttribute('aria-expanded')`),hidden:await read(`document.getElementById('mcAssistantPanel').classList.contains('hidden')`)};
  await esc();const e2={hidden:await read(`document.getElementById('mcAssistantPanel').classList.contains('hidden')`)};
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait(300);const e3={hidden:await read(`document.getElementById('mcAssistantPanel').classList.contains('hidden')`),more:await read(`document.querySelector('[data-more]').getAttribute('aria-expanded')`)};
  log('NARROW_ESC',{first:e1,second:e2,reopen:e3});await shoot('p630-reopen');
  assert.deepEqual(e1,{more:'false',hidden:false},'first Esc folds More only');assert.equal(e2.hidden,true,'second Esc hides the pane');assert.deepEqual(e3,{hidden:false,more:'false'},'reopens folded');}
 log('NARROW_COMPLETE',{requests,transport:'injected-test-only',projectId:await read('runtime.projectId'),saved:await read('flushSave()')});
 }catch(e){process.stdout.write('NARROW_FAIL '+(e&&e.message)+'\n');try{await (async()=>{const b=win.getContentBounds();fs.writeFileSync(path.join(out,'pr26-narrow-failure.page.png'),(await win.webContents.capturePage()).toPNG());})();}catch{}}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
