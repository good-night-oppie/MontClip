'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {accumulator}=require('../flv-readable-range');
const createMediaProcess=({processes})=>processes;
const root=path.join(__dirname,'..');
function world({gap=true,compatible=false,scanFailure=false,uncertain=false}={}){
 const calls={encode:0,scan:0,writes:0,copies:0,register:0},files=new Map();
 const streams=[{codec_type:'video',codec_name:compatible?'h264':'flv1',pix_fmt:'yuv420p',avg_frame_rate:'30/1',time_base:'1/1000'}];
 const fakeFs={existsSync:f=>files.has(f),statSync:()=>({size:12,isFile:()=>true}),mkdirSync(){},writeFileSync(f,b){calls.writes++;files.set(f,b);},copyFileSync(a,b){calls.copies++;files.set(b,files.get(a));},renameSync(){},rmSync(){throw Error('must not delete original');}};
 const processes={execFile(cmd,args,opts,cb){assert.ok(['ffmpeg','ffprobe'].includes(cmd));assert.ok(Array.isArray(args));assert.notEqual(opts.shell,true);if(cmd==='ffmpeg')calls.encode++;cb(null,JSON.stringify({streams,format:{duration:0.1}}));return{once(){}};}};
 const mediaProcess=createMediaProcess({processes,io:fakeFs});
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'prepare-media.js'),'utf8'),{module:mod,exports:mod.exports,require:id=>id==='./ffmpeg-path'?{path:n=>n,available:()=>true}:id==='fs'?fakeFs:(id==='node:child_process'||id==='child_process')?mediaProcess:id==='./flv-readable-range'?{async scanReadableRange(){calls.scan++;if(scanFailure)throw Object.assign(Error('private path'),{code:'FLV_PROBE_FAILED'});const a=accumulator(streams,0.1);for(const pts of [0,1/30,gap?2+2/30:2/30])a.frame(`media_type=video|pts_time=${pts}|duration_time=${1/30}`);return {...a.finish(),needsConsent:uncertain};}}:require(id)});
 const prepareMedia=(file,opts={})=>mod.exports.prepareMedia(file,{chooseEncoder:async()=>['h264_mf'],...opts});
 return{...mod.exports,prepareMedia,calls,files,fakeFs};
}
test('shared preparation refuses decoded gaps before codec permission or ffmpeg, even with consent',async()=>{
 for(const compatible of [false,true])for(const allowTranscode of [false,true]){
  const w=world({compatible});await assert.rejects(w.prepareMedia('/media/source.flv',{allowTranscode}),{code:'FLV_TIMELINE_GAP'});
  assert.equal(w.calls.scan,1);assert.equal(w.calls.encode,0);assert.equal(w.calls.writes,0);
 }
});
test('continuous timelines retain codec consent and unverified scans fail closed',async()=>{
 const w=world({gap:false});await assert.rejects(w.prepareMedia('/media/source.flv'),{code:'FLV_TRANSCODE_REQUIRED'});assert.equal(w.calls.encode,0);
 const ok=world({gap:false,compatible:true});assert.equal((await ok.prepareMedia('/media/source.flv')).preparation,'remux');assert.equal(ok.calls.encode,1);
 const bad=world({scanFailure:true});await assert.rejects(bad.prepareMedia('/media/source.flv',{allowTranscode:true}),{code:'FLV_PROBE_FAILED'});assert.equal(bad.calls.encode,0);
});
test('production REST upload and reprepare preserve gap code and original; never report completion',async()=>{
 const source=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const begin=source.indexOf('  if (p === "/api/upload"'),end=source.indexOf('  /* API: download an HTTPS URL',begin);
 for(const route of ['/api/upload','/api/prepare-media']){
  const w=world(),responses=[],file=path.join('/media','source.flv');w.files.set(file,Buffer.from('original'));
  const context={...w,fs:w.fakeFs,path,p:route,req:{method:'POST'},res:{},MEDIA_DIR:'/media',url:new URL('http://local?name=new.flv'),safeName:x=>x,resolveSrc:()=>file,readBody:async()=>Buffer.from(route==='/api/upload'?'uploaded original':JSON.stringify({src:'/media/source.flv',allowTranscode:true})),faststart:async()=>{},sendJSON:(_res,status,body)=>responses.push({status,body})};
  vm.createContext(context);await vm.runInContext('(async()=>{'+source.slice(begin,end)+'})()',context);
  assert.equal(responses.length,1);assert.equal(responses[0].body.code,'FLV_TIMELINE_GAP');assert.notEqual(responses[0].status,200);assert.equal(w.calls.encode,0);assert.equal(w.files.get(file).toString(),'original');
  if(route==='/api/upload'){assert.equal(w.calls.writes,1);assert.equal(w.files.get(path.join('/media','new.flv')).toString(),'uploaded original');}else assert.equal(w.calls.writes,0);
 }
});
test('production MCP copied original remains but gap cannot register media with transcode consent',async()=>{
 const source=fs.readFileSync(path.join(root,'mcp-server.js'),'utf8'),start=source.indexOf('    case "fablecut_import_media": {'),end=source.indexOf('\n    case ',start+10);
 const w=world(),original=path.resolve('source.flv');w.files.set(original,Buffer.from('original'));
 const context={...w,args:{path:original,allowTranscode:true},fs:w.fakeFs,path,MEDIA_DIR:path.resolve('media'),KIND_BY_EXT:{'.flv':'video'},uid:()=> 'id',ffprobeDuration:()=>1,probeFile:async()=>({}),infoForEntry:()=>({}),lastReadRevision:0,readProject:()=>({media:[],revision:0}),writeProject(){w.calls.register++;}};
 vm.createContext(context);await assert.rejects(vm.runInContext('(async()=>{switch("fablecut_import_media"){'+source.slice(start,end)+'}})()',context),{code:'FLV_TIMELINE_GAP'});
 assert.equal(w.calls.copies,1);assert.equal(w.calls.register,0);assert.equal(w.calls.encode,0);assert.equal(w.files.get(original).toString(),'original');assert.equal(w.files.size,2);
});
test('production URL receiver rejects a .flv filename before storing the response',async()=>{
 const source=fs.readFileSync(path.join(root,'import-url.js'),'utf8'),mod={exports:{}};
 vm.runInNewContext(source+'\nmodule.exports.saveResponse=saveResponse;',{module:mod,exports:mod.exports,require:id=>id==='./ffmpeg-path'?require('../ffmpeg-path'):(id==='node:child_process'||id==='child_process')?createMediaProcess({processes:{spawnSync(){assert.fail('URL rejection must not spawn');},execFile(){assert.fail('URL rejection must not execute');}}}):require(id),URL,Buffer,setTimeout,clearTimeout});
 let drained=0;const res={statusCode:200,headers:{'content-type':'video/x-flv'},resume(){drained++;}};
 await assert.rejects(mod.exports.saveResponse(res,new URL('https://example.invalid/source.flv'),'/unused',{maxBytes:1024}),/unsupported media type/);
 assert.equal(drained,1);
});
test('existing decoded scanner detects an audio-only hole without moving either track origin',()=>{
 const a=accumulator([{codec_type:'video',avg_frame_rate:'30/1',time_base:'1/1000'},{codec_type:'audio',sample_rate:'48000',time_base:'1/1000'}],3);
 for(let i=0;i<90;i++)a.frame(`media_type=video|pts_time=${0.067+i/30}|duration_time=${1/30}`);
 a.frame('media_type=audio|pts_time=0.046|duration_time=0.02');a.frame('media_type=audio|pts_time=2.066|duration_time=0.02');
 const range=a.finish();assert.equal(range.start,0.046);assert.ok(Math.abs(range.maxGap-2)<1e-10);assert.ok(range.end>3);
});

test('readable-range authorization precedes codec consent and cannot bypass gap refusal',async()=>{
 const w=world({gap:false,uncertain:true});
 await assert.rejects(w.prepareMedia('/media/source.flv',{allowTranscode:true}),{code:'FLV_READABLE_CONSENT_REQUIRED'});
 assert.equal(w.calls.encode,0);
 await assert.rejects(w.prepareMedia('/media/source.flv',{acceptReadable:true}),{code:'FLV_TRANSCODE_REQUIRED'});
 assert.equal(w.calls.encode,0);
 assert.equal((await w.prepareMedia('/media/source.flv',{acceptReadable:true,allowTranscode:true})).preparation,'transcode');
 const gap=world();await assert.rejects(gap.prepareMedia('/media/source.flv',{acceptReadable:true,allowTranscode:true}),{code:'FLV_TIMELINE_GAP'});assert.equal(gap.calls.encode,0);
});
