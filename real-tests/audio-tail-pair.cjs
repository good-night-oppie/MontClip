/* Replay captured synthetic encoder inputs. Never alters product profiles. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const dir=path.resolve(process.argv[2]||'');
const suffix=process.argv.includes('--debug-ts')?'-trace':'';
const read=f=>fs.readFileSync(path.join(dir,f));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const command=JSON.parse(read('actual-command.local.json'));
const receipt=JSON.parse(read('receipt.json'));
if(!receipt.completed||!receipt.diagnostic||!receipt.cleanup.browserExited||!receipt.cleanup.serverExited)throw Error('Completed owned diagnostic capture required');
const ff=command.binary,probe=require('../ffmpeg-path').path('ffprobe');
const video=read('captured-frames.mjpeg'),wav=path.join(dir,'captured-mix.wav');
const write=(f,x)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(x,null,2)+'\n');
const probeFile=(f,extra=[])=>JSON.parse(execFileSync(probe,['-v','error',...extra,'-show_streams','-show_frames','-show_packets','-of','json',f],{maxBuffer:32*1024*1024}));
const probeVideo=(f,extra=[])=>JSON.parse(execFileSync(probe,['-v','error',...extra,'-select_streams','v:0','-show_streams','-show_frames','-of','json',f],{maxBuffer:32*1024*1024}));
function pcm(f){return execFileSync(ff,['-v','error','-i',f,'-map','0:a:0','-ar','48000','-ac','2','-f','s16le','-'],{maxBuffer:8*1024*1024});}
function summary(b){let last=-1,first=-1;for(let i=0;i<b.length;i+=4)if(Math.abs(b.readInt16LE(i))>100){if(first<0)first=i/4;last=i/4;}
  return{samplesPerChannel:b.length/4,seconds:b.length/4/48000,firstToneSample:first,lastToneSample:last,sha256:sha(b)};}
const normalize=a=>a.map(x=>x===ff?'<FFMPEG>':x===wav||x.endsWith('audio.wav')?'<MIX_WAV>':x.startsWith(dir)?'<OUTPUT>/'+path.basename(x):x);
const original=pcm(path.join(dir,'data/media/original.wav')),mix=pcm(wav);
const input=probeVideo(path.join(dir,'captured-frames.mjpeg'),['-f','image2pipe','-framerate','30','-c:v','mjpeg']);
write('input-frames.json',input);
const results={tools:{ffmpegSha256:sha(fs.readFileSync(ff)),ffprobeSha256:sha(fs.readFileSync(probe)),ffmpegVersion:execFileSync(ff,['-version'],{encoding:'utf8'}),node:process.version},
  actualCommand:normalize([ff,...command.args]),capture:JSON.parse(read('capture-transport.json')),runnerSha256:receipt.runnerSha256,
  inputs:{jpegSha256:sha(video),wavFileSha256:sha(fs.readFileSync(wav)),source:summary(original),mix:summary(mix),frameCount:input.frames.length,firstPTS:input.frames[0].pts_time,lastPTS:input.frames.at(-1).pts_time,lastFrameDuration:input.frames.at(-1).duration_time,timeBase:input.streams[0].time_base},outputs:{}};
results.outputs.actual={audio:summary(pcm(path.join(dir,'00-original.mov')))};
for(const shortest of [true,false]){
  const name=(shortest?'with-shortest':'without-shortest')+suffix,dest=path.join(dir,name+'.mov');
  if(fs.existsSync(dest))throw Error('Replay destination already exists: '+name);
  const args=command.args.map(x=>x.endsWith('audio.wav')?wav:x);args[args.length-1]=dest;
  if(!shortest)args.splice(args.indexOf('-shortest'),1);
  if(suffix)args.unshift('-debug_ts','-loglevel','verbose');
  const run=spawnSync(ff,args,{input:video,windowsHide:true,maxBuffer:32*1024*1024});
  if(run.error||run.status!==0)throw Error(run.error?.message||run.stderr.toString());
  fs.writeFileSync(path.join(dir,name+'-stderr.txt'),run.stderr.toString().split(dir).join('<OUTPUT>'));
  const decoded=pcm(dest),meta=probeFile(dest);write(name+'-probe.json',meta);
  const frames=probeVideo(dest);write(name+'-frames.json',frames);
  results.outputs[name]={command:normalize([ff,...args]),fileSha256:sha(fs.readFileSync(dest)),audio:summary(decoded),
    pcmMatchesMixPrefix:decoded.equals(mix.subarray(0,decoded.length)),frameCount:frames.frames.length,lastPTS:frames.frames.at(-1).pts_time,
    streamEnds:meta.streams.map(s=>({type:s.codec_type,timeBase:s.time_base,duration:s.duration,durationTs:s.duration_ts}))};
}
write('audio-tail-pair'+suffix+'-report.json',results);console.log(JSON.stringify(results.outputs));
