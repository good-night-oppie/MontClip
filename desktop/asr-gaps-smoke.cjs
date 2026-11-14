'use strict';
// A transcription with parts the engine could not read, in the real app (Deja, 2026-11-03, from Rea on #93). Fresh
// profile, hidden offscreen window, the real page and server. The speech engine is not run: the transcribe request is
// answered as the server answers a partial transcription (the transcript with one gap saved through the real
// /api/transcript, {status:"partial", gaps:1, gapSeconds}), so this checks what the page does with it:
//   - the toast after 听写 says only part was transcribed — how many parts, how long — and never that it is done;
//   - the Transcript tab lists the gap on the timeline (clip at 10 s, gap 5–12 s of the file → 0:15–0:22) and a click
//     goes there;
//   - subtitles made from the timeline's words have nothing in the gap.
//   electron desktop/asr-gaps-smoke.cjs --montclip-smoke --user-data-dir=<fresh>   → ASR_GAPS_PASS / ASR_GAPS_FAIL
// With MONTCLIP_SHOTS_OUT (an absolute folder) it saves a picture of its own window (capturePage).
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shots=process.env.MONTCLIP_SHOTS_OUT||null;if(shots&&!path.isAbsolute(shots))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const {wav}=require('../test/songs-synth');
const V=require('../shared/ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v);
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'听写缺口 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav([['talk',30]]).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=talk.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_talk',name:'合成讲话',kind:'audio',src:${JSON.stringify(up.src)},duration:30,audioChannels:1});
   doc.clips.push({id:'c_talk',mediaId:'m_talk',kind:'audio',track:'A1',start:10,in:0,duration:30,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  // the server's answer to a partial transcription: the transcript saved with its gap (file seconds 5–12), then the reply
  await read(`(()=>{const real=window.fetch;window.fetch=async(url,o)=>{if(String(url)==='/api/asr/transcribe'){const src=JSON.parse(o.body).src,words=[];
     for(let t=0;t<30;t+=0.5)if(t<5||t>=12)words.push(['字',t,t+0.4]);
     await real('/api/transcript?src='+encodeURIComponent(src),{method:'POST',body:JSON.stringify({src,model:'paraformer-zh',language:'zh',duration:30,words,gaps:[[5,12,'basic_string::_S_create']]})});
     return new Response(JSON.stringify({src,status:'partial',gaps:1,gapSeconds:7,words:words.length,duration:30}),{status:200,headers:{'content-type':'application/json'}});}
    return real(url,o);};return true;})()`);
  // 听写 from the Transcript tab
  await read(`(async()=>{openTranscriptTab?openTranscriptTab():null;return true;})()`).catch(()=>{});
  await read(`(async()=>{state.selIds=new Set(["c_talk"]);await transcribeFromTab();await new Promise(r=>setTimeout(r,300));return true;})()`);
  report.toast=await read(`els.toast.textContent`);
  assert.equal(report.toast,zh('tr-gaps-toast',{n:1,dur:'7 秒'}));
  // never the plain done toast; JJ's sentence says it finished *and* that parts are missing, in the same breath
  assert.ok(!/^Transcribed /.test(report.toast)&&/没听写出来/.test(report.toast),'never told as simply done');
  // the tab: the gap where it is on the timeline (10 + 5 … 10 + 12), and a click goes there
  await read(`(async()=>{document.querySelector('[data-side=transcript]').click();await new Promise(r=>setTimeout(r,300));renderTranscript(true);return trState.open;})()`);
  report.note=await read(`(()=>{const n=document.querySelector('[data-tr-gaps]');return n&&{text:n.textContent,spots:[...n.querySelectorAll('.tr-gap-go')].map(x=>[x.textContent,+x.dataset.t,x.tagName,x.tabIndex])};})()`);
  assert.ok(report.note,'the gaps are listed');
  assert.ok(report.note.text.startsWith(zh('tr-gaps-note',{n:1,dur:'7 秒'})),report.note.text);
  // VV on #95 d95ab21: the cards' time format (0:15–0:22), a button Tab reaches; Enter from the keyboard goes there
  assert.deepEqual(report.note.spots,[['0:15–0:22',15,'BUTTON',0]]);
  await read(`(()=>{setTime(0);document.querySelector('[data-tr-gaps] .tr-gap-go').focus();return document.activeElement.matches('.tr-gap-go');})()`);
  for(const type of ['keyDown','char','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Enter'});
  await wait(200);report.playhead=await read(`state.time`);
  assert.ok(Math.abs(report.playhead-15)<0.05,'jumped to the gap: '+report.playhead);
  // subtitles made from the timeline's words: nothing in the gap (15–22 s on the timeline)
  report.cues=await read(`MontClipCaptions.cues(transcriptWords(),{}).map(c=>[c.start,c.end,c.text.length])`);
  assert.ok(report.cues.length>=2);assert.ok(!report.cues.some(([s])=>s>=15&&s<22),'no subtitle starts in the gap');
  if(shots){await wait(300);fs.writeFileSync(path.join(shots,'asr-gaps-tab.png'),(await win.webContents.capturePage()).toPNG());}
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'ASR_GAPS_PASS':'ASR_GAPS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
