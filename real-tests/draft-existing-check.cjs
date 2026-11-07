/* Decode actual exports; no screenshots or project fields substitute for output. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const dir=path.resolve(process.argv[2]);
const ff=require('../ffmpeg-path').path('ffmpeg'),probe=require('../ffmpeg-path').path('ffprobe');
const receipt=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json')));
if(!receipt.completed)throw Error('Incomplete runner receipt');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const checks=[];const check=(name,ok,detail)=>{checks.push({name,ok,detail});};
const names=['00-original','01-card','02-replaced','09-version-restored'];
const video={},audio={},audioBytes={};
for(const name of names){const file=path.join(dir,name+'.mov');
  const data=execFileSync(ff,['-v','error','-i',file,'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(dir,name+'-decoded.framemd5'),data);
  video[name]=data.split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').map(x=>x.trim()));
  audioBytes[name]=execFileSync(ff,['-v','error','-i',file,'-map','0:a:0','-ar','48000','-ac','2','-f','s16le','-acodec','pcm_s16le','-'],{maxBuffer:8*1024*1024});
  audio[name]=hash(audioBytes[name]);
  const frames=JSON.parse(execFileSync(probe,['-v','error','-select_streams','v:0','-show_frames','-show_entries',
    'frame=pts,pts_time:stream=time_base','-show_streams','-of','json',file],{encoding:'utf8',maxBuffer:4*1024*1024}));
  fs.writeFileSync(path.join(dir,name+'-pts.json'),JSON.stringify({source:'machine: ffprobe decoded actual export',...frames},null,2));
  check(name+' PTS establishes 30fps [0,12)',frames.frames.length===360&&frames.frames.every((f,i)=>Math.abs(Number(f.pts_time)-i/30)<.000001),{timeBase:frames.streams[0].time_base,first:frames.frames[0].pts_time,last:frames.frames.at(-1).pts_time});
}
const baseline=video[names[0]],same=(a,b)=>a.at(-1)===b.at(-1);
for(const name of names)check(name+' has 360 decoded frames',video[name].length===360,video[name].length);
check('restored output equals baseline at all 360 frames',video[names[3]].every((f,i)=>same(f,baseline[i])));
for(const name of ['01-card','02-replaced']){
  const changed=video[name].map((f,i)=>same(f,baseline[i])?-1:i).filter(i=>i>=0);
  check(name+' changes precisely [8,10) / frames 240..299',changed.length===60&&changed.every((n,i)=>n===240+i),changed);
}
check('all four exports preserve baseline-identical decoded audio',new Set(Object.values(audio)).size===1,audio);
const source=execFileSync(ff,['-v','error','-i',path.join(dir,'data/media/original.wav'),'-ar','48000','-ac','2','-f','s16le','-'],{maxBuffer:8*1024*1024});
const output=audioBytes['00-original'];let cross=0,sourcePower=0,outPower=0;
for(let i=0;i<Math.min(source.length,output.length);i+=2){const x=source.readInt16LE(i),y=output.readInt16LE(i);cross+=x*y;sourcePower+=x*x;outPower+=y*y;}
const correlation=cross/Math.sqrt(sourcePower*outPower),gain=Math.sqrt(outPower/sourcePower);
check('baseline audio matches non-silent source waveform at zero offset for 12s',source.length===output.length&&source.length===12*48000*2*2&&correlation>.999&&gain>.1&&gain<2,{correlation,gain,sourceSamplesPerChannel:source.length/4,exportSamplesPerChannel:output.length/4,missingMilliseconds:(source.length-output.length)/4/48,sourceSha256:hash(source),exportSha256:audio['00-original']});
const report={ok:checks.every(c=>c.ok),checks,limits:['Pixel equality here is only for this synthetic fixture',
  'Not a human experience score; no speed baseline or source-VFR acceptance claim']};
fs.writeFileSync(path.join(dir,'decoded-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;
