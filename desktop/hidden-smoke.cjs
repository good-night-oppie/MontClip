'use strict';
// [hidden] means hidden (Deja, 2026-11-03): after 〔撤销〕 in 自动出切片 the toast said 「已撤销」 with its 〔撤销〕 button still
// showing — the button had the hidden attribute, but .btn's display won over it. Fixed at the root (.btn[hidden]); this
// checks, through the real page in a fresh profile and a hidden offscreen window:
//  - every .btn in the page, once hidden, has computed display none;
//  - every element of the page that has the hidden attribute is not displayed (none of them, .btn or not, is shown);
//  - the 自动出切片 toast after an undo: its 〔撤销〕 button is not displayed (display none, or not in the page).
//   electron desktop/hidden-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → HIDDEN_PASS / HIDDEN_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 try{
  const end=Date.now()+15000;while(!(await read('typeof state!=="undefined"&&state.connected'))&&Date.now()<end)await wait(100);
  // every .btn, hidden: not displayed
  report.buttons=await read(`(()=>{const all=[...document.querySelectorAll('.btn')],shown=[];for(const b of all){const was=b.hidden;b.hidden=true;if(getComputedStyle(b).display!=='none')shown.push(b.id||b.dataset.i18n||b.className);b.hidden=was;}return{count:all.length,shownWhenHidden:shown.slice(0,20),n:shown.length};})()`);
  // every element that has the hidden attribute right now: not displayed
  report.hiddenShown=await read(`(()=>{const bad=[];for(const e of document.querySelectorAll('[hidden]'))if(getComputedStyle(e).display!=='none')bad.push(e.id||e.className||e.tagName);return bad.slice(0,20);})()`);
  // 自动出切片: the toast after an undo
  report.toast=await read(`(async()=>{document.getElementById('btnAutoSlices').click();await new Promise(r=>setTimeout(r,300));autoToast(uiText('own.as-undone'),false);
    const b=document.querySelector('[data-as-toast-undo]');return{msg:document.querySelector('[data-as-toast-msg]').textContent,hiddenAttr:!!b&&b.hidden,gone:!b||!document.contains(b),display:b?getComputedStyle(b).display:null};})()`);
  assert.ok(report.buttons.count>20,'the page has its buttons');
  assert.deepEqual(report.buttons.shownWhenHidden,[],'a hidden .btn is shown');
  assert.deepEqual(report.hiddenShown,[],'an element with hidden is shown');
  assert.ok(report.toast.gone||report.toast.display==='none','〔撤销〕 after an undo: '+JSON.stringify(report.toast));
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'HIDDEN_PASS':'HIDDEN_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
