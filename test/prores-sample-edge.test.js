'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const FF=require('../ffmpeg-path'),EP=require('../encode-profiles');
for(const [label,fps] of [['decimal 23.976',23.976],['rational 24000/1001',24000/1001]])test('ProRes one-sample boundary: '+label,t=>{
  if(!FF.available('ffmpeg')||!FF.available('ffprobe'))return t.skip('ffmpeg/ffprobe unavailable');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-sample-edge-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe'),frames=2248,n=Math.round(frames/fps*48000),audio=path.join(dir,'tone.wav'),out=path.join(dir,'edge.mov');
  const synth=['-v','error','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-t','95','-c:a','pcm_s16le',audio];execFileSync(ff,synth);
  const jpg=execFileSync(ff,['-v','error','-f','lavfi','-i','color=s=16x16','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-']);
  const args=EP.buildExportArgs(EP.resolveProfile('prores422'),{fps,frames,wavPath:audio,outPath:out});
  // One surplus uploaded JPEG must not extend the selected video range.
  const r=spawnSync(ff,args,{input:Buffer.concat(Array(frames+1).fill(jpg)),timeout:30000,windowsHide:true});assert.equal(r.status,0,r.stderr?.toString());
  const meta=JSON.parse(execFileSync(probe,['-v','error','-count_frames','-show_streams','-of','json',out]));
  const video=meta.streams.find(s=>s.codec_type==='video'),pcm=execFileSync(ff,['-v','error','-i',out,'-map','0:a:0','-f','s16le','-'],{maxBuffer:20e6}),samples=pcm.length/2;
  const source=execFileSync(ff,['-v','error','-i',audio,'-f','s16le','-'],{maxBuffer:20e6});
  t.diagnostic(JSON.stringify({label,fps,frames,inputFrames:frames+1,seconds:frames/fps,targetSamples:n,decodedSamples:samples,video,commands:{synth,export:args},ffmpegVersion:execFileSync(ff,['-version'],{encoding:'utf8'}).split('\n')[0],ffmpegSha256:crypto.createHash('sha256').update(fs.readFileSync(ff)).digest('hex')}));
  assert.equal(+video.nb_read_frames,frames,'surplus upload must not add a video frame');
  assert.ok(Math.abs(+video.duration-frames/fps)<1e-6,'full last video interval');
  assert.ok(samples===n||samples===n-1,'these edge fixtures permit only the documented single-sample duration quantization');
  if(label.startsWith('rational'))assert.equal(samples,n,'integer sample boundary remains exact');
  assert.ok(pcm.equals(source.subarray(0,pcm.length)),'all retained PCM equals source; no padding or missing tail packet');
  assert.ok(pcm.subarray(-9600).some(x=>x!==0),'last100ms retains real tone');
});
