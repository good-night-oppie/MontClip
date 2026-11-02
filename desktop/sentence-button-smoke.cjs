'use strict';
// VV (2026-11-02, #26 423234fa): clicking 「按句选段」 did nothing — the click handler passed the MouseEvent on as
// showSentenceSelection's `suggestion`. This clicks the real button with a mouse event sent to the app's own
// hidden offscreen window (never the user's mouse or screen) and checks the dialog opens.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  // synthetic captions only; no media is generated or read
  await read(`(()=>{const cues=FableCutCaptions.parse('1\\n00:00:01,000 --> 00:00:03,000\\n合成句子\\n');project.clips=cues.map((c,i)=>FableCutCaptions.clip(c,{id:'synthetic_c'+i,track:'V1'}));rebuildClips();scheduleSave();true})()`);
  await read(`setSideTab('transcript');true`);await wait(300);
  const box=await read(`(()=>{const b=document.querySelector('[data-tr-sentences]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:r.width,h:r.height,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b};})()`);
  assert.ok(box.w>0&&box.h>0,'the button is laid out');assert.equal(box.hit,true,'nothing covers the button');
  const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=2)errors.push(message);});
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:box.x,y:box.y,button:'left',clickCount:1});
  const until=Date.now()+5000;let open=false;while(!open&&Date.now()<until){await wait(100);open=await read(`!!document.querySelector('.sentence-dialog[open]')`);}
  assert.equal(open,true,'clicking 「按句选段」 opens the sentence dialog');
  assert.deepEqual(errors.filter(m=>/showSentenceSelection/.test(m)),[],'no invalid-suggestion warning from a plain click');
  await read(`document.querySelector('.sentence-dialog').close();true`);
  process.stdout.write('SENTENCE_BUTTON_COMPLETE '+JSON.stringify({opened:true})+'\n');
 }catch(e){process.stdout.write('SENTENCE_BUTTON_FAIL '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
