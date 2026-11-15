// The media-info track picker in a real (headless) Chrome against the local server: node ui-smoke.cjs (MONTCLIP_FFMPEG_DIR; CHROME)
const R=require('path').join(__dirname,'..','..','..','test')+'/';
const H=require(R+'helpers'),fs=require('fs'),path=require('path'),os=require('os'),{spawn,spawnSync}=require('child_process');
const after=[];const t={after:(f)=>after.push(f)};const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-ui-'));
 const proj=H.seedProject({width:320,height:180,fps:30,media:[{id:'m_r',name:'分轨.mkv',kind:'video',src:'/media/r.mkv',duration:20,width:320,height:180,audioChannels:2,size:1}],
   clips:[{id:'c_v',mediaId:'m_r',kind:'video',track:'V1',start:0,in:0,duration:20,props:{}},
    // a caption the streamer edited (its text is no longer the text it was made with)
    {id:'c_cap',mediaId:null,kind:'text',track:'V2',start:5,in:0,duration:2,name:'Caption',props:{text:'改过的字幕',captionMade:'原来的字幕',caption:true,captionStyle:'subtitle',wordTimes:[[0,1]]}}]});
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(proj));fs.mkdirSync(path.join(dir,'media'));
 const mic="sine=frequency=440:sample_rate=48000:duration=20,volume=enable='lt(t,5)+gte(t,15)':volume=0";
 spawnSync(require('../../../server/ffmpeg-path').path('ffmpeg'),['-v','error','-y','-f','lavfi','-i','color=c=gray:s=320x180:r=30:d=20','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=20','-f','lavfi','-i',mic,
  '-map','0:v','-map','1:a','-map','2:a','-c:v','mpeg4','-c:a','aac','-ac','2','-metadata:s:a:0','title=Game','-metadata:s:a:1','title=Mic',path.join(dir,'media','r.mkv')]);
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
 console.log('notice bar', await ev("(document.querySelector('.bin-tracks-bar')||{}).textContent"));
 console.log('badge', await ev("(document.querySelector('.bin-tracks-badge')||{}).textContent"));
 // the badge opens the picker on its own
 await ev("document.querySelector('.bin-tracks-badge').click()");await sleep(300);
 console.log('picker title', await ev("document.querySelector('.bin-track-pop .bin-pop-title').textContent"));
 console.log('rows', JSON.stringify(await ev("[...document.querySelectorAll('.bin-track')].map(r=>r.textContent+(r.querySelector('input').checked?' [x]':''))")));
 console.log('play button class', await ev("document.querySelector('.bin-track-play').className"));
 // listen: ■ 停 and lit; again stops; Esc stops
 await ev("document.querySelectorAll('.bin-track-play')[1].click()");await sleep(1500);
 console.log('listening', await ev("JSON.stringify({btn:document.querySelectorAll('.bin-track-play')[1].textContent,lit:document.querySelectorAll('.bin-track')[1].classList.contains('playing'),paused:trackListen&&trackListen.audio.paused})"));
 await ev("document.querySelectorAll('.bin-track-play')[1].click()");await sleep(300);
 console.log('clicked again', await ev("JSON.stringify({btn:document.querySelectorAll('.bin-track-play')[1].textContent,lit:document.querySelectorAll('.bin-track')[1].classList.contains('playing'),playing:!!trackListen})"));
 await ev("document.querySelectorAll('.bin-track-play')[0].click()");await sleep(1500);
 const a0=await ev("trackListen&&trackListen.audio");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(300);
 console.log('after Esc', await ev("JSON.stringify({picker:!!document.querySelector('.bin-track-pop'),playing:!!trackListen})"));
 // pick track 2 from the badge's picker
 await ev("document.querySelector('.bin-tracks-badge').click()");await sleep(300);
 await ev("(()=>{const r=document.querySelectorAll('.bin-track input')[1];r.checked=true;r.dispatchEvent(new Event('change'));})()");await sleep(400);
 console.log('badge right after', await ev("document.querySelector('.bin-tracks-badge').textContent"));
 await sleep(1500);
 console.log('after pick: entry', await ev("project.media[0].audioTrack"), 'saved', JSON.parse(fs.readFileSync(path.join(dir,'project.json'),'utf8')).media[0].audioTrack);
 const L=await (await fetch(base+'/api/signals/loudness?src=/media/r.mkv')).json();console.log('server loudness track',L.track,'at 2s',L.values[4],'at 10s',L.values[20]);
 let g;for(let i=0;i<40;i++){g=await (await fetch(base+'/api/songs?src=/media/r.mkv&track=1')).json();if(g.state==='done')break;await sleep(250);}
 console.log('songs re-read in the background, track',g.track,'state',g.state);
 await sleep(800);
 console.log('badge after', await ev("document.querySelector('.bin-tracks-badge').textContent"));
 console.log('toast with button', await ev("els.toast.textContent+' / button: '+(els.toast.querySelector('button')||{}).textContent"));
 await ev("setSideTab('transcript')");await sleep(500);
 console.log('by 听写所选', await ev("(()=>{const b=document.querySelector('[data-tr-capredo]');return b&&!b.hidden?b.textContent:'(hidden)'})()"));
 console.log('exported sound unchanged: channels', await ev("project.media[0].channels"), 'waveform key', await ev("(runtime.wavePeaks.get('m_r')||{}).src"));
 await ev("undo()");await sleep(1500);
 console.log('after undo: entry', await ev("project.media[0].audioTrack"), 'saved', JSON.parse(fs.readFileSync(path.join(dir,'project.json'),'utf8')).media[0].audioTrack);
 console.log('undo toast', await ev("els.toast.textContent"));
 console.log('badge after undo', await ev("document.querySelector('.bin-tracks-badge').textContent"));
 console.log('errors', JSON.stringify(errs));
 ws.close();for(const f of after.reverse()) await f();fs.rmSync(dir,{recursive:true,force:true});
})().catch(async(e)=>{console.error(e);for(const f of after.reverse()) await f();process.exit(1);});
