'use strict';
// P2 highlight cards in the real editor: fresh profile, hidden offscreen window, a synthetic sound only (a quiet
// tone with a loud stretch at 10–18 s, made here) and three synthetic sentences. Checks: the loud stretch is the
// first card with a loudness reason; Go to only moves the playhead; Keep keeps exactly the picked range through the
// range engine and one Undo restores the edit; an empty timeline says why there are no cards.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
function wav(seconds=30,rate=48000){
 const n=seconds*rate,data=Buffer.alloc(n*2);
 for(let i=0;i<n;i++){const t=i/rate,amp=t>=10&&t<18?0.6:0.04;data.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*t)*amp*32767),i*2);}
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+data.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
 h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  // the empty state first: nothing on the timeline
  await read(`setSideTab('transcript');true`);await wait(300);
  await read(`document.querySelector('[data-tr-highlights]').click();true`);await wait(800);
  const empty=await read(`(()=>{const d=document.querySelector('.highlight-dialog');return d?{open:d.open,cards:d.querySelectorAll('[data-hl-card]').length,status:d.querySelector('[data-hl-status]').textContent}:null;})()`);
  assert.ok(empty&&empty.open,'the dialog opens');assert.equal(empty.cards,0);
  assert.equal(empty.status,await read(`uiText('own.hl-empty-no-media')`),'the empty state says why');
  await read(`document.querySelector('.highlight-dialog [data-hl-close]').click();true`);await wait(200);
  // the synthetic sound and sentences
  const b64=wav().toString('base64');
  const src=await read(`(async()=>{const bin=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const r=await fetch('/api/upload?name='+encodeURIComponent('合成 高光.wav'),{method:'POST',body:new Blob([bin])});if(!r.ok)throw Error('upload '+r.status);return (await r.json()).src;})()`);
  await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));const doc=projectJSON();
   Object.assign(doc,{media:[{id:'snd',src:${JSON.stringify(src)},kind:'audio',name:'合成 高光.wav',duration:30}],
    clips:[{id:'a',kind:'audio',mediaId:'snd',track:'A1',start:0,in:0,duration:30,props:{volume:1}},
     ...[[0,8,'平静的开场白'],[10,18,'这里突然喊起来了'],[20,28,'又安静下来']].map(([f,t,text],i)=>FableCutCaptions.clip({start:f,end:t,text},{id:'s'+i,track:'V2',width:1280,height:720}))]});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');})()`);
  await read(`document.querySelector('[data-tr-highlights]').click();true`);
  const until=Date.now()+30000;let cards=0;while(Date.now()<until){await wait(300);cards=await read(`document.querySelectorAll('.highlight-dialog [data-hl-card]').length`);if(cards)break;}
  assert.ok(cards>=1,'cards appear');
  // MONTCLIP_HL_PNG: the app's own page (capturePage), never the screen
  if(process.env.MONTCLIP_HL_PNG)require('node:fs').writeFileSync(process.env.MONTCLIP_HL_PNG,(await win.webContents.capturePage()).toPNG());
  const first=await read(`(()=>{const c=document.querySelector('.highlight-dialog [data-hl-card]');return{range:c.dataset.hlRange,reasons:[...c.querySelectorAll('[data-hl-reason]')].map(r=>r.dataset.hlReason)};})()`);
  assert.equal(first.range,'10-18','the loud stretch is first');
  assert.ok(first.reasons.includes('loudness'),'with a loudness reason');
  // Go to: the playhead only
  const before=await read(`JSON.stringify(projectJSON())`),undoDepth=await read(`runtime.undo.length`);
  await read(`document.querySelector('.highlight-dialog [data-hl-card] [data-hl-jump]').click();true`);await wait(300);
  assert.equal(await read(`Math.round(state.time*1000)`),10000,'the playhead is at the card');
  assert.equal(await read(`JSON.stringify(projectJSON())`),before,'Go to does not change the project');
  assert.equal(await read(`runtime.undo.length`),undoDepth);
  // Keep: the range engine, one undo step
  await read(`document.querySelector('.highlight-dialog [data-hl-card] [data-hl-pick]').click();document.querySelector('.highlight-dialog [data-hl-keep]').click();true`);await wait(500);
  const kept=await read(`project.clips.filter(c=>c.kind==='audio').map(c=>[Math.round(c.start*1000),Math.round(c.in*1000),Math.round(c.duration*1000)])`);
  assert.deepEqual(kept,[[0,10000,8000]],'only 10–18 s is kept');
  assert.equal(await read(`runtime.undo.length`),undoDepth+1,'one undo step');
  await read(`undo();true`);await wait(200);
  assert.equal(await read(`JSON.stringify(projectJSON().clips)`),JSON.stringify(JSON.parse(before).clips),'Undo restores the edit');
  process.stdout.write('HIGHLIGHTS_COMPLETE '+JSON.stringify({empty:empty.status,cards,first})+'\n');
 }catch(e){process.stdout.write('HIGHLIGHTS_FAIL '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
