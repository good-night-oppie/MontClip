'use strict';
// P2 on a recording of real length (Deja, #52): how long reading the highlight signals takes, and the peak memory.
// Fresh profile, hidden offscreen window, a synthetic file only (MONTCLIP_HL_INPUT, e.g. a 2-hour 160×90 test clip made
// with MontClip's own ffmpeg). The file is copied into this profile's media folder; nothing else is touched.
//   MONTCLIP_HL_INPUT=<synthetic.mp4> electron desktop/highlights-perf.cjs --montclip-smoke --user-data-dir=<fresh>
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const input=process.env.MONTCLIP_HL_INPUT;if(!input)throw Error('MONTCLIP_HL_INPUT is required');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 let timer=null;const peak={total:0,renderer:0,browser:0,gpu:0};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const media=path.join(profileArg.slice('--user-data-dir='.length),'workspace','media'),name=path.basename(input);
  fs.mkdirSync(media,{recursive:true});fs.copyFileSync(input,path.join(media,name));
  const info=await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));
   const r=await fetch('/api/media-info?src='+encodeURIComponent('/media/'+${JSON.stringify(name)}));const j=await r.json();return j.info;})()`);
  const duration=Math.round(info.duration);
  await read(`(async()=>{const doc=projectJSON(),D=${duration},sentences=[];
   for(let t=0;t+5<=D;t+=6)sentences.push(FableCutCaptions.clip({start:t,end:t+5,text:'合成句子'+t},{id:'s'+t,track:'V2',width:1280,height:720}));
   Object.assign(doc,{media:[{id:'m',src:'/media/'+${JSON.stringify(name)},kind:'video',name:${JSON.stringify(name)},duration:D,width:160,height:90}],
    clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:D,props:{volume:0}},{id:'a',kind:'audio',mediaId:'m',track:'A1',start:0,in:0,duration:D,props:{volume:1}},...sentences]});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');})()`);
  const sample=()=>{let total=0;for(const m of app.getAppMetrics()){const ws=(m.memory&&m.memory.workingSetSize||0)*1024;total+=ws;const k=m.type==='Tab'?'renderer':m.type==='Browser'?'browser':m.type==='GPU'?'gpu':null;if(k)peak[k]=Math.max(peak[k],ws);}peak.total=Math.max(peak.total,total);};
  sample();const base={...peak};timer=setInterval(sample,250);
  const r=await read(`(async()=>{const t0=performance.now();const sig=await highlightSignals();const t1=performance.now();const cards=MontClipHighlights.candidates(sig);const t2=performance.now();
   return{readMs:Math.round(t1-t0),candidatesMs:Math.round(t2-t1),bins:sig.loudness?sig.loudness.values.length:0,beats:sig.beats.length,sentences:sig.sentences.length,cards:cards.length,
    first:cards.slice(0,5).map(c=>[c.from,c.to,c.reasons.map(x=>x.signal).join('+')])};})()`);
  clearInterval(timer);sample();
  const mb=x=>Math.round(x/1048576);
  process.stdout.write('HIGHLIGHTS_PERF '+JSON.stringify({durationS:duration,file:{name,bytes:fs.statSync(input).size},...r,
   peakMB:{total:mb(peak.total),renderer:mb(peak.renderer),browser:mb(peak.browser),gpu:mb(peak.gpu)},beforeMB:{total:mb(base.total),renderer:mb(base.renderer)},cpus:require('node:os').cpus().length,cpu:require('node:os').cpus()[0].model})+'\n');
 }catch(e){process.stdout.write('HIGHLIGHTS_PERF_FAIL '+(e&&e.message)+'\n');}
 finally{if(timer)clearInterval(timer);setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
