'use strict';
// Desktop FLV import in the real editor (Deja, replacing #7): fresh profile, hidden offscreen window, synthetic files
// only, and MontClip's own ffmpeg (MONTCLIP_FFMPEG_DIR, put first on PATH for this process; never the system one).
// The file is picked through the editor's own file input (set by the DevTools protocol, as a person picking it).
//  1. A compatible FLV (H.264 + AAC, a white flash and a 1 kHz beep together every 0.5 s) in a Chinese folder:
//     imported without a question; media/ holds a byte-identical copy (sha256) and the compatible MP4; the original
//     is unchanged. A/V sync of the original and of the imported MP4: every flash against its beep, limit 40 ms.
//  2. An FLV that needs re-encoding: the question appears with Cancel focused and nothing copied yet; Cancel leaves
//     media/ exactly as it was.
//   electron desktop/flv-native-smoke.cjs --montclip-smoke --user-data-dir=<fresh dir>   (MONTCLIP_FFMPEG_DIR=<dir>)
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const FF=process.env.MONTCLIP_FFMPEG_DIR;
if(!FF||!fs.existsSync(path.join(FF,process.platform==='win32'?'ffmpeg.exe':'ffmpeg')))throw Error('MONTCLIP_FFMPEG_DIR must hold MontClip\'s own ffmpeg');
process.env.PATH=FF+path.delimiter+process.env.PATH;   // this process and the editor service it starts
const ffmpeg=path.join(FF,process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
const {measure}=require('./av-sync-measure.cjs');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const media=path.join(profileArg.slice('--user-data-dir='.length),'workspace','media');
const listMedia=()=>fs.existsSync(media)?fs.readdirSync(media).sort():[];
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-flv-直播-'));
function make(out,{seconds,codec}){
 const video=`color=c=black:size=320x180:rate=30:duration=${seconds},format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,6)*eq(mod(n-6\\,15)\\,0)'`;
 const audio=`aevalsrc=exprs='gte(t\\,0.2)*lt(mod(t-0.2\\,0.5)\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=${seconds}`;
 const v=codec==='h264'?['-c:v','h264_mf','-pix_fmt','nv12','-b:v','1M','-g','30']:['-c:v','flv','-b:v','1M','-g','30'];
 const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-n','-f','lavfi','-i',video,'-f','lavfi','-i',audio,'-map','0:v','-map','1:a',...v,'-c:a','aac','-b:a','128k','-ac','1','-ar','48000',out],{windowsHide:true});
 if(r.status!==0)throw Error('fixture: '+String(r.stderr).slice(0,300));
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 const out={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  assert.equal(await read(`typeof window.montclipFlv`),'object','the desktop bridge is there');
  const dir=path.join(tmp,'录播 原片');fs.mkdirSync(dir);
  const good=path.join(dir,'直播 闪光 提示音.flv'),bad=path.join(dir,'旧编码.flv');
  make(good,{seconds:10,codec:'h264'});make(bad,{seconds:2,codec:'flv1'});
  const goodHash=sha(good),goodStat=fs.statSync(good);
  const dbg=win.webContents.debugger;dbg.attach('1.3');
  const pick=async(file)=>{const {root}=await dbg.sendCommand('DOM.getDocument',{depth:0});const {nodeId}=await dbg.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'#fileInput'});await dbg.sendCommand('DOM.setFileInputFiles',{nodeId,files:[file]});};
  const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('timeout: '+expr);};
  // 1. compatible: no question, copy + compatible MP4, original unchanged
  const before=listMedia();
  await pick(good);
  await until(`project.media.length===1&&!document.querySelector('[data-flv-import]')`);
  const m=await read(`(()=>{const m=project.media[0];return{src:m.src,originalSrc:m.originalSrc,preparation:m.preparation,kind:m.kind};})()`);
  assert.equal(m.preparation,'remux');assert.match(m.src,/^\/media\/compat-.*\.mp4$/);assert.match(m.originalSrc,/\.flv$/);
  const added=listMedia().filter(f=>!before.includes(f));
  assert.equal(added.length,2,'a copy and the compatible MP4 '+JSON.stringify(added));
  const copy=path.join(media,decodeURIComponent(m.originalSrc.slice('/media/'.length))),mp4=path.join(media,decodeURIComponent(m.src.slice('/media/'.length)));
  assert.equal(sha(copy),goodHash,'the copy is byte for byte the original');
  assert.equal(sha(good),goodHash,'the original is unchanged');assert.equal(fs.statSync(good).mtimeMs,goodStat.mtimeMs);
  const src=measure(good,{ffmpeg}),imp=measure(mp4,{ffmpeg});
  out.sync={source:{ok:src.ok,pairs:src.pairs.length,worstMs:Math.round(src.worst*10000)/10},imported:{ok:imp.ok,pairs:imp.pairs.length,worstMs:Math.round(imp.worst*10000)/10,
    flashShiftMs:Math.round(Math.max(...imp.flashes.map((f,i)=>Math.abs(f-src.flashes[i])))*10000)/10,unpaired:imp.unpaired}};
  assert.ok(src.ok&&imp.ok,'A/V sync within 40 ms '+JSON.stringify(out.sync));
  assert.equal(imp.pairs.length,src.pairs.length,'every flash and beep came through');
  // 2. needs re-encoding: asks first, Cancel focused, nothing copied; Cancel leaves media/ as it was
  const mid=listMedia();
  await pick(bad);
  await until(`!!document.querySelector('[data-flv-ask]:not([hidden])')`);
  const ask=await read(`(()=>{const d=document.querySelector('[data-flv-import]');return{text:d.querySelector('[data-flv-ask]').textContent,focus:document.activeElement&&document.activeElement.hasAttribute('data-flv-cancel'),go:!d.querySelector('[data-flv-continue]').hidden};})()`);
  // JJ v2 (2026-11-04): one sentence — the re-encode one, or the break one when the end is unconfirmed (it is for this
  // synthetic flv1 file); both offer 〔帮我转〕
  const transcodeAsk=await read(`MontClipView.t(mcView.get().language,'flvAskTranscode')`),readableAsk=await read(`MontClipView.t(mcView.get().language,'flvAskReadable')`);
  assert.ok([transcodeAsk,readableAsk].includes(ask.text),ask.text);
  out.askedReadable=ask.text===readableAsk;
  assert.equal(ask.focus,true,'Cancel is focused');assert.equal(ask.go,true);
  assert.deepEqual(listMedia(),mid,'nothing copied before the answer');
  await read(`document.querySelector('[data-flv-cancel]').click();true`);
  await until(`!document.querySelector('[data-flv-import]')`);
  await wait(300);
  assert.deepEqual(listMedia(),mid,'Cancel leaves media/ as it was');
  assert.equal(await read(`project.media.length`),1);
  dbg.detach();
  if(process.env.MONTCLIP_FLV_JSON)fs.writeFileSync(process.env.MONTCLIP_FLV_JSON,JSON.stringify({sync:out.sync,source:{sha256:goodHash,bytes:goodStat.size},src:measure(good,{ffmpeg}),imported:measure(mp4,{ffmpeg})},null,1));
  process.stdout.write('FLV_NATIVE_COMPLETE '+JSON.stringify({added:added.map(f=>f.replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}|-[0-9a-f]{8}\.flv$/,'…')),...out,askFocus:ask.focus})+'\n');
 }catch(e){process.stdout.write('FLV_NATIVE_FAIL '+(e&&e.stack)+'\n');}
 finally{fs.rmSync(tmp,{recursive:true,force:true});setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
