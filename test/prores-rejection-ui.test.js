'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const EN="Export didn't run: MontClip can't guarantee the custom audio or filter settings in this preset. So that the exported sound doesn't differ from what you set, no file was made. Remove the custom audio and filter settings from the preset, or pick another preset, then listen to the result to check the sound is what you want.";
const ZH="导出没有进行：这个预设里自定义的声音或滤镜设置，MontClip 没法保证照做。为了不让导出的声音和你设的不一样，没有生成文件。请去掉预设里自定义的声音和滤镜设置，或者换一个预设，导出后再听一下声音是不是你要的。";
const prefs=fs.readFileSync(path.join(__dirname,"../ui-preferences.js"),"utf8");
test("JJ final rejection copy is locked word for word (#190)",()=>{
  assert.ok(prefs.includes('"export-profile-unsupported": ['+JSON.stringify(EN)+', '+JSON.stringify(ZH)+']'));
  for(const s of [EN,ZH])assert.ok(!s.includes("PROFILE_"));
});
const source=app.slice(app.indexOf('async function fastExport(opts = {})'),app.indexOf('/* ── Export queue'));
for(const language of ['zh-CN','en'])for(const job of [null,'agent-job'])test('unsupported profile code stays out of '+language+' '+(job?'job/queue':'alert'),async()=>{
  const alerts=[],reports=[],posts=[],noop=()=>{},prefix=language==='zh-CN'?'导出失败：':'Export failed: ';
  const box={AbortController,state:{},runtime:{},renderCancelled:false,exportAbort:null,exportFullCanvas:false,
    els:{exportOverlay:{classList:{add:noop,remove:noop}},exportProgress:{style:{}},exportNote:{},exportTitle:{}},
    pause:noop,restoreExportVideoState:noop,projectFps:()=>30,beginExportWindow:()=>({start:0,end:1,frames:30}),
    renderAudioMix:async()=>null,effectiveEncodeProfileId:()=> 'prores422',deliveryCanvas:()=>({w:160,h:90}),exportBaseName:()=> 'test',
    MontClipView:{h264Message:()=>''},mcView:{get:()=>({language})},uiText:k=>k==='own.export-failed-prefix'?prefix:k==='own.export-profile-unsupported'?(language==='zh-CN'?ZH:EN):k,
    fetch:async(url,request)=>{posts.push(url);return{json:async()=>({code:'PROFILE_FILTER_MAPPING_UNSUPPORTED',error:'PROFILE_FILTER_MAPPING_UNSUPPORTED'})};},
    alert:s=>alerts.push(s),reportExportJob:async(id,data)=>reports.push(data),exportDecodeEnd:noop,endExportWindow:noop,releaseOriginalPlayers:noop};
  vm.createContext(box);vm.runInContext(source,box);const result=await box.fastExport({profile:'prores422',job});
  assert.ok(!result.error.includes('PROFILE_'),'queue-facing result must not expose machine code');
  assert.equal(result.code,'PROFILE_FILTER_MAPPING_UNSUPPORTED','structured diagnostic code remains available');
  assert.ok(alerts.every(s=>!s.includes('PROFILE_')));assert.ok(reports.every(s=>!s.error.includes('PROFILE_')));
  const want=language==='zh-CN'?ZH:EN;assert.equal(result.error,want);
  if(job)assert.deepEqual(reports.map(r=>r.error),[want]);else assert.deepEqual(alerts,[want]);
  assert.deepEqual(posts,['/api/export/begin']);assert.equal(box.state.exporting,false);
});
