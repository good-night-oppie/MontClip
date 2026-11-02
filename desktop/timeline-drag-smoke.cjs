'use strict';
// Explicit development entry; uses only a caller-owned synthetic MP4/profile.
const {app,BrowserWindow}=require('electron');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
assert.ok(process.argv.includes('--montclip-smoke'));
const input=fs.readFileSync(process.env.MONTCLIP_TIMELINE_INPUT);
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);
 const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');const bytes=Uint8Array.from(atob(${JSON.stringify(input.toString('base64'))}),c=>c.charCodeAt(0));const [m]=await importFiles([new File([bytes],'synthetic-timeline.mp4',{type:'video/mp4'})]);if(!m)throw Error('IMPORT_FAILED');addClipFromMedia(m,'V1',0);if(!await flushSave())throw Error('SAVE_FAILED');setTime(1);})()`);
 win.webContents.setBackgroundThrottling(false);
 win.webContents.debugger.attach('1.3');

 const wait=()=>read(`new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error("FRAME_TIMEOUT")),2000);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timeout);resolve(true);}));})`);
 win.setContentSize(1270,737);
 const mouse=async(type,x,y)=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
 for(const scenario of ['advanced','simple','cancel']){
  await read('updateMontClipView({mode:"advanced"});setSideTab("assistant");true');await wait();
  // The simple case starts from the result of the preceding real drag.
  if(scenario==='simple')await read('addClipFromMedia(getMedia(project.clips.find(c=>c.kind==="video").mediaId),"V1",8);updateMontClipView({mode:"simple"});true');
  await wait();await read('els.timelineScroll.scrollTop=0;true');await wait();
  const before=await read('JSON.stringify(project.clips)'),undoBefore=await read('runtime.undo.length');
  const source=scenario==='simple'?'V2':'V1',target=scenario==='simple'?'V1':'V2';
  const point=await read('(()=>{const clip=els.tracks.querySelector("[data-track='+source+'] .clip"),r=clip.getBoundingClientRect(),t=els.tracks.querySelector("[data-track='+target+']").getBoundingClientRect();return{x:r.x+35,y:r.y+18,targetY:t.y+12,scroll:els.timelineScroll.scrollTop,id:project.clips.find(c=>c.kind==="video").id,hit:clip.contains(document.elementFromPoint(r.x+35,r.y+18))};})()');
  assert.ok(point.hit,'drag origin not reachable');
  await mouse('mousePressed',point.x,point.y);await wait();
  const samples=[];
  for(const dx of [8,12,16]){
   await mouse('mouseMoved',point.x+dx,point.targetY);await wait();
   const sample=await read('({track:project.clips.find(c=>c.id==='+JSON.stringify(point.id)+').track,scroll:els.timelineScroll.scrollTop,gesture:state.gesture,sourceHidden:els.tracks.querySelector("[data-track='+source+']").hidden})');samples.push(sample);
   assert.equal(sample.track,target);assert.equal(sample.scroll,point.scroll);assert.equal(sample.gesture,true);assert.equal(sample.sourceHidden,false);
  }
  if(scenario==='cancel')await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await mouse('mouseReleased',point.x+16,point.targetY);await wait();
  assert.equal(await read('state.gesture'),false);
  if(scenario==='cancel'){assert.equal(await read('JSON.stringify(project.clips)'),before);assert.equal(await read('runtime.undo.length'),undoBefore);}
  else{assert.equal(await read('runtime.undo.length'),undoBefore+1);assert.equal(await read('project.clips.find(c=>c.id==='+JSON.stringify(point.id)+').track'),target);}
  process.stdout.write('MONTCLIP_DRAG_SETTLED '+JSON.stringify(await read('({mode:mcView.get().mode,dirty:state.dirtyTimeline,pending:syncTimelineTrackView.pending,tracks:project.clips.map(c=>c.track)})'))+'\n');
  if(scenario==='simple')assert.equal(await read('els.tracks.querySelector("[data-track=V2]").hidden'),true);
  process.stdout.write('MONTCLIP_DRAG_CASE '+JSON.stringify({scenario,source,target,samples,cancelled:scenario==='cancel'})+'\n');
 }
 process.stdout.write('MONTCLIP_DRAG_COMPLETE '+JSON.stringify({cases:3,inputSha256:crypto.createHash('sha256').update(input).digest('hex')})+'\n');
};
// Offscreen painting supplies real renderer frames without a visible desktop window.
const Module=require('node:module'),load=Module._load,electron=require('electron');
Module._load=function(id,...args){
 if(id==='electron'){
  Module._load=load;
  return {...electron,BrowserWindow:class extends BrowserWindow{
   constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
  }};
 }
 return load.call(this,id,...args);
};
require('./main');
