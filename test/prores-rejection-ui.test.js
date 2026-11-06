'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const source=app.slice(app.indexOf('async function fastExport(opts = {})'),app.indexOf('/* ── Export queue'));
for(const language of ['zh-CN','en'])for(const job of [null,'agent-job'])test('unsupported profile code stays out of '+language+' '+(job?'job/queue':'alert'),async()=>{
  const alerts=[],reports=[],posts=[],noop=()=>{},prefix=language==='zh-CN'?'导出失败：':'Export failed: ';
  const box={AbortController,state:{},runtime:{},renderCancelled:false,exportAbort:null,exportFullCanvas:false,
    els:{exportOverlay:{classList:{add:noop,remove:noop}},exportProgress:{style:{}},exportNote:{},exportTitle:{}},
    profileIsH264:()=>false, exportH264Refusal:async()=>null, pause:noop,restoreExportVideoState:noop,projectFps:()=>30,beginExportWindow:()=>({start:0,end:1,frames:30}),
    renderAudioMix:async()=>null,effectiveEncodeProfileId:()=> 'prores422',deliveryCanvas:()=>({w:160,h:90}),exportBaseName:()=> 'test',
    MontClipView:{h264Refusal:()=>''},mcView:{get:()=>({language})},uiText:k=>k==='own.export-failed-prefix'?prefix:k,
    fetch:async(url,request)=>{posts.push(url);return{json:async()=>({code:'PROFILE_FILTER_MAPPING_UNSUPPORTED',error:'PROFILE_FILTER_MAPPING_UNSUPPORTED'})};},
    alert:s=>alerts.push(s),reportExportJob:async(id,data)=>reports.push(data),exportDecodeEnd:noop,endExportWindow:noop,releaseOriginalPlayers:noop};
  vm.createContext(box);vm.runInContext(source,box);const result=await box.fastExport({profile:'prores422',job});
  assert.ok(!result.error.includes('PROFILE_'),'queue-facing result must not expose machine code');
  assert.equal(result.code,'PROFILE_FILTER_MAPPING_UNSUPPORTED','structured diagnostic code remains available');
  assert.ok(alerts.every(s=>!s.includes('PROFILE_')));assert.ok(reports.every(s=>!s.error.includes('PROFILE_')));
  assert.deepEqual(posts,['/api/export/begin']);assert.equal(box.state.exporting,false);
});
