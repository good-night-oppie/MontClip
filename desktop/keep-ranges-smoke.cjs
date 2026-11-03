'use strict';
// keep_ranges, per_range (Deja, 2026-11-03): ask for one clip per song → a MOCK reply (injected test-only transport,
// not a model) → proposal card → review → apply (one undo step) → three slices in the export queue → three files.
// Each file: its length, and A/V sync (every flash against its beep, limit 40 ms) measured with MontClip's own ffmpeg.
// Then Undo, and a queued slice refuses to render the changed timeline. Synthetic media only; fresh profile; hidden
// offscreen window; nothing leaves this computer.
//   MONTCLIP_FFMPEG_DIR=<bundled ffmpeg dir> electron desktop/keep-ranges-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
// Prints KEEP_RANGES_PASS / KEEP_RANGES_FAIL with the numbers.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length).trim();
const dir=process.env.MONTCLIP_FFMPEG_DIR;if(!dir)throw Error('MONTCLIP_FFMPEG_DIR (the bundled ffmpeg) is required; the system ffmpeg is not used for A/V evidence');
const exe=n=>path.join(dir,n+(process.platform==='win32'?'.exe':'')),ffmpeg=exe('ffmpeg');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const {measure}=require('./av-sync-measure.cjs');

// The source: 30 s black, one white frame every 15 frames from frame 6 (t = 0.2 + 0.5k), a 20 ms 1 kHz beep at each flash.
const SECONDS=30,RANGES=[[2,6,'第一首'],[10,14,'第二首'],[20,24,'第三首']];
function makeSource(file){
 const video=`color=c=black:size=320x180:rate=30:duration=${SECONDS},format=yuv420p,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(n\\,6)*eq(mod(n-6\\,15)\\,0)'`;
 const audio=`aevalsrc=exprs='gte(t\\,0.2)*lt(mod(t-0.2\\,0.5)\\,0.02)*0.8*sin(2*PI*1000*t)':s=48000:d=${SECONDS}`;
 const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-n','-f','lavfi','-i',video,'-f','lavfi','-i',audio,'-map','0:v','-map','1:a',
  '-c:v','libvpx-vp9','-b:v','0','-crf','32','-deadline','good','-cpu-used','4','-g','15','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ac','1','-ar','48000','-movflags','+faststart',file],{windowsHide:true});
 if(r.status!==0)throw Error('SOURCE_FAILED '+String(r.stderr).slice(0,300));
}

// The mock transport: reads the numbers-only facts the app attached and answers with three per_range slices.
const service=require('./agent-service'),originalService=service.createDiskService;let requests=0,sentFacts=null;
service.createDiskService=(...args)=>{const real=originalService(...args);return{...real,async send(p){
 assert.ok(service.validPayload(p));requests++;const content=p.messages.at(-1).content,tail=JSON.parse(content.slice(content.lastIndexOf('\n\n')+2));sentFacts=tail.facts;
 const clip=tail.facts.clips.find(c=>c.kind==='video');
 return{ok:true,text:JSON.stringify({type:'keep_ranges',output_mode:'per_range',ranges:RANGES.map(([from,to,label])=>({clipId:clip.clipId,from,to,label}))})};}};};

const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={transport:'injected-test-only (mock reply, not a model)'};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'切片 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);await wait();
  const media=path.join(profile,'workspace','media');fs.mkdirSync(media,{recursive:true});makeSource(path.join(media,'合成 歌单.mp4'));
  await read(`(async()=>{const doc=projectJSON();Object.assign(doc,{width:320,height:180,fps:30,media:[{id:'m1',src:'/media/合成 歌单.mp4',kind:'video',name:'合成 歌单.mp4',duration:${SECONDS},width:320,height:180}],
   clips:[{id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:${SECONDS},props:{volume:0},linkGroup:'g1'},{id:'a1',kind:'audio',mediaId:'m1',track:'A1',start:0,in:0,duration:${SECONDS},props:{volume:1},linkGroup:'g1'}]});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  const cfg=await read(`montclipAgentService.configure({provider:'openai',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'})`);assert.equal(cfg.configured,true);
  await read(`setSideTab('assistant');mcAgent.render();true`);await wait();
  await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'把每首歌一首一个切片剪出来');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait();
  await read(`document.querySelector('.cindy-send button').click();true`);await wait(300);
  assert.equal(await read(`!!document.querySelector('.cindy-confirm[open]')`),true,'review opens before anything is sent');assert.equal(requests,0);
  report.factsNote=await read(`document.querySelector('[data-facts-note]')?.textContent||null`);assert.ok(report.factsNote,'the review says numbers about the timeline are attached');
  await read(`document.querySelector('.cindy-confirm button').click();true`);await wait(500);assert.equal(requests,1);
  report.sentFacts=sentFacts;assert.ok(!JSON.stringify(sentFacts).includes('合成')&&!JSON.stringify(sentFacts).includes('/media'),'no file names or paths in the facts');
  report.card=await read(`document.querySelector('.cindy-message.assistant:last-child')?.textContent||''`);assert.ok(report.card.includes('3 条切片'),report.card);
  const before=await read('JSON.stringify(project.clips)'),depth=await read('runtime.undo.length');
  // JJ (#71): one language at a time. The dialog in English has no Chinese and in Chinese no English (the slice names
  // are the streamer's own words, so they are taken out before the check).
  const NAMES=/第[一二三]首-0\d/g,CJK=/[　-〿㐀-鿿＀-￯]/,latin=s=>s.replace(NAMES,'').match(/[A-Za-z]{2,}/g);
  const dialogText=`(()=>{const d=document.querySelector('.sentence-dialog[open]');return d&&{title:d.querySelector('h3').textContent,summary:d.querySelector('[data-summary]').textContent,all:d.textContent};})()`;
  const reopen=async language=>{await read(`(()=>{document.querySelector('.sentence-dialog[open]')?.close();updateMontClipView({language:'${language}'});mcAgent.render();})();true`);await wait();
   await read(`document.querySelector('[data-review-proposal]').click();true`);await wait();return read(dialogText);};
  report.dialogEn=await reopen('en');
  assert.ok(report.dialogEn&&!CJK.test(report.dialogEn.all.replace(NAMES,'')),'English dialog has no Chinese: '+JSON.stringify(report.dialogEn));
  assert.ok(report.dialogEn.summary.startsWith('第一首-01: 0:02–0:06 (4 s)'),report.dialogEn.summary);
  report.dialogZh=await reopen('zh-CN');
  assert.equal(latin(report.dialogZh.all),null,'Chinese dialog has no English: '+JSON.stringify(report.dialogZh));
  report.dialog=await read(dialogText);
  assert.ok(report.dialog&&report.dialog.title.startsWith('按时间切成多条'),JSON.stringify(report.dialog));
  assert.ok(report.dialog.summary.startsWith('第一首-01：0:02–0:06（4 秒）'),'times read as m:ss, with the length: '+report.dialog.summary);
  await read(`document.querySelector('.sentence-dialog [data-apply]').click();true`);await wait();
  report.toast=await read(`document.getElementById('toast').textContent`);assert.equal(latin(report.toast),null,'toast in Chinese only: '+report.toast);
  report.timeline=await read(`project.clips.filter(c=>c.kind==='video').map(c=>[c.start,c.in,c.duration])`);
  assert.deepEqual(report.timeline,[[0,2,4],[4,10,4],[8,20,4]]);assert.equal(await read('runtime.undo.length'),depth+1,'one undo step');
  report.queue=await read(`exportQueue.map(q=>({name:q.name,range:q.range,status:q.status}))`);
  assert.deepEqual(report.queue.map(q=>q.name),['第一首-01','第二首-02','第三首-03']);
  await read(`(async()=>{if(!await flushSave())throw Error('SAVE');})()`);await wait(300);
  report.eventApplied=await read(`(()=>{const e=runtime.agentEvents.at(-1);return e&&{capability:e.capability,actor:e.actor,risk:e.risk,state:e.state,revisionBefore:e.revisionBefore,revisionAfter:e.revisionAfter,args:e.args};})()`);
  assert.equal(report.eventApplied.state,'applied',JSON.stringify(report.eventApplied));assert.ok(report.eventApplied.revisionAfter>report.eventApplied.revisionBefore);
  assert.equal(report.eventApplied.capability,'keep_ranges');assert.equal(report.eventApplied.args.ranges.length,3);
  await read(`(async()=>{await runQueue();})()`);
  report.done=await read(`exportQueue.map(q=>({name:q.name,status:q.status,file:q.file,error:q.error||null}))`);
  assert.ok(report.done.every(q=>q.status==='done'),JSON.stringify(report.done));
  const files=report.done.map(q=>path.join(profile,'workspace','exports',q.file));
  report.files=files.map((f,i)=>{const m=measure(f,{ffmpeg,expect:[0.2,0.7,1.2,1.7,2.2,2.7,3.2,3.7]});
   return{file:path.basename(f),duration:m.duration,frames:m.frames,pairs:m.pairs?.length,worstMs:m.worst!=null?Math.round(m.worst*1e5)/100:null,ok:m.ok,placementOk:m.placementOk};});
  for(const f of report.files){assert.ok(Math.abs(f.duration-4)<=1/30+0.03,'length '+JSON.stringify(f));assert.ok(f.ok,'sync '+JSON.stringify(f));}
  // Undo the apply: the timeline is the old one again, and a slice queued from the new one refuses to render
  await read(`mcAgent.render();true`);await wait();await read(`document.querySelector('[data-proposal-undo]').click();true`);await wait();
  assert.equal(await read('JSON.stringify(project.clips)'),before);
  report.eventAfterUndo=await read(`runtime.agentEvents.at(-1).state`);assert.equal(report.eventAfterUndo,'undone');
  await read(`(async()=>{exportQueue[0].status='pending';await runQueue();})()`);
  report.afterUndo=await read(`({status:exportQueue[0].status,error:exportQueue[0].error})`);assert.equal(report.afterUndo.status,'failed');
  assert.ok(report.afterUndo.error.endsWith('请让助手按现在的时间线再给一次剪辑建议。')&&latin(report.afterUndo.error)===null,report.afterUndo.error);
  // one_file: the joined length reads 0:08, in the order given
  await read(`(async()=>{if(!await flushSave())throw Error('SAVE');const c=agentProjectContext();await showSentenceSelection(MontClipProposal.prepare({type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'v1',from:2,to:6},{clipId:'v1',from:10,to:14}]},{doc:projectJSON(),context:{...c,generation:c.gen}}));})();true`);await wait();
  report.oneFile=await read(dialogText);
  assert.equal(report.oneFile.title,'按时间保留几段，拼成一条');assert.equal(report.oneFile.summary,'0:02–0:06 → 0:10–0:14 拼起来一共 0:08，按你勾选的顺序。');
  assert.equal(latin(report.oneFile.all),null,JSON.stringify(report.oneFile));
  // the project changes under the open by-time dialog → #36's sentence (JJ, 8 PRs: one set of words for this dialog)
  await read(`(()=>{project.markers=(project.markers||[]).concat([{t:1}]);document.querySelector('.sentence-dialog [data-preview]').click();return true;})()`);await wait();
  report.changed=await read(`document.querySelector('.sentence-dialog[open] [data-summary]').textContent`);
  await read(`(()=>{project.markers=project.markers.filter(m=>m.t!==1);return true;})()`);
  assert.equal(report.changed,'项目刚改过。请关掉这个窗口，重新选一次。',report.changed);   // #36's own.sd-changed (JJ, 8 PRs)
  await read(`document.querySelector('.sentence-dialog[open]').close();true`);
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1200);}
 finally{out(ok?'KEEP_RANGES_PASS':'KEEP_RANGES_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
