'use strict';
// N25 (Deja 2026-11-03): the canvas and the export follow the recording. Fresh profile, hidden offscreen window,
// synthetic files only, MontClip's own ffmpeg (MONTCLIP_FFMPEG_DIR) and no ffmpeg anywhere else on PATH. Files are picked
// through the editor's own file input (DevTools protocol), from a folder with Chinese characters and a space.
// Every source has a white flash with a 1 kHz beep every ~0.5 s, and each frame's number written as 12 white/black
// blocks along the bottom, so an exported frame says which source frame it shows.
//  1. A new project (the default canvas), a 1920×1080 60 fps recording with 48 kHz sound picked: the project becomes
//     1920×1080 at 60 fps. 〔直接导出〕 of 5 s: 1920×1080, 60 fps, 300 frames, 48 kHz, every flash with its beep (≤ 40 ms),
//     and every exported frame the next source frame (no frame shown twice, none skipped).
//  2. A VFR FLV like 录播姬's (odd frames 3 ms late: intervals alternating ~19.7 / 13.7 ms around a 59.94 grid): the
//     project becomes 59.94 fps; 1 s to 5 s exported has round(4 × 59.94) = 240 frames, each the next source frame.
//     Measured only: an FLV with one dropped frame. Before decision A (2026-11-04) it was refused (FLV_TIMELINE_GAP);
//     now a late picture with the sound running on is not a break, so it imports.
//  3. A 1280×720 25 fps recording: the canvas becomes 1280×720 at 25 (never scaled up); a 45 fps one: 30, and the toast
//     says the rate is unusual (each case checks its toast).
//  4. A canvas the streamer chose (9:16 in the aspect menu) is kept; 5. a project with something on its timeline is kept.
//  MONTCLIP_SF_TIMING=1 also exports one 60 s 1080p60 recording at 30 and at 60 fps and writes the times and sizes.
//   electron desktop/source-follow-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → SOURCE_FOLLOW_PASS / _FAIL
//   (MONTCLIP_SF_JSON=<file> writes the measurements)
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length).trim();
const FF=process.env.MONTCLIP_FFMPEG_DIR,EXE=process.platform==='win32'?'.exe':'';
if(!FF||!fs.existsSync(path.join(FF,'ffmpeg'+EXE)))throw Error('MONTCLIP_FFMPEG_DIR must hold MontClip\'s own ffmpeg');
const ffmpeg=path.join(FF,'ffmpeg'+EXE),ffprobe=path.join(FF,'ffprobe'+EXE);
const Measure=require('./av-sync-measure.cjs');
const TIMING=process.env.MONTCLIP_SF_TIMING==='1';
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-源 跟随-'));
const BITS=12;

/** A synthetic recording: black, a white flash over the top 80 % with a 20 ms 1 kHz beep at frames first, first+every…,
 *  the frame number in 12 blocks along the bottom. vfr: seconds added to odd frames' times (flashes are on even ones);
 *  gapAt: from that frame on, every frame one interval later (a dropped frame's hole). The encoder (h264_mf) ignores input
 *  times, so the times are rewritten afterwards, packet by packet (setts), as a recorder writes them. */
function make(file,{w,h,num,den,seconds,vfr=0,gapAt=null,ar=48000,first,every,container,busy=false}){
 const bw=Math.floor(w/BITS),bh=Math.round(h/10),rate=num+'/'+den;
 const bits=[...Array(BITS)].map((_,k)=>`drawbox=x=${k*bw}:y=${h-bh}:w=${bw}:h=${bh}:color=white:t=fill:enable='eq(mod(floor(n/${2**k})\\,2)\\,1)'`).join(',');
 const video=(busy?`testsrc2=size=${w}x${h}:rate=${rate}:duration=${seconds},format=yuv420p,`:`color=c=black:size=${w}x${h}:rate=${rate}:duration=${seconds},format=yuv420p,`)+
  `drawbox=x=0:y=0:w=iw:h=${Math.round(h*0.8)}:color=white:t=fill:enable='gte(n\\,${first})*eq(mod(n-${first}\\,${every})\\,0)',${bits}`;
 const t0=first*den/num,period=every*den/num;
 const audio=`aevalsrc=exprs='gte(t\\,${t0})*lt(mod(t-${t0}\\,${period})\\,0.02)*0.8*sin(2*PI*1000*t)':s=${ar}:d=${seconds}`;
 const run=(args)=>{const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y',...args],{windowsHide:true,timeout:20*60*1000});if(r.status!==0)throw Error('fixture: '+String(r.stderr).slice(0,400));};
 const retime=vfr||gapAt!=null,enc=retime?file+'.cfr.mp4':file;
 run(['-f','lavfi','-i',video,'-f','lavfi','-i',audio,'-map','0:v','-map','1:a','-c:v','h264_mf','-pix_fmt','nv12','-b:v',w>=1920?'6M':'2M','-g',String(Math.round(num/den)),
  '-c:a','aac','-b:a','128k','-ac','2','-ar',String(ar),...(container==='mp4'||retime?['-movflags','+faststart']:[]),enc]);
 if(retime){
  const shift=vfr?`if(mod(N\\,2)\\,${vfr}/TB\\,0)`:`if(gte(N\\,${gapAt})\\,${den/num}/TB\\,0)`;
  run(['-i',enc,'-map','0','-c','copy','-bsf:v',`setts=ts=TS+${shift}`,...(container==='mp4'?['-movflags','+faststart']:[]),file]);fs.rmSync(enc);
 }
 const ev=[];for(let n=first;n<seconds*num/den;n+=every)ev.push(n*den/num);
 return{file,events:ev};
}
const probe=(file)=>JSON.parse(cp.spawnSync(ffprobe,['-v','error','-count_frames','-show_entries',
 'stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_read_frames,sample_rate,start_time:format=duration','-of','json',file],{encoding:'utf8',windowsHide:true}).stdout||'{}');
const rate=(s)=>{const[a,b]=String(s||'').split('/').map(Number);return b>0?a/b:0;};
/** The source frame number each exported frame shows (read from the blocks), in stored order. */
function frameNumbers(file){
 const W=96,H=54,r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',file,'-map','0:v:0','-vf',`scale=${W}:${H}:flags=area,format=gray`,
  '-fps_mode','passthrough','-f','rawvideo','-'],{maxBuffer:1<<28,windowsHide:true});
 if(r.status!==0)throw Error('decode: '+String(r.stderr).slice(0,300));
 const buf=r.stdout,row=H-3,step=W/BITS,ns=[];
 for(let i=0;i+W*H<=buf.length;i+=W*H){let n=0;for(let k=0;k<BITS;k++)if(buf[i+row*W+Math.floor(k*step+step/2)]>128)n|=1<<k;ns.push(n);}
 return ns;
}
/** Exported frames that repeat the frame before them, and jumps of more than one source frame. */
function steps(ns){let repeats=0,skips=0;for(let i=1;i<ns.length;i++){const d=ns[i]-ns[i-1];if(d===0)repeats++;else if(d!==1)skips++;}return{repeats,skips};}

const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 const report={};let pass=false;
 const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 try{
  await until(`state.connected`,15000);
  // no ffmpeg on PATH: the editor service can only use MontClip's own
  const where=cp.spawnSync(process.platform==='win32'?'where':'which',['ffmpeg'],{encoding:'utf8',windowsHide:true});
  report.pathFfmpeg=where.status===0?where.stdout.trim():null;assert.equal(report.pathFfmpeg,null,'no ffmpeg on PATH');
  const dir=path.join(tmp,'录播 原片');fs.mkdirSync(dir);
  const dbg=win.webContents.debugger;dbg.attach('1.3');
  const pick=async(file)=>{const{root}=await dbg.sendCommand('DOM.getDocument',{depth:0});const{nodeId}=await dbg.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#fileInput'});await dbg.sendCommand('DOM.setFileInputFiles',{nodeId,files:[file]});};
  const fresh=async(name)=>read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:${JSON.stringify(name)},open:true});if(!await syncFromServer(true))throw Error('CREATE');return{w:project.width,h:project.height,fps:project.fps};})()`);
  // the recording is in the bin with its details (frame rate from the server's ffprobe)
  const imported=async(file,n=1)=>{await pick(file);try{await until(`project.media.length===${n}&&project.media.at(-1).fps>0&&!document.querySelector('[data-flv-import]')`,120000);}catch(e){out("SF_DEBUG",await read(`({media:project.media.map(m=>({n:m.name,fps:m.fps,size:m.size,src:m.src})),toast:document.getElementById("toast").textContent,dlg:!!document.querySelector("[data-flv-import]")})`));throw e;}await wait(600);
   return read(`({w:project.width,h:project.height,fps:project.fps,toast:document.getElementById('toast').textContent,media:(({fps,width,height,sampleRate})=>({fps,width,height,sampleRate}))(project.media.at(-1))})`);};
  /** 〔直接导出〕 of [s, e] of the last imported recording, through 自动出切片's own export; the file's path. */
  const direct=async(s,e)=>{const r=await read(`(async()=>{const m=project.media.at(-1);openAutoSlices();const st=autoState();
    st.clips=[{id:'sf1',mediaId:m.id,s:${s},e:${e},on:true,kind:'talk',title:'跟随 smoke',reasons:[]}];autoExport();
    const end=Date.now()+20*60000;while(Date.now()<end){const q=(st.exportIds||[]).map(id=>exportQueue.find(x=>x.id===id));if(q.length&&q.every(x=>x&&(x.status==='done'||x.status==='failed')))break;await new Promise(r=>setTimeout(r,300));}
    const q=st.exportIds.map(id=>exportQueue.find(x=>x.id===id))[0];AUTO.el&&AUTO.el.close();return{status:q.status,error:q.error||null,label:q.label};})()`);
   direct.label=r.label;
   if(r.status!=='done')throw Error('export '+JSON.stringify(r));
   const files=fs.readdirSync(path.join(profile,'workspace','exports')).map(f=>path.join(profile,'workspace','exports',f)).filter(f=>/\.mp4$/i.test(f)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
   return files[0];};
  const check=(file,{w,h,fps,seconds,events})=>{
   const p=probe(file),v=p.streams.find(s=>s.codec_type==='video'),a=p.streams.find(s=>s.codec_type==='audio');
   const ns=frameNumbers(file),st=steps(ns),m=Measure.measure(file,{ffmpeg,limit:0.04,expect:events});
   return{width:v.width,height:v.height,avgFps:+rate(v.avg_frame_rate).toFixed(3),frames:+v.nb_read_frames,expectFrames:Math.round(seconds*fps),
    sampleRate:+a.sample_rate,firstFrames:ns.slice(0,6),repeats:st.repeats,skips:st.skips,syncWorstMs:Math.round(m.worst*1e4)/10,syncOk:m.ok,placementOk:m.placementOk,bytes:fs.statSync(file).size};};

  // 1. 1080p60, 48 kHz, an MP4 in a Chinese folder with a space
  const s1=make(path.join(dir,'直播 1080p60.mp4'),{w:1920,h:1080,num:60,den:1,seconds:6,first:12,every:30,container:'mp4'});
  report.defaultCanvas=await fresh('跟随 1');
  report.p1=await imported(s1.file);
  const e1=check(await direct(0,5),{fps:60,seconds:5,events:s1.events.filter(t=>t<5)});report.e1=e1;
  // 2. VFR FLV around 59.94: odd frames 3 ms late, so the intervals alternate 19.7 / 13.7 ms (a break in the recording
  //    is where the sound stops; a late picture is not one — recorded below)
  const s2=make(path.join(dir,'录播姬 VFR.flv'),{w:1280,h:720,num:60000,den:1001,seconds:6,vfr:0.003,first:12,every:30,container:'flv'});
  report.s2probe=(({avg_frame_rate,r_frame_rate,start_time})=>({avg_frame_rate,r_frame_rate,start_time}))(probe(s2.file).streams.find(s=>s.codec_type==='video'));
  await fresh('跟随 2');report.p2=await imported(s2.file);
  // from 1 s to 5 s, as a slice from the middle of a recording. The FLV's picture starts later than its sound (AAC's
  // 1024-sample head: first frame at start_time), so a flash is at its frame's time + start_time in the file.
  const v2=+report.s2probe.start_time||0;
  const e2=check(await direct(1,5),{fps:60000/1001,seconds:4,events:s2.events.map(t=>t+v2-1).filter(t=>t>=0&&t<4)});report.e2=e2;
  // measured, not checked here: an FLV with one dropped frame (a 33 ms interval, the sound running on)
  {const s=make(path.join(dir,'掉一帧.flv'),{w:640,h:360,num:60000,den:1001,seconds:2,gapAt:40,first:12,every:30,container:'flv'});
   await fresh('掉帧');await pick(s.file);await wait(4000);
   report.droppedFrameFlv=await read(`({imported:project.media.length,toast:document.getElementById('toast').textContent})`);}
  // 3. 720p25: never scaled up
  const s3=make(path.join(dir,'小 720p25.mp4'),{w:1280,h:720,num:25,den:1,seconds:2,first:5,every:12,container:'mp4'});
  await fresh('跟随 3');report.p3=await imported(s3.file);
  // 3b. 45 fps, no standard rate near: 30, and the toast says why
  const s7=make(path.join(dir,'怪 45 帧.mp4'),{w:640,h:360,num:45,den:1,seconds:2,first:5,every:20,container:'mp4'});
  await fresh('跟随 3b');report.p3b=await imported(s7.file);
  // the toast says to change it in the frame rate menu above the preview: that menu is there, above the preview, and it sets
  // the project's frame rate
  report.fpsMenu=await read(`(()=>{const s=document.getElementById('fpsSel'),p=document.getElementById('preview'),r=s.getBoundingClientRect(),q=p.getBoundingClientRect();
    const shown=r.width>0&&getComputedStyle(s).visibility!=='hidden';const i=[...s.options].findIndex(o=>/^25\\b/.test(o.textContent));s.value=String(i);s.dispatchEvent(new Event('change'));
    return{shown,above:r.bottom<=q.top+1,fps:project.fps};})()`);
  assert.deepEqual(report.fpsMenu,{shown:true,above:true,fps:25},'the frame rate menu above the preview sets the project\'s rate');
  // 4. the streamer chose 9:16: kept
  await fresh('跟随 4');
  await read(`(()=>{const i=ASPECT_PRESETS.findIndex(a=>a.w===1080&&a.h===1920);els.aspectSel.value=String(i);els.aspectSel.dispatchEvent(new Event('change'));return true;})()`);
  report.p4=await imported(s1.file);
  // 5. something on the timeline already: kept
  await fresh('跟随 5');
  await read(`(()=>{const doc=projectJSON();doc.clips.push({id:'c_t',kind:'text',mediaId:null,track:'V2',start:0,in:0,duration:3,props:{text:'已有内容'}});applyProject(doc);scheduleSave();return true;})()`);
  report.p5=await imported(s1.file);
  if(TIMING){
   const s6=make(path.join(dir,'一分钟 1080p60.mp4'),{w:1920,h:1080,num:60,den:1,seconds:61,first:12,every:30,container:'mp4',busy:true});
   report.timing={};
   for(const fps of [30,60]){await fresh('计时 '+fps);await imported(s6.file);await read(`(()=>{project.fps=${fps};project.canvasUser=true;scheduleSave();return true;})()`);
    const t=Date.now(),f=await direct(0,60);report.timing[fps]={ms:Date.now()-t,bytes:fs.statSync(f).size,label:direct.label,...(({frames,avgFps,width,height})=>({frames,avgFps,width,height}))(check(f,{fps,seconds:60,events:[]}))};}
  }
  dbg.detach();
  out('SOURCE_FOLLOW_MEASURED',report);
  // the checks
  assert.deepEqual({w:report.p1.w,h:report.p1.h,fps:report.p1.fps},{w:1920,h:1080,fps:60},'1080p60 recording → 1920×1080 at 60');
  assert.deepEqual([e1.width,e1.height,e1.avgFps,e1.frames,e1.sampleRate],[1920,1080,60,300,48000]);
  assert.equal(e1.repeats+e1.skips,0,'each exported frame is the next source frame');assert.ok(e1.syncOk,'A/V within 40 ms');
  assert.deepEqual({w:report.p2.w,h:report.p2.h,fps:report.p2.fps},{w:1280,h:720,fps:59.94},'VFR around 59.94 → 59.94');
  assert.equal(e2.frames,e2.expectFrames,'frame count');assert.equal(e2.repeats+e2.skips,0,'VFR: no frame shown twice');assert.ok(e2.syncOk,'VFR: A/V within 40 ms');
  assert.deepEqual({w:report.p3.w,h:report.p3.h,fps:report.p3.fps},{w:1280,h:720,fps:25},'720p25 → 1280×720 at 25');
  assert.deepEqual({w:report.p3b.w,h:report.p3b.h,fps:report.p3b.fps},{w:640,h:360,fps:30},'45 fps → 30');
  const T=(k,v)=>read(`uiText(${JSON.stringify('own.'+k)},${JSON.stringify(v)})`);
  assert.equal(report.p1.toast,await T('canvas-follow',{w:1920,h:1080,fps:60}),'the toast says what was set');
  assert.equal(report.p3b.toast,await T('canvas-follow-odd',{w:640,h:360,fps:30,src:45}));
  assert.deepEqual({w:report.p4.w,h:report.p4.h,fps:report.p4.fps},{w:1080,h:1920,fps:30},'a chosen canvas is kept');
  assert.deepEqual({w:report.p5.w,h:report.p5.h,fps:report.p5.fps},{w:report.defaultCanvas.w,h:report.defaultCanvas.h,fps:report.defaultCanvas.fps},'a project with content is kept');
  pass=true;
 }catch(e){out('SOURCE_FOLLOW_FAIL',{error:String(e&&e.stack||e).slice(0,1200)});}
 finally{
  if(process.env.MONTCLIP_SF_JSON)try{fs.writeFileSync(process.env.MONTCLIP_SF_JSON,JSON.stringify(report,null,1)+'\n');}catch{}
  try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}
  if(pass)out('SOURCE_FOLLOW_PASS',{p1:report.p1,p2:report.p2,timing:report.timing||null});
  process.exitCode=pass?0:1;app.exit(pass?0:1);
 }
 await new Promise(()=>{});
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
