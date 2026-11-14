'use strict';
// Explicit development entry: a wrong key and a wrong model name in the real window (VV / Deja 2026-11-02).
// Fresh profile, no network: the main process's fetch is replaced before the app starts, answering 401,
// or 400 "… is not a valid model ID". For each, in zh-CN and en, at 1270×800 and 630×452: the line shown, the
// "Go to settings" button, that it opens settings like the unconfigured one, and that the draft is kept.
//   electron desktop/agent-errors-smoke.cjs --montclip-smoke --user-data-dir=<fresh folder> [MONTCLIP_ERRORS_OUT=<folder>]
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_ERRORS_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_ERRORS_OUT must be an absolute folder');
const View=require('../shared/ui-preferences');
let answer=null,sent=0;
globalThis.fetch=async(url)=>{sent++;if(!/^https:\/\/(openrouter\.ai|api\.deepseek\.com|api\.openai\.com)\//.test(String(url)))throw Error('unexpected '+url);
 return {ok:false,status:answer.status,body:(async function*(){yield Buffer.from(answer.body);})()};};
const CASES=[{name:'auth',status:401,body:'{"error":{"message":"No auth credentials found","code":401}}',key:'officialPane_errAuth'},
 {name:'model',status:400,body:'{"error":{"message":"vendor/model-x:free is not a valid model ID","code":400}}',key:'officialPane_errModel'}];
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  for(const [W,H] of [[1270,800],[630,452]])for(const language of ['zh-CN','en'])for(const c of CASES){
   win.setContentSize(W,H);answer=c;const before=sent;
   await read(`updateMontClipView({language:${JSON.stringify(language)}});setSideTab('assistant');mcAgent.render();true`);await wait(300);
   await read(`montclipAgentService.configure({provider:'openrouter',model:'vendor/model-x:free',apiKey:'sk-dummy-not-a-key'})`);
   await read(`mcAgent.render();true`);await wait(300);
   // settings closed before each case, so the button is what opens them
   await read(`(()=>{if(document.querySelector('.cindy-config')){const t=MontClipView.text[${JSON.stringify(language)}].officialPane_config;[...document.querySelectorAll('#mcAgentContent button')].find(b=>b.textContent===t)?.click();}return true;})()`);await wait(300);
   const closed=await read(`!document.querySelector('.cindy-config')`);
   const expected=View.text[language][c.key];
   const draft='只保留第一句 '+c.name+' '+W;
   await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(draft)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);await wait(200);
   await read(`document.querySelector('.cindy-send button').click();true`);await wait(500);
   await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');const b=[...d.querySelectorAll(':scope > button')][0];b.click();return true;})()`);await wait(800);
   // seen = on screen and not covered: the element (or its child) is what the window shows at its centre
   const r=await read(`(()=>{const seen=e=>{if(!e)return false;e.scrollIntoView({block:'nearest'});const q=e.getBoundingClientRect();if(!(q.width>0&&q.height>0&&q.left>=0&&q.top>=0&&q.right<=innerWidth&&q.bottom<=innerHeight))return false;const h=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);return !!h&&(h===e||e.contains(h));};
    const line=[...document.querySelectorAll('#mcAgentContent [role=status]')].find(e=>e.textContent===${JSON.stringify(expected)});const b=document.querySelector('[data-go-config]');
    return {lines:[...document.querySelectorAll('#mcAgentContent [role=status]')].map(e=>e.textContent),lineSeen:seen(line),button:b?{text:b.textContent,visible:seen(b)}:null,
    draft:document.querySelector('[data-cindy-draft]').value};})()`);
   // a hidden window only paints when asked: repaint before the screenshot so it shows this state
   if(out){win.webContents.invalidate();await wait(400);fs.writeFileSync(path.join(out,`agent-error-${c.name}-${language}-${W}x${H}.png`),(await win.webContents.capturePage()).toPNG());}
   await read(`document.querySelector('[data-go-config]')?.click();true`);await wait(400);
   const opened=await read(`!!document.querySelector('.cindy-config')`);
   const checks={settingsClosedFirst:closed,requestMade:sent===before+1,line:r.lines.includes(expected)&&r.lineSeen,button:!!r.button&&r.button.text===View.text[language].officialPane_goConfig&&r.button.visible,opensSettings:opened,draftKept:r.draft===draft};
   const ok=Object.values(checks).every(Boolean);results.push({case:c.name,language,size:[W,H],ok,checks,line:r.lines.find(Boolean)});
   process.stdout.write('ERRORS '+JSON.stringify({case:c.name,language,size:[W,H],ok,checks})+'\n');
   await read(`mcAgent.render();true`);await wait(200);
  }
  if(out)fs.writeFileSync(path.join(out,'agent-errors.json'),JSON.stringify(results,null,1)+'\n');
  process.stdout.write((results.length===8&&results.every(x=>x.ok)?'ERRORS_PASS':'ERRORS_FAIL')+'\n');
 }catch(e){process.stdout.write('ERRORS_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
require('./main');
