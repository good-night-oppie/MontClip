'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const cp=require('node:child_process'),FF=require('../server/ffmpeg-path');
test('bounded ProRes REST export, invalid boundary and cancellation', {timeout:60000}, async t=>{
  if(!FF.available('ffmpeg')||!FF.available('ffprobe'))return t.skip('ffmpeg/ffprobe unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-prores-api-')),token=crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(require('./helpers').seedProject()));
  const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe');
  const jpeg=cp.execFileSync(ff,['-v','error','-f','lavfi','-i','color=s=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  const wav=path.join(dir,'long.wav');cp.execFileSync(ff,['-v','error','-f','lavfi','-i','sine=duration=5:sample_rate=48000','-c:a','pcm_s16le',wav]);
  const child=cp.spawn(process.execPath,[path.resolve(__dirname,'../server/server.js')],{windowsHide:true,env:{...process.env,FABLECUT_DATA_DIR:dir,HOST:'127.0.0.1',PORT:'0',MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token},stdio:['ignore','ignore','ignore','ipc']});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  t.after(async()=>{if(child.exitCode===null){child.kill();await exited;}fs.rmSync(dir,{recursive:true,force:true});});
  const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned IPC ready timeout')),15000);child.once('exit',code=>{clearTimeout(timer);reject(Error('owned server exited before ready: '+code));});child.once('error',e=>{clearTimeout(timer);reject(e);});child.on('message',m=>{if(m.type==='montclip-ready'){clearTimeout(timer);resolve(m.origin);}});});
  const post=(url,body)=>fetch(origin+url,{method:'POST',headers:{'X-MontClip-Session':token},body:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  for(const frames of [0,-1,1.5,'30']){const r=await post('/api/export/begin',{fps:30,frames,profile:'prores422'});assert.equal(r.status,400,await r.text());}
  const begin=async()=>{const r=await post('/api/export/begin',{fps:30,frames:30,profile:'prores422',name:'finite',hasAudio:true});const s=await r.json();assert.equal(r.status,200,s.error);return s;};
  const begun=await begin(), id=begun.id;assert.equal((await post('/api/export/audio?id='+id,fs.readFileSync(wav))).status,200);
  assert.equal((await post('/api/export/frame?id='+id,Buffer.concat(Array(30).fill(jpeg)))).status,200);
  const r=await post('/api/export/end?id='+id),out=await r.json();assert.equal(r.status,200,out.error);
  const file=path.join(dir,decodeURIComponent(out.src));
  const streams=JSON.parse(cp.execFileSync(probe,['-v','error','-count_frames','-show_streams','-of','json',file])).streams;
  assert.equal(+streams.find(s=>s.codec_type==='video').nb_read_frames,30);
  assert.equal(+streams.find(s=>s.codec_type==='audio').duration_ts,48000,'long source must stop at 1s, not wait for 5s');
  const cancelled=await begin();await post('/api/export/audio?id='+cancelled.id,fs.readFileSync(wav));await post('/api/export/frame?id='+cancelled.id,jpeg);
  assert.equal((await post('/api/export/end?id='+cancelled.id+'&discard=1&token='+cancelled.endToken)).status,200);
  assert.equal((await post('/api/export/frame?id='+cancelled.id,jpeg)).status,404);
  const until=Date.now()+6000;while(Date.now()<until&&fs.readdirSync(path.join(dir,'exports')).some(f=>f.endsWith('.part.mov')||f.startsWith('fablecut-')))await new Promise(r=>setTimeout(r,30));
  assert.deepEqual(fs.readdirSync(path.join(dir,'exports')),[path.basename(file)],'cancelled partial file and temp mix removed');
  // Test-only injection into a second owned process; never edit the shared
  // encoding-profiles.json while another test or user might be reading it.
  const rejectedDir=path.join(dir,'rejected');fs.mkdirSync(rejectedDir);
  fs.writeFileSync(path.join(rejectedDir,'project.json'),JSON.stringify(require('./helpers').seedProject()));
  const hook=path.join(dir,'invalid-profile.cjs');
  fs.writeFileSync(hook,`const e=require(${JSON.stringify(path.resolve(__dirname,'../server/encode-profiles.js'))});const original=e.resolveProfile;e.resolveProfile=id=>{const p=original(id);return id==='prores422'?{...p,args:[...p.args,'-map','[unknown]']}:p;};`);
  const bad=cp.spawn(process.execPath,['--require',hook,path.resolve(__dirname,'../server/server.js')],{windowsHide:true,env:{...process.env,FABLECUT_DATA_DIR:rejectedDir,HOST:'127.0.0.1',PORT:'0',MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token},stdio:['ignore','ignore','ignore','ipc']});
  const stopped=new Promise(resolve=>bad.once('exit',resolve));
  try {
    const badOrigin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned rejection server timeout')),15000);bad.once('error',e=>{clearTimeout(timer);reject(e);});bad.once('exit',code=>{clearTimeout(timer);reject(Error('owned rejection server exited '+code));});bad.on('message',m=>{if(m.type==='montclip-ready'){clearTimeout(timer);resolve(m.origin);}});});
    const refused=await fetch(badOrigin+'/api/export/begin',{method:'POST',headers:{'X-MontClip-Session':token},body:JSON.stringify({fps:30,frames:30,profile:'prores422'}),signal:AbortSignal.timeout(15000)});
    assert.equal(refused.status,400);assert.equal((await refused.json()).code,'PROFILE_FILTER_MAPPING_UNSUPPORTED');
    assert.deepEqual(fs.readdirSync(path.join(rejectedDir,'exports')),[],'unknown mapping is refused before dry run or directory allocation');
  } finally {if(bad.exitCode===null){bad.kill();await stopped;}}
});
