'use strict';
// 「不用 AI，剪辑照常能用」 (JJ's 「AI 数据说明」; Deja, 2026-11-04): with no AI service set up — a fresh profile, no key — a
// recording is imported through the editor's own import, cut (split at the playhead, undo, redo) and exported to MP4.
// Hidden offscreen window; the recording is synthetic (testsrc2 + a sine, 320×180, 6 s, H.264 by Media Foundation);
// nothing goes out: the main process's fetch to anything but the local service is refused and counted.
//   electron desktop/agent-off-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → AGENT_OFF_PASS {…} | AGENT_OFF_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length).trim();
const ffmpeg=require('../ffmpeg-path').path('ffmpeg'),ffprobe=require('../ffmpeg-path').path('ffprobe'),SECONDS=6;
const outside=[],realFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{if(/^http:\/\/127\.0\.0\.1:/.test(String(url)))return realFetch(url,opts);outside.push(String(url));throw Error('NETWORK');};

async function exercise({src,seconds}){
 const wait=(ms)=>new Promise(r=>setTimeout(r,ms)),until=async(f,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(f())return true;await wait(100);}return false;};
 const ai=await montclipAgentService.get();
 // 导入: the editor's own import, as a dropped file
 const blob=await (await fetch(src)).blob();
 await importFiles([new File([blob],'合成 录像.mp4',{type:'video/mp4'})]);
 if(!await until(()=>project.media.some(m=>m.name==='合成 录像.mp4'&&m.duration>0)))throw Error('IMPORT');
 const m=project.media.find(m=>m.name==='合成 录像.mp4');
 if(!project.clips.some(c=>c.mediaId===m.id))addClipFromMedia(m,'V1',0);
 const shots=()=>project.clips.filter(c=>c.mediaId===m.id&&c.kind==='video').length;
 // 剪辑: split at 2 s, undo, redo
 const before=shots();setTime(2);splitAtPlayhead();const split=shots();undo();const undone=shots();redo();const redone=shots();
 if(!(split===before+1&&undone===before&&redone===split))throw Error('EDIT '+JSON.stringify({before,split,undone,redone}));
 scheduleSave();if(!await flushSave())throw Error('SAVE');
 // 导出
 setTime(0);await fetchEncodeProfiles();
 const r=await fastExport({silent:true,delivery:{preset:'master',video:{codec:'h264',encoder:'h264_mf'}}});
 if(!r||!r.outputs||r.outputs.some(o=>!o.ok))throw Error('EXPORT '+JSON.stringify(r));
 return {ai:{configured:ai.configured},imported:{duration:Math.round(m.duration*100)/100,src:m.src},edit:{before,split,undone,redone},export:r.outputs[0].src};
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);let dir=null;
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-off-'));const made=path.join(dir,'staging.mp4');
  cp.execFileSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-n','-f','lavfi','-i',`testsrc2=size=320x180:rate=30:duration=${SECONDS}`,'-f','lavfi','-i',`sine=frequency=440:sample_rate=48000:duration=${SECONDS}`,
   '-c:v','h264_mf','-pix_fmt','nv12','-b:v','500k','-c:a','aac','-b:a','128k','-movflags','+faststart',made],{windowsHide:true});
  // the page reads it from the server's media folder, then imports it as a file
  const media=path.join(profile,'workspace','media');fs.mkdirSync(media,{recursive:true});fs.copyFileSync(made,path.join(media,'staging-off.mp4'));
  const res=await read(`(${exercise.toString()})(${JSON.stringify({src:'/media/staging-off.mp4',seconds:SECONDS})})`);
  const file=path.join(profile,'workspace','exports',decodeURIComponent(res.export.replace(/^\/exports\//,'')));
  const probe=JSON.parse(cp.execFileSync(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',windowsHide:true}));
  const exported={bytes:fs.statSync(file).size,duration:Math.round(Number(probe.format.duration)*100)/100,streams:probe.streams.map(s=>s.codec_type+' '+s.codec_name)};
  const pass=res.ai.configured===false&&exported.duration>=SECONDS-0.2&&exported.streams.some(s=>s.startsWith('video'))&&exported.streams.some(s=>s.startsWith('audio'))&&outside.length===0;
  process.stdout.write((pass?'AGENT_OFF_PASS ':'AGENT_OFF_FAIL ')+JSON.stringify({...res,exported,outside})+'\n');
 }catch(e){process.stdout.write('AGENT_OFF_FAIL '+(e&&e.message)+'\n');}
 finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true}});}}};}return load.call(this,id,...args);};}
require('./main');
