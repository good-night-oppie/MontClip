// End-to-end: a real headless export (preset archive) of a 3-track recording; which track is in the exported file?
// node e2e-export.cjs <audioTrack>   (MONTCLIP_FFMPEG_DIR, FABLECUT_CHROME as for the app)
// The test video needs an H.264 the browser plays: run with an ffmpeg that has libx264 (the bundled LGPL one has not).
const R=require('path').join(__dirname,'..','..','..','test')+'/';
const H=require(R+'helpers'),fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const after=[];const t={after:(f)=>after.push(f)};
(async()=>{
 const track=+process.argv[2]||0, LEN=20;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-e2e-'));
 const proj=H.seedProject({width:320,height:180,fps:30,media:[{id:'m_r',name:'r.mkv',kind:'video',src:'/media/r.mkv',duration:LEN,width:320,height:180,audioChannels:2,
   audioTracks:[{channels:2,title:'Game'},{channels:2,title:'Mic'},{channels:2,title:'BGM'}],...(track?{audioTrack:track}:{})}],
   clips:[{id:'c_v',mediaId:'m_r',kind:'video',track:'V1',start:0,in:0,duration:LEN,props:{}}]});
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(proj));fs.mkdirSync(path.join(dir,'media'));
 const mic="sine=frequency=440:sample_rate=48000:duration=20,volume=enable='lt(t,5)+gte(t,15)':volume=0";
 const r=spawnSync(require('../../../ffmpeg-path').path('ffmpeg'),['-v','error','-y','-f','lavfi','-i','color=c=gray:s=320x180:r=30:d=20','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=20','-f','lavfi','-i',mic,'-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=20,volume=0.1',
  '-map','0:v','-map','1:a','-map','2:a','-map','3:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ac','2',path.join(dir,'media','r.mkv')]);
 if(r.status) throw new Error(String(r.stderr));
 const {base}=await H.startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1'});
 const req=await (await fetch(base+'/api/export/request',{method:'POST',body:JSON.stringify({where:'headless',preset:'archive'})})).json();
 console.log('request',JSON.stringify(req).slice(0,200));
 let j;for(let i=0;i<600;i++){j=await (await fetch(base+'/api/export/job?id='+req.id)).json();if(['done','failed','cancelled'].includes(j.status))break;await new Promise(z=>setTimeout(z,500));}
 console.log('job',j.status,j.src||j.error);
 if(j.status==='done'){
  const out=path.join(dir,decodeURIComponent(j.src.replace(/^\//,'')));
  for(const at of [2,10,18]){const p=spawnSync(require('../../../ffmpeg-path').path('ffmpeg'),['-v','error','-ss',String(at),'-t','0.5','-i',out,'-vn','-ac','1','-ar','48000','-f','f32le','-']);
   const b=p.stdout,n=b.length/4;let s=0,z=0,prev=0;for(let i=0;i<n;i++){const v=b.readFloatLE(i*4);s+=v*v;if(i&&(prev<0)!==(v<0))z++;prev=v;}
   console.log(`exported audio at ${at}s: ${(10*Math.log10(s/n+1e-12)).toFixed(1)} dB, ${z} crossings/0.5s (220 Hz=游戏 220, 440=麦克风 440)`);}
 }
 for(const f of after.reverse()) await f();
 fs.rmSync(dir,{recursive:true,force:true});
})().catch(async(e)=>{console.error(e);for(const f of after.reverse()) await f();process.exit(1);});
