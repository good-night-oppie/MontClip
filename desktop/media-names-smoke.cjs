'use strict';
// A recording with a Chinese name keeps it (Deja 2026-11-03). Fresh profile, hidden offscreen window, a synthetic WAV.
// Uploaded through the editor's own /api/upload as 「11月2日 直播 合成.wav」 (twice: the second gets _1); the file is
// on disk under that name, the server reads its details, and the page plays it (loadedmetadata, the right length).
//   electron desktop/media-names-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → MEDIA_NAMES_PASS / MEDIA_NAMES_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
function wav(seconds,rate=16000){const n=seconds*rate,d=Buffer.alloc(n*2);for(let i=0;i<n;i++)d.writeInt16LE(Math.round(Math.sin(2*Math.PI*330*i/rate)*0.3*32767),i*2);
 const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+d.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(d.length,40);return Buffer.concat([h,d]);}
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  const b64=wav(3).toString('base64');
  const r=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const up=()=>fetch('/api/upload?name='+encodeURIComponent('11月2日 直播 合成.wav'),{method:'POST',body:b}).then(r=>r.json());
   const a=await up(),b2=await up();const info=await fetch('/api/media-info?src='+encodeURIComponent(decodeURIComponent(a.src))).then(r=>r.json());
   const el=document.createElement('audio');el.src=a.src;const dur=await new Promise((res,rej)=>{el.onloadedmetadata=()=>res(el.duration);el.onerror=()=>rej(Error('NO_PLAY'));setTimeout(()=>rej(Error('SLOW')),15000);});
   return{a:decodeURIComponent(a.src),b:decodeURIComponent(b2.src),info:info.info&&{duration:info.info.duration,size:info.info.size},dur};})()`);
  report.r=r;
  assert.equal(r.a,'/media/11月2日 直播 合成.wav');assert.equal(r.b,'/media/11月2日 直播 合成_1.wav');
  assert.ok(r.info&&r.info.size>0,'the server reads its details');assert.ok(Math.abs(r.dur-3)<0.1,'the page plays it: '+r.dur);
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1200);}
 finally{out(ok?'MEDIA_NAMES_PASS':'MEDIA_NAMES_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
