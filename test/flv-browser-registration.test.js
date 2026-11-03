'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
function world({ok=true,late=false}={}){
 const calls={saved:0,blobs:0},project={media:[],clips:[],revision:1};
 const context={project,runtime:{projectGen:1},state:{connected:true},uid:()=> 'one',toast(m){calls.toast=m;},MontClipView:require('../ui-preferences'),mcView:{get:()=>({language:'zh-CN'})},getFolder(){},renderBin(){},scheduleSave(){calls.saved++;},refreshMediaInfo(){},ensureWave(){},grabThumb:async()=>{},loadMediaMetadata:async()=>{if(late)context.runtime.projectGen++;},fetch:async()=>({ok,status:409,json:async()=>({src:'/media/compat.mp4',originalSrc:'/media/source.flv',preparation:'remux'})}),URL:{createObjectURL(){calls.blobs++;return 'blob:x';}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function mediaKindFromFile('),source.indexOf('function setImportUrlBusy(')),context);return{context,calls,project};
}
test('browser FLV rejection never registers transient fallback or schedules an empty save',async()=>{const w=world({ok:false});await w.context.importFiles([{name:'source.flv',type:'video/x-flv'}]);assert.equal(w.project.media.length,0);assert.equal(w.calls.blobs,0);assert.equal(w.calls.saved,0);assert.ok(/没导进来/.test(w.calls.toast)&&!/[A-Za-z]{4,}/.test(w.calls.toast.replace(/FLV|MP4|MontClip/g,'')),'said in Chinese: '+w.calls.toast);});
test('browser metadata late after project change is not registered',async()=>{const w=world({late:true});await w.context.importFiles([{name:'source.flv',type:''}]);assert.equal(w.project.media.length,0);assert.equal(w.calls.saved,0);});
test('browser registration and actual project serializer preserve source fields across JSON reload',async()=>{
 const w=world();await w.context.importFiles([{name:'中文 空格.flv',type:''}]);assert.equal(w.calls.saved,1);const m=w.project.media[0];assert.equal(m.originalSrc,'/media/source.flv');
 Object.assign(w.context,{MediaLib:require('../media-lib'),serializeTracks:()=>[],serializeClip:x=>x,normalizeMarkers:()=>[],normalizeDisabledTracks:()=>[],getExportFrame:()=>null,normalizeMaster:()=>null,normalizeBuses:()=>[],normalizeDanmaku:()=>null});
 vm.runInContext(source.slice(source.indexOf('function projectJSONHere()'),source.indexOf('function listenSSE()')),w.context);
 vm.runInContext(source.slice(source.indexOf('function normalizeMediaEntry('),source.indexOf('function folderChildren(')),w.context);
 const doc=JSON.parse(JSON.stringify(w.context.projectJSONHere()));const loaded=w.context.normalizeMediaEntry(doc.media[0]);assert.equal(loaded.src,m.src);assert.equal(loaded.originalSrc,m.originalSrc);assert.equal(loaded.preparation,'remux');assert.deepEqual(doc.clips,[]);
});
