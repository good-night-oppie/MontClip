'use strict';
// Explicit, offscreen, synthetic-only reframe/export check; never an acceptance receipt.
const electron=require('electron'),{app,BrowserWindow}=electron,a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profile=process.argv.find(x=>x.startsWith('--user-data-dir='))?.split('=').slice(1).join('='),dir=process.env.MONTCLIP_FFMPEG_DIR;
if(!profile||!dir)throw Error('Fresh profile and bundled FFmpeg directory required');
const ffmpeg=path.join(dir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),{measure}=require('./av-sync-measure.cjs');
function source(file){
 const video="color=c=black:size=192x108:rate=30:duration=6,format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,6)*eq(mod(n-6\\,15)\\,0)'";
 const audio="aevalsrc=exprs='gte(t\\,0.2)*lt(mod(t-0.2\\,0.5)\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=6";
 const r=cp.spawnSync(ffmpeg,['-v','error','-n','-f','lavfi','-i',video,'-f','lavfi','-i',audio,'-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','4','-c:a','aac','-ac','1',file],{windowsHide:true});a.equal(r.status,0,String(r.stderr));
}
const loadURL=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await loadURL.apply(this,args);const read=s=>this.webContents.executeJavaScript(s),report={synthetic:true,offscreen:true};let ok=false;
 try{
  await read(`(async()=>{const end=Date.now()+15000;while(!state.connected&&Date.now()<end)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');await pjPost({action:'new',name:'Reframe synthetic',open:true});await syncFromServer(true);})()`);
  const media=path.join(profile,'workspace','media');fs.mkdirSync(media,{recursive:true});source(path.join(media,'synthetic.mp4'));
  await read(`(async()=>{const d=projectJSON();Object.assign(d,{width:192,height:108,fps:30,media:[{id:'m',src:'/media/synthetic.mp4',name:'synthetic.mp4',kind:'video',duration:6,width:192,height:108}],clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:6,props:{volume:0},linkGroup:'g'},{id:'a',kind:'audio',mediaId:'m',track:'A1',start:0,in:0,duration:6,props:{volume:1},linkGroup:'g'}]});applyProject(d);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  const before=await read('project.clips.map(({linkGroup,...c})=>c)');
  report.reframe=await read(`runAgentReframe('9:16')`);a.equal(report.reframe.ok,true);
  report.canvas=await read('({width:project.width,height:project.height,fit:getClip("v").props.fit})');a.equal(report.canvas.fit,'cover');a.ok(Math.abs(report.canvas.width/report.canvas.height-9/16)<.01);
  await read(`(async()=>{if(!await flushSave())throw Error('SAVE');queueAdd(sliceDeliverySpec(),'reframe-synthetic');await runQueue();})()`);
  const q=await read('exportQueue.at(-1)');a.equal(q.status,'done',JSON.stringify(q));
  const m=measure(path.join(profile,'workspace','exports',q.file),{ffmpeg,expect:Array.from({length:12},(_,i)=>.2+i*.5)});
  report.export={duration:m.duration,frames:m.frames,pairs:m.pairs?.length,worstMs:m.worst*1000,limitMs:m.limit*1000,placementOk:m.placementOk};a.equal(m.ok,true,JSON.stringify(report.export));a.equal(m.frames,180);
  await read('undo();true');a.deepEqual(await read('project.clips.map(({linkGroup,...c})=>c)'),before);a.equal(await read('!!project.clips[0].linkGroup&&project.clips[0].linkGroup===project.clips[1].linkGroup'),true);a.equal(await read('SeqLib.entries(seqRoot()).length'),1);report.oneUndo=true;ok=true;
 }catch(e){report.error=String(e.stack||e).slice(0,1500);}
 finally{process.stdout.write((ok?'REFRAME_REVIEW_PASS ':'REFRAME_REVIEW_FAIL ')+JSON.stringify(report)+'\n');app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
