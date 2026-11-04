'use strict';
// Development-only external entry: electron this-file --montclip-smoke --user-data-dir=<owned-profile>
// Loads the real host and measures its native minimum window, without emulation.
// Since #26 (fc93674) the assistant is the official Cindy pane: its draft is [data-cindy-draft], sending is the composer's
// send button (with no service set up it says so in its status line and opens nothing), and it has no width setting of its
// own (the layout gives it its column), so the cases are mode × open.
const {app,BrowserWindow,screen}=require('electron');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
assert.ok(process.argv.includes('--montclip-smoke'));
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);
 const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read('(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error("NOT_CONNECTED");document.getElementById("btnTitle").click();if(!await flushSave())throw Error("SAVE_FAILED");setTime(1);})()');
 win.setSize(640,480);win.webContents.debugger.attach('1.3');
 const click=async selector=>{const point=await read('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');for(const type of ['mousePressed','mouseReleased'])await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point});};
 const rows=[];
 for(const mode of ['simple','advanced'])for(const open of [false,true]){
  await read(`(()=>{updateMontClipView({mode:${JSON.stringify(mode)}});setSideTab(${JSON.stringify(open?'assistant':'inspector')});if(${open}){mcAgent.render();const d=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(d,'Synthetic minimum-window draft');d.dispatchEvent(new Event('input',{bubbles:true}));}setTime(1);return true;})()`);
  await new Promise(r=>setTimeout(r,120));
  const row=await read(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};const hit=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return r.width>0&&r.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&(e===document.elementFromPoint(x,y)||e.contains(document.elementFromPoint(x,y)));};return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},preview:rect(document.getElementById('preview')),timeline:rect(document.getElementById('timelinePanel')),overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight,controls:Object.fromEntries(['#btnPlay','#btnExport','#mcUndo','#mcRedo',${open?"'[data-cindy-draft]','.cindy-send button','#mcAssistantClose'":"'#mcAssistant'"}].map(s=>[s,hit(s)]))};})()`);
  rows.push({mode,open,bounds:win.getBounds(),contentBounds:win.getContentBounds(),...row});
  // Emit measurements before assertions, so a failed case remains diagnosable.
  process.stdout.write('MONTCLIP_MINIMUM_CASE '+JSON.stringify(rows.at(-1))+'\n');
  fs.writeFileSync(path.join(app.getPath('userData'),`minimum-${mode}-${open}.png`),(await win.webContents.capturePage()).toPNG());
  assert.ok(row.preview.w>0&&row.preview.h>0,'preview empty');assert.ok(Object.values(row.controls).every(Boolean),'unreachable control');assert.ok(row.overflowX<=1&&row.overflowY<=1,'page overflow');assert.ok(row.timeline.w>=row.viewport.width-16,'narrow timeline');
  await click('#btnPlay');assert.equal(await read('state.playing'),true);await click('#btnPlay');assert.equal(await read('state.playing'),false);
  const count=await read('project.clips.length');await click('#mcUndo');assert.equal(await read('project.clips.length'),count-1);await click('#mcRedo');assert.equal(await read('project.clips.length'),count);
  await click('#btnExport');await read('(async()=>{const until=Date.now()+10000;while(document.getElementById("exportSetup").classList.contains("hidden")&&Date.now()<until)await new Promise(r=>setTimeout(r,20));if(document.getElementById("exportSetup").classList.contains("hidden"))throw Error("EXPORT_NOT_OPEN");document.getElementById("btnCancelSetup").click();})()');
  if(open){await click('.cindy-send button');await new Promise(r=>setTimeout(r,200));assert.ok(await read('document.querySelector(".cindy-port > [role=status]:last-of-type").textContent.length>0'),'sending without a service says so');assert.equal(await read('!!document.querySelector(".cindy-confirm[open]")'),false,'nothing opened, nothing sent');await click('#mcAssistantClose');assert.equal(await read('document.getElementById("mcAssistantPanel").classList.contains("hidden")'),true);}
 }
 process.stdout.write('MONTCLIP_MINIMUM_COMPLETE '+JSON.stringify({cases:rows.length,scaleFactor:screen.getDisplayMatching(win.getBounds()).scaleFactor,nativeMinimum:win.getMinimumSize(),emulated:false})+'\n');
};
require('./main');
