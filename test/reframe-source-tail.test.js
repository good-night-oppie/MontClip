'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const FF=require('../ffmpeg-path');
function sample(file,c){
 const src=fs.readFileSync(require.resolve('../mcp-server'),'utf8');
 const ctx={require:require('node:module').createRequire(require.resolve('../mcp-server')),FF,REFRAME_MAX_SECS:900};
 vm.runInNewContext(src.slice(src.indexOf('function sampleFrames('),src.indexOf('async function reframeTool(')),ctx);
 return ctx.sampleFrames(file,c,16,16,30);
}
function fixture(t,duration,vfr=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-source-tail-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'synthetic.mkv');
 const vf="drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable='gte(t,6)'"+(vfr?",select='lt(t,5.7)+gte(t,6)'":'');
 const r=spawnSync(FF.path('ffmpeg'),['-v','error','-f','lavfi','-i',`color=blue:s=64x64:r=24:d=${duration}`,'-vf',vf,'-fps_mode','vfr','-c:v','ffv1',file]);
 a.equal(r.status,0,String(r.stderr));return file;
}
const options={skip:!FF.available('ffmpeg')};
test('24 fps source in a 30 fps project retains its displayed tail frame',options,t=>{
 const s=sample(fixture(t,6),{id:'c',kind:'video',in:0,duration:6,props:{}});
 a.ok(s.times.at(-1)>5.9,'the extra tail read must not silently disappear');
 a.ok(Math.abs(s.times.at(-1)-5.958)<.002,'timestamp belongs to the decoded source frame');
});
test('tail read never uses the red next shot outside the six-second clip',options,t=>{
 const s=sample(fixture(t,7),{id:'c',kind:'video',in:0,duration:6,props:{}}),f=s.frames.at(-1);
 a.ok(f[2]>200&&f[0]<20,'last sampled picture must be blue, not next-shot red');
 a.ok(s.times.at(-1)<6);
});
test('VFR tail uses a source timestamp instead of an inferred frame number',options,t=>{
 const s=sample(fixture(t,7,true),{id:'c',kind:'video',in:0,duration:6,props:{}}),f=s.frames.at(-1);
 a.ok(f[2]>200&&f[0]<20,'must not use the following shot across a VFR gap');
 a.ok(Math.abs(s.times.at(-1)-5.667)<.002,'last displayed source PTS is 5.667 seconds');
});
test('nonzero clip in and slow playback still use the last displayed source frame',options,t=>{
 const s=sample(fixture(t,7),{id:'c',kind:'video',in:2,duration:8,props:{speed:.5}}),f=s.frames.at(-1);
 a.ok(f[2]>200&&f[0]<20);a.ok(Math.abs(s.times.at(-1)-3.958)<.002);
});
test('empty tail output is an explicit failure',options,t=>{
 a.throws(()=>sample(fixture(t,6),{id:'c',kind:'video',in:8,duration:1,props:{}}),/displayed tail frame/);
});
test('a short window with no source PTS is refused instead of sampling the next shot',options,t=>{
 a.throws(()=>sample(fixture(t,7),{id:'c',kind:'video',in:5.97,duration:.02,props:{}}),/displayed tail frame/);
});
test('nonzero container timestamps are normalized to source playback time',options,t=>{
 const input=fixture(t,7),file=path.join(path.dirname(input),'offset.mkv');
 const r=spawnSync(FF.path('ffmpeg'),['-v','error','-i',input,'-c','copy','-output_ts_offset','3600',file]);a.equal(r.status,0,String(r.stderr));
 const s=sample(file,{id:'c',kind:'video',in:0,duration:6,props:{}}),f=s.frames.at(-1);
 a.ok(f[2]>200&&f[0]<20);a.ok(Math.abs(s.times.at(-1)-5.958)<.002);
});
