'use strict';
// Explicit development entry (docs/validation/2026-11-02-review-body). Fresh profile, hidden window,
// no network: configures OpenRouter with a dummy key, opens the review dialog for one draft and
// reads what it shows — the readable sections, the count and the raw request. The dialog is
// cancelled, so nothing is sent. The unit test test/agent-review-body.test.js proves the raw request
// is the body the service sends; this proves the dialog's sections and count match that raw request.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const out=process.env.MONTCLIP_REVIEW_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_REVIEW_OUT must be an absolute folder');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const result={};
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.setContentSize(1270,800);
  for(const language of ['zh-CN','en']){
   await read(`updateMontClipView({language:${JSON.stringify(language)}});setSideTab('assistant');mcAgent.render();true`);await wait(300);
   const conf=await read(`montclipAgentService.configure({provider:'openrouter',model:'vendor/model-x:free',apiKey:'sk-dummy-not-a-key'})`);
   await read(`mcAgent.render();true`);await wait(300);
   await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'只保留第一句');e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await wait(200);
   await read(`document.querySelector('.cindy-send button').click();true`);await wait(500);
   const r=await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');if(!d)return null;
    const raw=JSON.parse(d.querySelector('[data-raw-request] pre').textContent);
    const sections=[...d.querySelectorAll('.cindy-review-text > section')];
    return {configured:montclipAgentService.get().configured,summary:d.querySelectorAll('p')[1].textContent,
     sections:sections.map(s=>({formatNote:s.hasAttribute('data-format-note'),label:s.querySelector('strong').textContent,text:(s.querySelector('pre')||s.querySelector('p')).textContent})),
     raw,expectedNote:MontClipFormat.FORMAT_NOTE};})()`);
   if(!r)throw Error('review dialog did not open');
   const checks={
    sameCount:r.sections.length===r.raw.messages.length,
    noteFirst:r.sections[0].formatNote&&r.raw.messages[0].role==='system'&&r.raw.messages[0].content===r.expectedNote&&r.sections[0].text===r.expectedNote,
    messagesInOrder:r.raw.messages.slice(1).every((m,i)=>m.role==='user'&&r.sections[i+1].text.trim()===m.content.trim()),
    countIncludesNote:r.summary.includes(String(r.raw.messages.length)),
    rawFields:JSON.stringify(Object.keys(r.raw).sort())==='["max_tokens","messages","model","stream"]'&&r.raw.model==='vendor/model-x:free'&&r.raw.stream===false&&r.raw.max_tokens===2048,
    noKeyShown:!JSON.stringify(r).includes('sk-dummy'),
   };
   result[language]={summary:r.summary,sections:r.sections.map(s=>s.label),checks};
   process.stdout.write('REVIEW '+language+' '+JSON.stringify(checks)+'\n');
   await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');[...d.querySelectorAll('button')].at(-1).click();return true;})()`);await wait(200);
  }
  const ok=Object.values(result).every(x=>Object.values(x.checks).every(Boolean));
  if(out)fs.writeFileSync(path.join(out,'review-dialog.json'),JSON.stringify(result,null,1)+'\n');
  process.stdout.write((ok?'REVIEW_PASS':'REVIEW_FAIL')+'\n');
 }catch(e){process.stdout.write('REVIEW_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
require('./main');
