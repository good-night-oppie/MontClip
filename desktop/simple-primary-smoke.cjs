'use strict';
// Explicit development entry; uses only a caller-owned synthetic MP4/profile.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
assert.ok(process.argv.includes('--montclip-smoke'));
const input=fs.readFileSync(process.env.MONTCLIP_TIMELINE_INPUT);
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);
 const win=this,read=s=>win.webContents.executeJavaScript(s);
 await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');const bytes=Uint8Array.from(atob(${JSON.stringify(input.toString('base64'))}),c=>c.charCodeAt(0));const [m]=await importFiles([new File([bytes],'synthetic-timeline.mp4',{type:'video/mp4'})]);if(!m)throw Error('IMPORT_FAILED');updateMontClipView({mode:'advanced'});addClipFromMedia(m,'V2',0);if(!await flushSave())throw Error('SAVE_FAILED');setTime(1);})()`);
 win.webContents.debugger.attach('1.3');
 const click=async selector=>{const p=await read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.x+Math.min(40,r.width/2),y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p});};
 let cases=0;
 for(const [width,height] of [[804,535],[630,452]])for(const mode of ['simple'])for(const open of [false,true]){
  win.setContentSize(width,height);if(process.argv.includes('--exact-viewports'))await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,150));
  await read(`updateMontClipView({mode:${JSON.stringify(mode)}});setSideTab(${JSON.stringify(open?'assistant':'inspector')});setTime(1);true`);
  await new Promise(r=>setTimeout(r,150));
  const row=await read(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};},scroll=els.timelineScroll.getBoundingClientRect();const tracks=['V2','A1'].map(id=>{const e=els.tracks.querySelector('[data-track="'+id+'"]'),r=e.getBoundingClientRect(),clip=e.querySelector('.clip'),c=clip.getBoundingClientRect();return{id,height:r.height,visible:Math.max(0,Math.min(r.bottom,scroll.bottom)-Math.max(r.top,scroll.top+RULER_H)),clipHeight:c.height,clipVisible:Math.max(0,Math.min(c.bottom,scroll.bottom)-Math.max(c.top,scroll.top+RULER_H))};});const hit=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&(e===p||e.contains(p));};return{actualMode:mcView.get().mode,bodyMode:document.body.dataset.mcMode,width:innerWidth,height:innerHeight,chrome:Object.fromEntries(['#monitorPanel','#monitorStage','.monitor .panel-head','.transport','.transport-btns','.transport-end','.tc-playhead','#vuMeter','#kfGraphs'].map(s=>[s,rect(document.querySelector(s))])),preview:rect(els.preview),timeline:rect(document.getElementById('timelinePanel')),tracks,overflow:[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight],hits:Object.fromEntries(['#btnPlay','#btnExport','#mcUndo','#mcRedo',${open?"'[data-draft]','[data-action=send]','[data-action=cancel]','#mcAssistantClose'":"'#mcAssistant'"}].map(s=>[s,hit(s)]))};})()`);
  fs.writeFileSync(require('node:path').join(app.getPath('userData'),'last.png'),(await win.webContents.capturePage()).toPNG());
  process.stdout.write('MONTCLIP_TIMELINE_CASE '+JSON.stringify({mode,open,...row})+'\n');
  assert.equal(row.actualMode,mode);assert.equal(row.bodyMode,mode);
  assert.ok(row.preview.w>=160&&row.preview.h>=90,'preview too small');
  assert.ok(row.tracks.every(t=>t.visible>=t.height-1&&t.clipVisible>=t.clipHeight-1),'content tracks clipped');
  assert.ok(Object.values(row.hits).every(Boolean),'control covered');assert.ok(row.overflow.every(x=>x<=1),'page overflow');
  for(const track of ['V2','A1']){
   await click('.track[data-track="'+track+'"] .clip');
   assert.ok(await read(`selectedClips().some(c=>c.track===${JSON.stringify(track)})`),'clip not selected');
   const before=await read('JSON.stringify(project.clips)');await click('#btnSplit');assert.notEqual(await read('JSON.stringify(project.clips)'),before,'split did not edit');await click('#mcUndo');assert.equal(await read('JSON.stringify(project.clips)'),before,'undo did not restore');
  }
  if(mode==='advanced'){await read('rebuildClips();true');await new Promise(r=>setTimeout(r,50));await read('els.timelineScroll.scrollTop=0;true');await new Promise(r=>setTimeout(r,50));await read('rebuildClips();true');assert.equal(await read('els.timelineScroll.scrollTop'),0,'render stole scroll');await read('syncTimelineTrackView.focusKey=null;rebuildClips();true');}
  cases++;
 }
 process.stdout.write('MONTCLIP_TIMELINE_COMPLETE '+JSON.stringify({cases,inputSha256:crypto.createHash('sha256').update(input).digest('hex'),nativeBounds:win.getBounds(),viewportEmulation:process.argv.includes('--exact-viewports')})+'\n');
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
