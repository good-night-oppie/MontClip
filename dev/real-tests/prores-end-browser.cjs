/* Synthetic browser acceptance of bounded JPEG ProRes export.
 * Own server: PORT=0 + authenticated IPC receipt. Own Chrome: private profile and
 * inherited CDP pipes, never a user browser or a pre-existing debugging port. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cp=require('node:child_process');
const {execFileSync}=cp;
const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..','..');

const OUT=path.resolve(process.argv[2]||'out/prores-end-browser');
if(fs.existsSync(OUT))throw Error('Output must be a new directory');
fs.mkdirSync(OUT,{recursive:true});
const DATA=path.join(OUT,'data'),MEDIA=path.join(DATA,'media'),PROFILE=path.join(OUT,'chrome-profile');
fs.mkdirSync(MEDIA,{recursive:true});
const FF=require('../../ffmpeg-path').path('ffmpeg');
const PROBE=require('../../ffmpeg-path').path('ffprobe');
const chrome=process.env.MONTCLIP_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const json=(name,x)=>fs.writeFileSync(path.join(OUT,name),JSON.stringify(x,null,2)+'\n');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const vfr=process.argv.includes('--vfr'),fps=vfr?30000/1001:30,frames=vfr?37:360,duration=frames/fps,samples=Math.round(duration*48000);
const receipt={completed:false,simulated:true,runnerSha256:sha(__filename),operations:[],checks:[],exports:[],pids:{},timing:{},
  limits:['Automated CDP input and existing functions, not human usability measurement',
    'Synthetic export boundary test; not human experience or full service restart acceptance']};
let server,browser,cdp,session,origin;
const token=crypto.randomBytes(32).toString('hex');
receipt.codeHashes=Object.fromEntries(['app.js','server.js','encode-profiles.js'].map(f=>[f,sha(path.join(ROOT,f))]));
receipt.tools={ffmpegSha256:sha(FF),ffprobeSha256:sha(PROBE),ffmpegVersion:execFileSync(FF,['-version'],{encoding:'utf8'}).split(/\r?\n/)[0]};
function check(name,ok){receipt.checks.push({name,ok:!!ok});assert.ok(ok,name);}
function encode(args){execFileSync(FF,['-v','error',...args],{stdio:'pipe'});}
function command(child){
  let seq=0,buf=Buffer.alloc(0);const pending=new Map();
  child.stdio[4].on('data',chunk=>{buf=Buffer.concat([buf,chunk]);let end;
    while((end=buf.indexOf(0))>=0){const raw=buf.subarray(0,end).toString();buf=buf.subarray(end+1);if(!raw)continue;
      const m=JSON.parse(raw),p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);
      m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser exited'));}pending.clear();});
  child.on('error',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned browser spawn failed'));}pending.clear();});
  return (method,params={},sid)=>new Promise((resolve,reject)=>{const id=++seq;
    if(!child.pid||child.exitCode!==null||child.signalCode){reject(Error('owned browser is not running'));return;}
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},180000);
    pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})})+'\0');});
}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;}
async function ready(){const until=Date.now()+30000;while(Date.now()<until){
  try{if(await evaluate('typeof projectJSON==="function" && state.connected && project.media.length===2'))return;}catch{}
  await wait(100);}throw Error('Editor readiness timeout');}
async function snapshot(name){await evaluate('(async()=>{if(!await flushSave())throw Error("save refused");pause();setMonitorMode("program");setTime(projDur()-1/30);await seekVideosTo(state.time);await prepareFrameAssets(state.time);drawFrame(state.time);})()');
  await wait(200);
  const doc=await evaluate('projectJSON()');json(name+'.json',doc);
  const shot=await cdp('Page.captureScreenshot',{format:'png'},session);fs.writeFileSync(path.join(OUT,name+'-window.png'),Buffer.from(shot.data,'base64'));
  const canvas=await evaluate('els.canvas ? els.canvas.toDataURL("image/png") : document.querySelector("#preview").toDataURL("image/png")');
  fs.writeFileSync(path.join(OUT,name+'-preview.png'),Buffer.from(canvas.split(',')[1],'base64'));
  return doc;}
async function exportVideo(name){const begin=Date.now();const r=await evaluate('(async()=>{await fetchEncodeProfiles();return await fastExport({profile:"prores422",silent:true});})()');
  if(r.error)throw Error('fastExport: '+r.error);const o=r.outputs?.[0];if(!o?.src)throw Error('export no output: '+JSON.stringify(r));
  const src=path.join(DATA,decodeURIComponent(o.src).replace(/^\//,'')),dest=path.join(OUT,name+'.mov');fs.copyFileSync(src,dest);
  const frame=path.join(OUT,name+'-export.png');encode(['-i',dest,'-ss',String(duration-1/fps),'-frames:v','1',frame]);
  const probe=JSON.parse(execFileSync(PROBE,['-v','error','-show_streams','-show_format','-of','json',dest],{encoding:'utf8'}));
  delete probe.format.filename;
  const row={name,sha256:sha(dest),seconds:(Date.now()-begin)/1000,result:r,probe};receipt.exports.push(row);json(name+'-export.json',row);}
async function stopOwned(child){if(!child)return true;if(!child.pid||child.exitCode!==null||child.signalCode)return true;
  child.kill();const until=Date.now()+10000;while(child.exitCode===null&&!child.signalCode&&Date.now()<until)await wait(50);
  return child.exitCode!==null||!!child.signalCode;}

(async()=>{try{
  const video=path.join(MEDIA,'source.mp4'),sound=path.join(MEDIA,'tone.wav');
  encode(['-f','lavfi','-i','testsrc2=size=320x180:rate=60:duration=13',...(vfr?['-vf','select=not(mod(n\\,3))+not(mod(n\\,7))','-fps_mode','vfr']:['-r','30']),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an',video]);
  const wav=Buffer.alloc(44+samples*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(192000,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*4,40);for(let i=0;i<samples;i++){const v=i>=samples-4800?Math.round(10000*Math.sin(i*2*Math.PI/48)):0;wav.writeInt16LE(v,44+i*4);wav.writeInt16LE(v,46+i*4);}fs.writeFileSync(sound,wav);
  receipt.sources=[{file:'source.mp4',sha256:sha(video),kind:vfr?'VFR':'CFR'},{file:'tone.wav',sha256:sha(sound)}];
  const pts=JSON.parse(execFileSync(PROBE,['-v','error','-select_streams','v:0','-show_frames','-show_streams','-of','json',video],{maxBuffer:8e6}));json('source-pts.json',pts);
  if(vfr)check('source has variable decoded PTS intervals',new Set(pts.frames.slice(1).map((f,i)=>Math.round((+f.pts_time- +pts.frames[i].pts_time)*1e6))).size>1);
  fs.writeFileSync(path.join(DATA,'project.json'),JSON.stringify({name:'synthetic-tail',width:320,height:180,fps,revision:1,panSchema:1,media:[{id:'v',kind:'video',name:'source.mp4',src:'/media/source.mp4',duration:13,width:320,height:180,fps:vfr?0:30,audioChannels:0},{id:'a',kind:'audio',name:'tone.wav',src:'/media/tone.wav',duration:samples/48000,audioChannels:2,sampleRate:48000}],clips:[{id:'v',kind:'video',mediaId:'v',track:'V1',start:0,in:0,duration,unlinked:true,props:{}},{id:'a',kind:'audio',mediaId:'a',track:'A1',start:0,in:0,duration:samples/48000,unlinked:true,props:{volume:1,pan:0}}]}));
  server=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,windowsHide:true,
    env:{...process.env,HOST:'127.0.0.1',PORT:'0',FABLECUT_DATA_DIR:DATA,MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token},stdio:['ignore','pipe','pipe','ipc']});
  receipt.pids.server=server.pid;server.stdout.resume();server.stderr.resume();
  origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owned server IPC timeout')),30000);
    server.once('error',()=>{clearTimeout(timer);reject(Error('owned server spawn failed'));});
    server.once('exit',()=>{clearTimeout(timer);reject(Error('owned server exited before ready'));});
    server.on('message',m=>{if(m.type==='montclip-ready'&&/^http:\/\/127\.0\.0\.1:\d+$/.test(m.origin)){clearTimeout(timer);resolve(m.origin);}});});
  receipt.serverOwnership={ipc:'montclip-ready',host:'127.0.0.1',portRequested:0};
  browser=cp.spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking',
    '--remote-debugging-pipe','--user-data-dir='+PROFILE,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
  receipt.pids.browser=browser.pid;browser.stderr.resume();cdp=command(browser);
  receipt.browserVersion=await cdp('Browser.getVersion');
  const target=await cdp('Target.createTarget',{url:'about:blank'});
  ({sessionId:session}=await cdp('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
  await cdp('Network.enable',{},session);await cdp('Network.setExtraHTTPHeaders',{headers:{'X-MontClip-Session':token}},session);
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},session);
  await cdp('Page.navigate',{url:origin},session);await ready();

  await snapshot('project');await exportVideo('result');
  const out=path.join(OUT,'result.mov');const pcm=execFileSync(FF,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-'],{maxBuffer:8e6});
  const meta=JSON.parse(execFileSync(PROBE,['-v','error','-select_streams','v:0','-show_frames','-show_streams','-of','json',out],{maxBuffer:8e6}));json('output-pts.json',meta);
  check('actual compositor export has exact project frames',meta.frames.length===frames);
  check('actual export audio ends at quantized project sample',pcm.length/4===samples);
  let cross=0,xx=0,yy=0;for(let i=0;i<samples;i++){const x=wav.readInt16LE(44+i*4),y=pcm.readInt16LE(i*4);cross+=x*y;xx+=x*x;yy+=y*y;}const correlation=cross/Math.sqrt(xx*yy),gain=Math.sqrt(yy/xx);
  check('actual final tone preserved, zero-offset correlation',correlation>.999&&gain>.95&&gain<1.05);
  receipt.result={fps,frames,duration,samples,decodedSamples:pcm.length/4,correlation,gain,pcmSha256:crypto.createHash('sha256').update(pcm).digest('hex'),lastPTS:meta.frames.at(-1).pts_time};receipt.completed=true;
}catch(e){receipt.error=String(e.message).replaceAll(ROOT,'<worktree>').replaceAll(OUT,'<output>').replaceAll(token,'<redacted>');process.exitCode=1;}
finally{if(cdp)try{await cdp('Browser.close');}catch{}
  receipt.cleanup={browserExited:await stopOwned(browser),serverExited:await stopOwned(server)};
  if(!receipt.cleanup.browserExited||!receipt.cleanup.serverExited){receipt.completed=false;receipt.error='Owned process cleanup did not finish';process.exitCode=1;}
  json('receipt.json',receipt);console.log(JSON.stringify({completed:receipt.completed,error:receipt.error,checks:receipt.checks,operations:receipt.operations.length}));}
})();
