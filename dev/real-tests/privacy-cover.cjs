'use strict';
// Synthetic privacy recipe regression. Node 22+, Chrome, configured FFmpeg.
// Runs the real browser compositor and fastExport. No runtime dependencies.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, fork, execFileSync } = require('node:child_process');
const {serverLease,resolveMediaTools,pipeClient,verifyBrowserArguments}=require('./privacy-runtime.cjs');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const out = path.resolve(process.argv[2] || 'privacy-evidence');
if(fs.existsSync(out))throw Error('Use a new evidence directory; existing results must not be reused: '+out);
fs.mkdirSync(out, { recursive: true });
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-privacy-'));
fs.mkdirSync(path.join(data, 'media'));
const W=320,H=180,FPS=12,N=12;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const mediaTools=resolveMediaTools();
function ff(args) { return execFileSync(mediaTools.ffmpeg,['-hide_banner','-loglevel','error',...args],{windowsHide:true,maxBuffer:64*1024*1024}); }
// Two opaque images differ only inside [8,10,80,25]. Test text, no real account.
function ppm(secret) {
  const pixels=Buffer.alloc(W*H*3,90);
  const letters=['111101101101111','010110010010111','111001111100111','111001111001111'];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++) {
    let v=90;
    if(x<96&&y<42)v=25;
    if(secret&&x>=8&&x<80&&y>=10&&y<25) {
      const k=Math.floor((x-8)/18),gx=Math.floor(((x-8)%18)/4),gy=Math.floor((y-10)/3);
      if(gx<3&&letters[k][gy*3+gx]==='1')v=240;
    }
    pixels.fill(v,(y*W+x)*3,(y*W+x)*3+3);
  }
  return Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`),pixels]);
}
for(const secret of [0,1]) {
  const p=path.join(out,`source-${secret}.ppm`);fs.writeFileSync(p,ppm(secret));
  ff(['-y','-loop','1','-i',p,'-t','1','-r',String(FPS),'-c:v','libx264','-crf','0','-pix_fmt','yuv444p',path.join(data,'media',`source-${secret}.mp4`)]);
  fs.copyFileSync(path.join(data,'media',`source-${secret}.mp4`),path.join(out,`source-${secret}.mp4`));
}
fs.writeFileSync(path.join(data,'project.json'),JSON.stringify({width:W,height:H,fps:FPS,media:[],clips:[]}));
const browser=require('../../server/export-jobs').findBrowser();
if(!browser)throw Error('Chrome/Edge required');
let pipe,srv,chrome;
async function pageRun({mode,scenario,secret}) {
  const W=320,H=180,FPS=12;
  const props={volume:0,fit:'contain',scale:0.6};
  if(scenario==='crop')Object.assign(props,{cropR:10,cropB:10});
  if(scenario==='edge')Object.assign(props,{x:-55,y:-30});
  const keys=scenario==='move'?{x:[{t:0,v:-20},{t:1,v:25,ease:'linear'}],scale:[{t:0,v:0.6},{t:1,v:1,ease:'linear'}]}:{};
  const base={id:'base',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:1,props,keyframes:keys};
  const clips=[base];
  if(mode==='blur')clips.push({...base,id:'blur',track:'V2',props:{...props,blur:64,masks:[{shape:'rect',mode:'add',x:0.15,y:0.12,w:0.30,h:0.24,feather:scenario==='feather'?12:0}]}});
  // Canvas-centred shape coords. Cover includes a margin around the secret rectangle.
  // Cropped source is fitted by height here; map its source box into that fitted frame.
  const crop=scenario==='crop', factor=crop?180/162:1;
  if(mode==='cover')clips.push({id:'cover',kind:'shape',track:'V3',start:0,duration:1,keyframes:keys,
    props:{x:props.x||0,y:props.y||0,scale:props.scale,opacity:1,blend:'normal',shapes:[{type:'rect',x:(48-(crop?288:320)/2)*factor,y:(21-(crop?162:180)/2)*factor,w:96*factor,h:42*factor,fill:'#000000',stroke:'none',opacity:1}]}});
  const doc={...projectJSON(),name:'Synthetic privacy',width:W,height:H,fps:FPS,media:[{id:'m',kind:'video',src:`/media/source-${secret}.mp4`,name:'synthetic',duration:1,width:W,height:H}],clips};
  applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');
  await new Promise(r=>setTimeout(r,250));
  const preview=[],alpha=[];state.selId=null;runtime.sampling=true;
  els.preview.width=W;els.preview.height=H;
  for(let n=0;n<12;n++) {
    // Paused preview uses media elements; avoid the export playback clock here.
    for(const c of project.clips.filter(c=>c.kind==='video')) {
      const el=getClipEl(c);el.pause();await seekFrame(el,n/FPS);
    }
    drawFrame(n/FPS);preview.push(els.preview.toDataURL('image/png'));
    if(mode==='blur') {
      const c=project.clips.find(c=>c.id==='blur'),p=evalProps(c,n/FPS);
      const crop=scenario==='crop',f=crop?180/162:1;
      const x=Math.round(W/2+(p.x||0)+(40-(crop?288:320)/2)*f*p.scale);
      const y=Math.round(H/2+(p.y||0)+(18-(crop?162:180)/2)*f*p.scale);
      alpha.push({frame:n,x,y,alpha:maskCtx('layer',W,H).getImageData(x,y,1,1).data[3]});
    }
  }
  runtime.sampling=false;
  await fetchEncodeProfiles();
  const exported=await fastExport({silent:true,delivery:{preset:'custom',width:W,height:H,fps:FPS,video:{codec:'h264',encoder:'libx264',crf:0},audio:{codec:'none'}}});
  if(!exported?.outputs?.[0]?.ok)throw Error('export '+JSON.stringify(exported));
  return {preview,alpha,src:exported.outputs[0].src,doc};
}
function compare(a,b) {
  if(a.length!==b.length||a.length!==W*H*3*N)throw Error('frame count mismatch '+a.length+'/'+b.length);
  const frames=[];
  for(let n=0;n<N;n++){let changed=0,max=0,sum=0;for(let i=n*W*H*3;i<(n+1)*W*H*3;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d);sum+=d;}frames.push({frame:n,changed,max,mean:sum/(W*H*3)});}
  return frames;
}
(async()=>{
  try {
    const token=crypto.randomBytes(32).toString('hex'),proof=crypto.randomBytes(32).toString('hex');
    const proofPath='/media/proof-'+crypto.randomBytes(16).toString('hex')+'.txt';
    fs.writeFileSync(path.join(data,proofPath.slice(1)),proof);
    srv=fork(path.join(root,'server','server.js'),[],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token,MONTCLIP_FFMPEG:mediaTools.ffmpeg,MONTCLIP_FFPROBE:mediaTools.ffprobe,FABLECUT_DATA_DIR:data,FABLECUT_NO_FS_WATCH:'1'},stdio:['ignore',fs.openSync(path.join(out,'server.log'),'w'),'ignore','ipc'],windowsHide:true});
    const lease=await serverLease(srv,{token,proofPath,proof});
    const profile=path.join(data,'chrome');fs.mkdirSync(profile);
    chrome=spawn(browser,['--headless=new','--enable-automation','--remote-debugging-pipe',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
    pipe=pipeClient(chrome);
    lease.onFailure(()=>pipe.close());
    fs.writeFileSync(path.join(out,'processes.json'),JSON.stringify({server:srv.pid,browser:chrome.pid,data},null,2));
    verifyBrowserArguments((await pipe.send('Browser.getBrowserCommandLine')).arguments,profile);
    const {browserContextId}=await pipe.send('Target.createBrowserContext');
    const {targetId}=await pipe.send('Target.createTarget',{url:'about:blank',browserContextId});
    const {sessionId}=await pipe.send('Target.attachToTarget',{targetId,flatten:true});
    const send=(method,params={})=>{lease.assertAlive();return pipe.send(method,params,sessionId);};
    const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
    pipe.onEvent(m=>{
      if(m.sessionId!==sessionId||m.method!=='Fetch.requestPaused')return;
      const {requestId,request}=m.params;
      const allowed=new URL(request.url).origin===lease.origin;
      try {send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'}).catch(()=>pipe.close());}catch{pipe.close();}
    });
    await send('Network.enable');await send('Network.setExtraHTTPHeaders',{headers:{'X-MontClip-Session':token}});
    await send('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'}]});
    await send('Page.navigate',{url:lease.origin});
    let ready=false;for(let i=0;i<100;i++){lease.assertAlive();try{if(await ev('state.connected && !!project')){ready=true;break;}}catch{}await sleep(100);}
    if(!ready)throw Error('owned editor did not become ready');
    const versions=Object.fromEntries(Object.entries(mediaTools).map(([name,file])=>[name,{path:file,version:execFileSync(file,['-version'],{windowsHide:true}).toString().split(/\r?\n/)[0]}]));
    const results={platform:process.platform,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,tools:versions,browser:await pipe.send('Browser.getVersion'),cases:[]};
    for(const scenario of ['static','move','crop','edge','feather'])for(const mode of ['blur','cover']) {
      const runs=[];
      for(const secret of [0,1]) {
        const name=`${scenario}-${mode}-${secret}`,dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});
        const r=await ev(`(${pageRun.toString()})(${JSON.stringify({scenario,mode,secret})})`);
        fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(r.doc,null,2));
        fs.writeFileSync(path.join(dir,'layer-alpha.json'),JSON.stringify(r.alpha,null,2));
        r.preview.forEach((p,n)=>fs.writeFileSync(path.join(dir,`frame-${String(n).padStart(2,'0')}.png`),Buffer.from(p.split(',')[1],'base64')));
        const file=path.join(data,'exports',decodeURIComponent(r.src.replace(/^\/exports\//,'')));
        fs.copyFileSync(file,path.join(dir,'export.mp4'));
        const preview=ff(['-i',path.join(dir,'frame-%02d.png'),'-f','rawvideo','-pix_fmt','rgb24','-']);
        const exported=ff(['-i',file,'-f','rawvideo','-pix_fmt','rgb24','-']);
        runs.push({preview,exported});
      }
      const result={scenario,mode,preview:compare(runs[0].preview,runs[1].preview),export:compare(runs[0].exported,runs[1].exported)};
      results.cases.push(result);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
      console.log(scenario,mode,'preview differing frames',result.preview.filter(x=>x.changed).length,'export',result.export.filter(x=>x.changed).length);
    }
    results.ok=results.cases.every(c=>c.mode==='cover'?c.preview.every(f=>!f.changed)&&c.export.every(f=>!f.changed):c.preview.some(f=>f.changed)&&c.export.some(f=>f.changed));
    results.completed=true;
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    const manifest={};function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else manifest[path.relative(out,p).replaceAll('\\','/')]=hash(fs.readFileSync(p));}}walk(out);
    fs.writeFileSync(path.join(out,'SHA256.json'),JSON.stringify(manifest,null,2));
    if(!results.ok)process.exitCode=1;
  } finally {pipe?.close();if(chrome?.exitCode===null&&!chrome.killed)chrome.kill();if(srv?.exitCode===null&&!srv.killed)srv.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
