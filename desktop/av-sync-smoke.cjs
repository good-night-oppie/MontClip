'use strict';
// QQ (#36): A/V sync after keeping sentence ranges, measured on the real export. Fresh profile, hidden offscreen window.
// Imports the flash/beep source (desktop/make-flash-beep.cjs), puts its picture on V1 and its sound on A1 cut at 4.010 s
// (10 ms off the picture's frames, under half a frame), keeps 1–2 s, 4–5.5 s and 7–8 s through the sentence dialog, so
// the 4.0 s boundary falls where audio and video edges differ by 10 ms; saves, exports with fastExport, and measures
// every flash against its beep with desktop/av-sync-measure.cjs (≤ 40 ms), plus where each flash lands.
//   MONTCLIP_AV_INPUT=<flash-beep.mp4> MONTCLIP_AV_OUT=<folder> electron desktop/av-sync-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// ffmpeg for the export comes from PATH (the server spawns "ffmpeg"); the caller puts MontClip's own build first.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const input=process.env.MONTCLIP_AV_INPUT,outDir=process.env.MONTCLIP_AV_OUT;
if(!input||!outDir)throw Error('MONTCLIP_AV_INPUT and MONTCLIP_AV_OUT are required');
const RANGES=[[1,2],[4,5.5],[7,8]],AUDIO_CUT=4.010,AUDIO_START=0.012;
const {eventTimes}=require('./make-flash-beep.cjs'),Measure=require('./av-sync-measure.cjs');
// where each source event should land in the output: ranges back to back
function expected(){const out=[];let offset=0;for(const [from,to] of RANGES){for(const t of eventTimes())if(t>=from-1e-9&&t<to-1e-9)out.push(Math.round((offset+t-from)*1e6)/1e6);offset+=to-from;}return out;}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 try{
  const bytes=fs.readFileSync(input),inputSha=crypto.createHash('sha256').update(bytes).digest('hex');
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const encoder=process.env.MONTCLIP_AV_ENCODER||null;
  // negative control: MONTCLIP_AV_CONTROL_SHIFT=0.05 moves the sound 50 ms late on the timeline; the check must then fail
  const shift=Number(process.env.MONTCLIP_AV_CONTROL_SHIFT)||0;
  const result=await read(`(${exercise.toString()})(${JSON.stringify({b64:bytes.toString('base64'),ranges:RANGES,audioCut:AUDIO_CUT,audioStart:AUDIO_START,encoder,shift})})`);
  const file=path.join(profileArg.slice('--user-data-dir='.length),'workspace','exports',decodeURIComponent(result.export.outputs[0].src.replace(/^\/exports\//,'')));
  const ffmpeg=require('./make-fixture-av.cjs').resolveFfmpeg();
  const measured=Measure.measure(file,{ffmpeg,limit:0.04,expect:expected()});
  fs.mkdirSync(outDir,{recursive:true});
  const record={input:{sha256:inputSha,bytes:bytes.length},ranges:RANGES,audioClips:result.audio,boundary:{at:4,audioEdge:AUDIO_CUT,offsetMs:Math.round((AUDIO_CUT-4)*1000)},
   plan:result.plan,export:{file:path.basename(file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),bytes:fs.statSync(file).size,report:result.export.outputs[0].report?.line||null},
   encoder:encoder||'project default',controlShift:shift,ffmpeg:require('node:child_process').spawnSync(ffmpeg,['-hide_banner','-version'],{encoding:'utf8',windowsHide:true}).stdout.split(/\r?\n/)[0],measured};
  const name=shift?'av-sync-control':'av-sync';
  fs.writeFileSync(path.join(outDir,name+'.json'),JSON.stringify(record,null,2)+'\n');
  fs.copyFileSync(file,path.join(outDir,name+'-export'+path.extname(file)));
  process.stdout.write('AV_SYNC_'+(measured.ok?'PASS ':'FAIL ')+JSON.stringify({worstMs:Math.round(measured.worst*1000*10)/10,pairs:measured.pairs.length,placementOk:measured.placementOk,unpaired:measured.unpaired})+'\n');
 }catch(e){process.stdout.write('AV_SYNC_ERROR '+(e&&e.message)+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
async function exercise({b64,ranges,audioCut,audioStart,encoder,shift}){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(let i=0;i<200&&!runtime.projectId;i++)await wait(50);
 if(!await flushSave())throw Error('Initial save failed');
 const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 const up=await fetch('/api/upload?name='+encodeURIComponent('合成 闪光提示音.mp4'),{method:'POST',body:new Blob([bin])});
 if(!up.ok)throw Error('upload '+up.status);const {src}=await up.json();
 const doc=projectJSON();
 Object.assign(doc,{name:'AV sync',width:320,height:180,fps:30,
  media:[{id:'fb',src,kind:'video',name:'合成 闪光提示音.mp4',duration:10,width:320,height:180}],
  clips:[{id:'v',kind:'video',mediaId:'fb',track:'V1',start:0,in:0,duration:10,props:{volume:0}},
   {id:'a1',kind:'audio',mediaId:'fb',track:'A1',start:audioStart+shift,in:audioStart,duration:audioCut-audioStart,props:{volume:1}},
   {id:'a2',kind:'audio',mediaId:'fb',track:'A1',start:audioCut+shift,in:audioCut,duration:10-audioCut,props:{volume:1}},
   // one synthetic sentence per kept range (the dialog needs captions; the ranges are typed in)
   ...ranges.map(([from,to],i)=>FableCutCaptions.clip({start:from,end:to,text:'合成句子'+(i+1)},{id:'s'+i,track:'V2',width:320,height:180}))]});
 applyProject(doc);scheduleSave();if(!await flushSave())throw Error('Project save failed');
 await showSentenceSelection();
 const dialog=document.querySelector('.sentence-dialog'),field=dialog.querySelector('[data-ranges]');
 field.value=ranges.map(r=>r.join(',')).join('\n');field.dispatchEvent(new Event('input'));await wait(100);
 if(dialog.querySelector('[data-apply]').disabled)throw Error('ranges refused: '+dialog.querySelector('[data-summary]').textContent);
 dialog.querySelector('[data-apply]').click();await wait(100);
 const clips=project.clips.map(c=>({id:c.id,kind:c.kind,track:c.track,start:Math.round(c.start*1e6)/1e6,in:Math.round(c.in*1e6)/1e6,duration:Math.round(c.duration*1e6)/1e6}));
 scheduleSave();if(!await flushSave())throw Error('Edited save failed');
 setTime(0);await fetchEncodeProfiles();
 // MONTCLIP_AV_ENCODER picks the H.264 encoder (the bundled LGPL ffmpeg has no libx264; ADR 2026-11-02-h264-encoder)
 const exported=await fastExport(encoder?{silent:true,delivery:{preset:'master',video:{codec:'h264',encoder}}}:{silent:true});
 if(!exported?.outputs?.length||exported.outputs.some(o=>!o.ok))throw Error('export failed: '+JSON.stringify(exported));
 return {plan:clips,audio:clips.filter(c=>c.kind==='audio'),export:exported};
}
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
