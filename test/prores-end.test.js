'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const FF=require('../ffmpeg-path'),EP=require('../encode-profiles');
function wav(samples){const b=Buffer.alloc(44+samples*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*4,40);for(let i=0;i<samples;i++){const v=i>=samples-4801?Math.round(10000*Math.sin(i*2*Math.PI/48)):0;b.writeInt16LE(v,44+i*4);b.writeInt16LE(v,46+i*4);}return b;}
for (const spec of [
  {name:'12s real tail and extra mix sample',frames:360,fps:30,extra:1},
  {name:'fractional rate and noninteger seconds',frames:37,fps:30000/1001,extra:1},
  {name:'nonintegral sample boundary rounds to nearest sample',frames:31,fps:29.97,extra:1},
  {name:'long audio ends at project boundary',frames:37,fps:24,extra:48000},
  {name:'short audio stays short; video remains complete',frames:37,fps:30,extra:-24000},
  {name:'no audio remains silent with full video',frames:37,fps:30,noAudio:true},
  {name:'audio filter alias remains effective',frames:30,fps:30,extra:1,filter:['-filter:a','volume=0']},
  {name:'bounded audio has explicit 48kHz clock',frames:30,fps:30,extra:1,filter:['-filter:a','volume=0','-ar','44100']},
  {name:'last audio filter option remains effective',frames:30,fps:30,extra:1,filter:['-af','volume=1','-af','volume=0']}
]) test('ProRes boundary: '+spec.name,t=>{
  if(!FF.available('ffmpeg')||!FF.available('ffprobe'))return t.skip('ffmpeg/ffprobe unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-prores-end-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe'),frames=spec.frames,fps=spec.fps,n=Math.round(frames/fps*48000);
  const audio=path.join(dir,'mix.wav');fs.writeFileSync(audio,wav(n+(spec.extra||0)));
  const jpg=execFileSync(ff,['-v','error','-f','lavfi','-i','color=s=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  const out=path.join(dir,'out.mov'),profile={...EP.resolveProfile('prores422')};if(spec.filter)profile.args=[...profile.args,...spec.filter];const args=EP.buildExportArgs(profile,{fps,frames,wavPath:spec.noAudio?null:audio,outPath:out});
  const r=spawnSync(ff,args,{input:Buffer.concat(Array(frames).fill(jpg)),timeout:30000,maxBuffer:2**20,windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());
  if(!spec.noAudio){
  const pcm=execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-'],{maxBuffer:4e6});
  const expected=Math.min(n,n+spec.extra);
  assert.equal(pcm.length/4,expected,'must preserve available source samples through project end');
  assert.ok(pcm.equals(spec.filter?Buffer.alloc(expected*4):fs.readFileSync(audio).subarray(44,44+expected*4)),'real tail waveform or explicit profile mute, not accidental filter override');
  }
  if(spec.noAudio)assert.equal(JSON.parse(execFileSync(probe,['-v','error','-select_streams','a','-show_streams','-of','json',out])).streams.length,0);
  const meta=JSON.parse(execFileSync(probe,['-v','error','-select_streams','v:0','-count_frames','-show_streams','-of','json',out]));
  assert.equal(+meta.streams[0].nb_read_frames,frames);assert.ok(Math.abs(+meta.streams[0].duration-frames/fps)<1e-6);
});

for(const frames of [0,-1,1.5,Infinity,NaN,'30'])test('ProRes rejects invalid frames '+frames,()=>{assert.throws(()=>EP.buildExportArgs(EP.resolveProfile('prores422'),{fps:30,frames,outPath:'x.mov'}),/frames/);});

test('MP4/AAC with a supplied frame count retains legacy packets and delay handling',t=>{
  if(!FF.available('ffmpeg')||!FF.available('ffprobe'))return t.skip('ffmpeg/ffprobe unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-mp4-end-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe'),audio=path.join(dir,'mix.wav');fs.writeFileSync(audio,wav(48001));
  const jpg=execFileSync(ff,['-v','error','-f','lavfi','-i','color=s=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  // Portable MP4 regression: the CI LGPL build has no software H.264 encoder.
  const profile={id:'mp4-regression',args:['-c:v','mpeg4','-c:a','aac','-shortest'],extension:'.mp4'};
  const results=[];
  for(const frames of [undefined,30]){
    const out=path.join(dir,frames?'bounded-field.mp4':'legacy.mp4');
    const args=EP.buildExportArgs(profile,{fps:30,frames,wavPath:audio,outPath:out});
    const r=spawnSync(ff,args,{input:Buffer.concat(Array(30).fill(jpg)),timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());
    const meta=JSON.parse(execFileSync(probe,['-v','error','-show_packets','-show_streams','-of','json',out],{maxBuffer:2e6}));
    const a=meta.streams.find(s=>s.codec_type==='audio');assert.equal(+a.start_time,0);
    const packets=meta.packets.filter(p=>p.codec_type==='audio');assert.ok(+packets[0].pts<0,'AAC priming is signalled before timeline zero');
    assert.ok(packets[0].side_data_list.some(s=>s.skip_samples>0),'decoder must skip AAC priming, not count it as missing tail');
    results.push({audio:execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-']),packets:packets.map(p=>[p.pts,p.duration]),duration:a.duration});
  }
  assert.deepEqual(results[1],results[0],'new frame field must not change MP4 audio, timestamps or delay');
});

for(const fps of [0,-1,Infinity,NaN,1e-300])test('ProRes rejects invalid sample clock '+fps,()=>assert.throws(()=>EP.proresProjectEnd({id:'prores422'},{fps,frames:30}),/frames/));
