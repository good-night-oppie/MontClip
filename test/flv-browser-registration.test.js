'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function world({ok=true,late=false}={}){
 const calls={saved:0,blobs:0},project={media:[],clips:[],revision:1};
 const context={project,runtime:{projectGen:1},state:{connected:true},uid:()=> 'one',MediaLib:require('../media-lib'),toast(m){calls.toast=m;},MontClipView:require('../ui-preferences'),mcView:{get:()=>({language:'zh-CN'})},getFolder(){},renderBin(){},scheduleSave(){calls.saved++;},refreshMediaInfo(){},ensureWave(){},grabThumb:async()=>{},loadMediaMetadata:async()=>{if(late)context.runtime.projectGen++;},fetch:async()=>({ok,status:409,json:async()=>({src:'/media/compat.mp4',originalSrc:'/media/source.flv',preparation:'remux'})}),URL:{createObjectURL(){calls.blobs++;return 'blob:x';}},
  // the upload goes through uploadWithProgress (XHR, for 「正在导入… n%」); here it answers what fetch above answers
  importingStart:()=>null,importingSet(){},importingEnd(){},autoAfterImport(){},uploadWithProgress:async(file)=>{const r=await context.fetch('/api/upload?name='+encodeURIComponent(file.name));return {ok:r.ok,status:r.status,json:await r.json()};}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function mediaKindFromFile('),source.indexOf('function setImportUrlBusy(')),context);
 // a refusal is a dialog now (Deja, 2026-11-04), not a toast: what it says, and that it waits for an answer
 context.flvNotice=async(m,o)=>{calls.notice=m;calls.noticeOptions=o;return false;};return{context,calls,project};
}
test('browser FLV rejection never registers transient fallback or schedules an empty save',async()=>{const w=world({ok:false});await w.context.importFiles([{name:'source.flv',type:'video/x-flv'}]);assert.equal(w.project.media.length,0);assert.equal(w.calls.blobs,0);assert.equal(w.calls.saved,0);assert.equal(w.calls.toast,undefined,'not a passing toast');assert.ok(/没导进来/.test(w.calls.notice)&&!/[A-Za-z]{4,}/.test(w.calls.notice.replace(/FLV|MP4|MontClip/g,'')),'said in Chinese: '+w.calls.notice);});
test('browser: a recording with breaks is offered as a conversion; 〔帮我转〕 asks the server with fixGaps; the breaks go on the media',async()=>{
 const w=world(),sent=[],notes=[],gaps=[{stream:'video',at:62.5,len:8,big:true},{stream:'audio',at:62.5,len:8,big:true}];
 w.context.fetch=async(url,init)=>{sent.push({url,body:init&&init.body});
  return url.startsWith('/api/upload')?{ok:false,status:409,json:async()=>({code:'FLV_TIMELINE_GAP',originalSrc:'/media/source.flv',gaps,fix:['break']})}
   :{ok:true,status:200,json:async()=>({src:'/media/compat.mp4',originalSrc:'/media/source.flv',preparation:'remux',gapsHeld:true,gaps})};};
 w.context.flvNotice=async(m,o)=>{notes.push([m,o]);return true;};
 await w.context.importFiles([{name:'断过.flv',type:''}]);
 assert.equal(notes[0][0],w.context.MontClipView.t('zh-CN','flvTimingUnverified'),"JJ's sentence");assert.equal(notes[0][1].convert,true);
 assert.equal(sent[1].url,'/api/prepare-media');assert.deepEqual(JSON.parse(sent[1].body),{src:'/media/source.flv',fixGaps:true,acceptReadable:true,allowTranscode:true});
 assert.equal(notes[1][0],'已经转好了。这里录像断了约 8 秒，已经接上。','one break both streams share is said once');
 assert.equal(w.project.media.length,1);assert.equal(w.project.media[0].preparation,'remux');
 assert.deepEqual(w.project.media[0].gaps,gaps,'the timeline marks come from here');
});
test('browser: declining the conversion imports nothing',async()=>{
 const w=world();w.context.fetch=async()=>({ok:false,status:409,json:async()=>({code:'FLV_TIMELINE_GAP',originalSrc:'/media/source.flv',gaps:[]})});
 await w.context.importFiles([{name:'断过.flv',type:''}]);assert.equal(w.project.media.length,0);assert.equal(w.calls.saved,0);
});
test('browser metadata late after project change is not registered',async()=>{const w=world({late:true});await w.context.importFiles([{name:'source.flv',type:''}]);assert.equal(w.project.media.length,0);assert.equal(w.calls.saved,0);});
test('browser registration and actual project serializer preserve source fields across JSON reload',async()=>{
 const w=world();await w.context.importFiles([{name:'中文 空格.flv',type:''}]);assert.equal(w.calls.saved,1);const m=w.project.media[0];assert.equal(m.originalSrc,'/media/source.flv');
 Object.assign(w.context,{MediaLib:require('../media-lib'),MontClipDanmaku:require('../danmaku'),serializeTracks:()=>[],serializeClip:x=>x,normalizeMarkers:()=>[],normalizeDisabledTracks:()=>[],getExportFrame:()=>null,normalizeMaster:()=>null,normalizeBuses:()=>[],normalizeDanmaku:()=>null});
 vm.runInContext(source.slice(source.indexOf('function projectJSONHere()'),source.indexOf('function listenSSE()')),w.context);
 vm.runInContext(source.slice(source.indexOf('function normalizeMediaEntry('),source.indexOf('function folderChildren(')),w.context);
 m.gaps=[{stream:'video',at:30.0234,len:0.0341,big:false},{stream:'audio',at:-1,len:2}];   // the second is not a gap: dropped
 const doc=JSON.parse(JSON.stringify(w.context.projectJSONHere()));const loaded=w.context.normalizeMediaEntry(doc.media[0]);
 assert.deepEqual(loaded.gaps,[{stream:'video',at:30.023,len:0.034,big:false}],'the breaks survive a save and a load, rounded to the millisecond');assert.equal(loaded.src,m.src);assert.equal(loaded.originalSrc,m.originalSrc);assert.equal(loaded.preparation,'remux');assert.deepEqual(doc.clips,[]);
});
