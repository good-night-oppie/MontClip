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
  {name:'QQ output index mute remains silent',frames:30,fps:30,extra:1,filter:['-filter:1','volume=0']},
  {name:'type then index uses last mute',frames:30,fps:30,extra:1,filter:['-af','volume=1','-filter:1','volume=0']},
  {name:'index then type uses last real tail',frames:30,fps:30,extra:1,audible:true,filter:['-filter:1','volume=0','-filter:a:0','volume=1']},
  {name:'reordered mapped audio index zero',frames:30,fps:30,extra:1,filter:['-map','1:a:0','-map','0:v:0','-filter:0','volume=0','-filter:1','hflip']},
  {name:'flag-like option value does not disable real tail',frames:30,fps:30,extra:1,audible:true,filter:['-progress','-an']},
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
  const r=spawnSync(ff,args,{input:Buffer.concat(Array(frames).fill(jpg)),timeout:30000,maxBuffer:2**20,windowsHide:true,cwd:dir});assert.equal(r.status,0,r.stderr?.toString());
  if(!spec.noAudio){
  const pcm=execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-'],{maxBuffer:4e6});
  const expected=Math.min(n,n+spec.extra);
  assert.equal(pcm.length/4,expected,'must preserve available source samples through project end');
  assert.ok(pcm.equals(spec.filter&&!spec.audible?Buffer.alloc(expected*4):fs.readFileSync(audio).subarray(44,44+expected*4)),'real tail waveform or explicit profile mute, not accidental filter override');
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

test('output-index video filters stay unchanged with reordered or absent audio',t=>{
  if(!FF.available('ffmpeg'))return t.skip('ffmpeg unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-filter-map-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ff=FF.path('ffmpeg'),audio=path.join(dir,'mix.wav');fs.writeFileSync(audio,wav(48001));
  const jpg=execFileSync(ff,['-v','error','-f','lavfi','-i','testsrc2=s=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  const pictures=[];
  for(const [name,custom,wavPath] of [
    ['video-only',['-filter:0','hflip','-filter:a','volume=0'],null],
    ['audio-first',['-map','1:a:0','-map','0:v:0','-filter:0','volume=0','-filter:1','hflip'],audio],
    ['disabled-audio',['-an','-filter:0','hflip','-af','volume=0'],audio],
    ['unflipped',[],null]]){
    const out=path.join(dir,name+'.mov'),base=EP.resolveProfile('prores422');
    const args=EP.buildExportArgs({...base,args:[...base.args,...custom]},{fps:30,frames:30,wavPath,outPath:out});
    const r=spawnSync(ff,args,{input:Buffer.concat(Array(30).fill(jpg)),timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());
    pictures.push(execFileSync(ff,['-v','error','-i',out,'-map','0:v:0','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']));
    if(name!=='audio-first')assert.ok(!args.some(a=>a.includes('atrim=')),'no audio output must not gain an audio trim');
    else {const pcm=execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-']);assert.equal(pcm.length,48000*4);assert.ok(pcm.equals(Buffer.alloc(pcm.length)));}
  }
  assert.ok(pictures[0].equals(pictures[1])&&pictures[1].equals(pictures[2]),'video hflip survives audio remapping/disable');
  assert.ok(!pictures[0].equals(pictures[3]),'asymmetric picture really was flipped');
});

test('option values are not mistaken for mapping/filter/disable options',()=>{
  const plan=EP.proresFilterPlan(['-progress','-an','-metadata','-filter:1','-filter:1','volume=0'],true);
  assert.equal(plan.hasAudio,true);assert.equal(plan.audioFilter,4);
  assert.throws(()=>EP.proresFilterPlan(['-unrecognized','-an'],true),e=>e.code==='PROFILE_FILTER_MAPPING_UNSUPPORTED');
  assert.throws(()=>EP.proresFilterPlan(['extra-output.mov'],true),e=>e.code==='PROFILE_FILTER_MAPPING_UNSUPPORTED');
});

for(const args of [['-map','[mix]'],['-map','0'],['-map','1:a','-map','1:a','-map','0:v'],['-filter:a:m:title:x','volume=0'],['-filter:99','volume=0'],['-filter_complex','[1:a]anull[a]'],['-filter','null'],['-map','0:v','-map','-1:a'],['-filter_script:a','custom.txt'],['-/filter:a','custom.txt'],['-an','-noan']])test('unresolved mapping/selector refuses '+JSON.stringify(args),()=>{const p={...EP.resolveProfile('prores422'),args:[...EP.resolveProfile('prores422').args,...args]};assert.throws(()=>EP.buildExportArgs(p,{fps:30,frames:30,wavPath:'mix.wav',outPath:'x.mov'}),e=>e.code==='PROFILE_FILTER_MAPPING_UNSUPPORTED');});

for (const disable of [true,false]) test('shortest progress filename preserves '+(disable?'disabled audio':'real tail'),t=>{
  if(!FF.available('ffmpeg')||!FF.available('ffprobe'))return t.skip('ffmpeg/ffprobe unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-shortest-value-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe'),audio=path.join(dir,'mix.wav');fs.writeFileSync(audio,wav(48000));
  const jpg=execFileSync(ff,['-v','error','-f','lavfi','-i','color=s=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  const base=EP.resolveProfile('prores422'),profile={...base,args:[...base.args,'-progress','-shortest',...(disable?['-an']:[])]};
  assert.equal(EP.proresFilterPlan(profile.args,true).hasAudio,!disable,'preflight audio decision');
  for(const frames of [undefined,30]){
    const out=path.join(dir,frames?'bounded.mov':'legacy.mov');
    const args=EP.buildExportArgs(profile,{fps:30,frames,wavPath:audio,outPath:out});
    const r=spawnSync(ff,args,{cwd:dir,input:Buffer.concat(Array(30).fill(jpg)),timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());
    const streams=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-of','json',out])).streams;
    assert.equal(streams.filter(s=>s.codec_type==='audio').length,disable?0:1,'real audio streams agree with preflight');
    if(!disable){const pcm=execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-']);assert.ok(pcm.some(x=>x!==0),'real tone remains audible');if(frames)assert.ok(pcm.equals(fs.readFileSync(audio).subarray(44)),'bounded output preserves complete tail PCM');}
    assert.ok(fs.readFileSync(path.join(dir,'-shortest'),'utf8').includes('progress=end'),'progress filename preserved verbatim');
  }
});
