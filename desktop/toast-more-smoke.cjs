'use strict';
// Two things VV found in the real window (Deja, 2026-11-03). Fresh profile, hidden offscreen window, synthetic sound only:
//  A. a toast with 〔撤销〕 stays 8 seconds, and not at all while the pointer is on it or its button has the focus (the time
//     starts again once it leaves): at 6 s it is still there, after 10 s hovered it is still there, and 〔撤销〕 undoes —
//     the 自动出切片 toast and the editor's own; a toast without 〔撤销〕 is unchanged;
// With MONTCLIP_SHOTS_OUT (an absolute folder) it saves pictures of its own window (capturePage), 1280×800 and 630×460.
//   electron desktop/toast-more-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → TOAST_MORE_PASS / TOAST_MORE_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shots=process.env.MONTCLIP_SHOTS_OUT||null;if(shots&&!path.isAbsolute(shots))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const {wav}=require('../test/songs-synth');
const asrEmpty=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'montclip-noasr-'));process.env.MONTCLIP_ASR_DIR=asrEmpty;
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]];
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 const shot=async(name)=>{if(!shots)return;await wait(300);fs.writeFileSync(path.join(shots,name),(await win.webContents.capturePage()).toPNG());};
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'提示与更多设置 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 2 日 合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`(()=>{document.getElementById('btnAutoSlices').click();return true;})()`);
  await until(`!!document.querySelector('dialog.auto-slices[open]')`);
  // A. the 自动出切片 toast after an edit: still there at 6 s; hovered 10 s still there; 〔撤销〕 undoes
  await read(`(()=>{document.querySelector('[data-as-act=go]').click();return true;})()`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  await read(`(()=>{const d=document.querySelector('dialog.auto-slices');if(!d.open)document.getElementById('btnAutoSlices').click();autoRender('review');return true;})()`);
  const before=await read(`JSON.stringify(autoState().clips.map(c=>[c.id,c.s,c.e]))`);
  await read(`(()=>{document.querySelector('[data-as-card] [data-as-act=nudge][data-as-w=s][data-as-d="-5"]').click();return true;})()`);
  const shown=()=>read(`(()=>{const t=document.querySelector('[data-as-toast]');return !t.hidden&&getComputedStyle(t).display!=='none';})()`);
  await wait(6000);report.at6=await shown();
  await shot('toast-undo-1280x800.png');
  await read(`(()=>{document.querySelector('[data-as-toast]').dispatchEvent(new MouseEvent('mouseenter'));return true;})()`);
  await wait(10000);report.hovered10=await shown();
  await read(`(()=>{document.querySelector('[data-as-toast]').dispatchEvent(new MouseEvent('mouseleave'));return true;})()`);
  await wait(3000);report.left3=await shown();
  await read(`(()=>{document.querySelector('[data-as-toast-undo]').click();return true;})()`);await wait(200);
  report.undone=await read(`JSON.stringify(autoState().clips.map(c=>[c.id,c.s,c.e]))`)===before;
  // focus on 〔撤销〕 holds it too
  await read(`(()=>{document.querySelector('[data-as-card] [data-as-act=nudge][data-as-w=s][data-as-d="-1"]').click();document.querySelector('[data-as-toast-undo]').focus();return true;})()`);
  await wait(10000);report.focused10=await shown();
  await read(`(()=>{document.querySelector('[data-as-toast-undo]').blur();return true;})()`);
  await wait(8600);report.goneAfter8=!(await shown());
  // a toast without 〔撤销〕: as it was (5 s)
  await read(`(()=>{autoToast('plain',false);return true;})()`);await wait(5600);report.plainGone=!(await shown());
  // the editor's own toast with 〔撤销〕 (toastAction): 8 s, held while hovered
  report.editor=await read(`(async()=>{let undone=0;toastAction('x','撤销',()=>{undone++;});const t=document.getElementById('toast'),on=()=>t.classList.contains('show');
    await new Promise(r=>setTimeout(r,6000));const at6=on();t.dispatchEvent(new MouseEvent('mouseenter'));await new Promise(r=>setTimeout(r,10000));const hovered10=on();
    t.dispatchEvent(new MouseEvent('mouseleave'));t.querySelector('.toast-action').click();return{at6,hovered10,undone};})()`);
  assert.deepEqual({at6:report.at6,hovered10:report.hovered10,left3:report.left3,undone:report.undone,focused10:report.focused10,goneAfter8:report.goneAfter8,plainGone:report.plainGone},
   {at6:true,hovered10:true,left3:true,undone:true,focused10:true,goneAfter8:true,plainGone:true});
  assert.deepEqual(report.editor,{at6:true,hovered10:true,undone:1});
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{fs.rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'TOAST_MORE_PASS':'TOAST_MORE_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
