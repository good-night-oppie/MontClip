// The media-info track picker in a real (headless) Chrome against the local server: node ui-smoke.cjs (MONTCLIP_FFMPEG_DIR; CHROME)
const R=require('path').join(__dirname,'..','..','..','test')+'/';
const H=require(R+'helpers'),fs=require('fs'),path=require('path'),os=require('os'),{spawn,spawnSync}=require('child_process');
const after=[];const t={after:(f)=>after.push(f)};const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-ui-'));
 const proj=H.seedProject({width:320,height:180,fps:30,media:[{id:'m_r',name:'分轨.mkv',kind:'video',src:'/media/r.mkv',duration:20,width:320,height:180,audioChannels:2,size:1}],
   clips:[{id:'c_v',mediaId:'m_r',kind:'video',track:'V1',start:0,in:0,duration:20,props:{}}]});
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(proj));fs.mkdirSync(path.join(dir,'media'));
 const mic="sine=frequency=440:sample_rate=48000:duration=20,volume=enable='lt(t,5)+gte(t,15)':volume=0";
 spawnSync(require('../../../ffmpeg-path').path('ffmpeg'),['-v','error','-y','-f','lavfi','-i','color=c=gray:s=320x180:r=30:d=20','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=20','-f','lavfi','-i',mic,
  '-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-metadata:s:a:0','title=Game','-metadata:s:a:1','title=Mic',path.join(dir,'media','r.mkv')]);
 const {base}=await H.startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const prof=fs.mkdtempSync(path.join(os.tmpdir(),'mc-chr-'));
 const chrome=spawn(process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9333','--user-data-dir='+prof,'--autoplay-policy=no-user-gesture-required',base+'/?lang=zh-CN'],{stdio:'ignore'});
 after.push(()=>chrome.kill());
 let ws;for(let i=0;i<50;i++){try{const l=await (await fetch('http://127.0.0.1:9333/json')).json();const p=l.find(x=>x.type==='page');if(p){ws=new WebSocket(p.webSocketDebuggerUrl);break;}}catch{}await sleep(200);}
 await new Promise(r=>ws.onopen=r);let id=0;const pend=new Map();const errs=[];
 ws.onmessage=(m)=>{const j=JSON.parse(m.data);if(j.id&&pend.has(j.id)){pend.get(j.id)(j);pend.delete(j.id);}
  if(j.method==='Runtime.exceptionThrown')errs.push(j.params.exceptionDetails.exception?.description||j.params.exceptionDetails.text);
  if(j.method==='Runtime.consoleAPICalled'&&j.params.type==='error')errs.push(j.params.args.map(a=>a.value||a.description).join(' '));};
 const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
 const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result.exceptionDetails?('EXC '+r.result.exceptionDetails.exception?.description):r.result.result.value;};
 await send('Runtime.enable');
 for(let i=0;i<100;i++){if(await ev("typeof project!=='undefined'&&project.media&&project.media.length===1&&state.connected"))break;await sleep(200);}
 // the server reads the tracks (refreshMediaInfo); wait for them
 await ev("refreshMediaInfo(project.media)");
 for(let i=0;i<50;i++){if(await ev("Array.isArray(project.media[0].audioTracks)"))break;await sleep(200);}
 console.log('audioTracks', JSON.stringify(await ev("project.media[0].audioTracks")));
 console.log('toast', await ev("[...document.querySelectorAll('.toast, #toast')].map(e=>e.textContent).join(' | ')"));
 console.log('menu label', await ev("uiText('own.media-info')"));
 await ev("showMediaInfo(getMedia('m_r'),100,100)");await sleep(300);
 console.log('rows', JSON.stringify(await ev("[...document.querySelectorAll('.bin-track')].map(r=>r.textContent+(r.querySelector('input').checked?' [x]':''))")));
 console.log('title', await ev("document.querySelector('.bin-tracks .bin-pop-label').textContent+' / '+document.querySelector('.bin-tracks .bin-pop-hint').textContent"));
 // listen to track 1
 await ev("document.querySelectorAll('.bin-track-play')[1].click()");await sleep(1500);
 console.log('listening', await ev("trackListen?{src:!!trackListen.src,paused:trackListen.paused,dur:trackListen.duration}:null"));
 // pick track 1
 await ev("(()=>{const r=document.querySelectorAll('.bin-track input')[1];r.checked=true;r.dispatchEvent(new Event('change'));})()");await sleep(1500);
 console.log('after pick: entry', await ev("project.media[0].audioTrack"), 'saved', JSON.parse(fs.readFileSync(path.join(dir,'project.json'),'utf8')).media[0].audioTrack);
 console.log('toast', await ev("[...document.querySelectorAll('.toast, #toast')].map(e=>e.textContent).join(' | ')"));
 const L=await (await fetch(base+'/api/signals/loudness?src=/media/r.mkv')).json();console.log('server loudness track',L.track,'at 2s',L.values[4],'at 10s',L.values[20]);
 await ev("undo()");await sleep(1500);
 console.log('after undo: entry', await ev("project.media[0].audioTrack"), 'saved', JSON.parse(fs.readFileSync(path.join(dir,'project.json'),'utf8')).media[0].audioTrack);
 console.log('errors', JSON.stringify(errs));
 ws.close();for(const f of after.reverse()) await f();fs.rmSync(dir,{recursive:true,force:true});
})().catch(async(e)=>{console.error(e);for(const f of after.reverse()) await f();process.exit(1);});
