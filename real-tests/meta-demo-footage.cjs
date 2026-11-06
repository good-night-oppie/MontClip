'use strict';
// Demo footage (Meta AI developer hackathon, 2026-11-04): the real MontClip app, English interface, Muse Spark.
// Two continuous takes, each one MP4 from the hidden window's own frames (capturePage):
//   A — quote two subtitles, "Keep only these two." → keep_sentences → approve → the cut plays → Undo
//   B — "Delete 3 to 5 seconds." → keep_ranges → approve → the cut plays → Undo
// plus a still of the settings with Meta chosen (before any key is typed) and shotlist.md with each shot's time in its take.
// Synthetic material only. The key comes only from ~/.meta-montclip, mode 600 (real-tests/meta-key-file.cjs); nothing is
// recorded while the settings are open, and no output may contain the key (checked at the end).
//   MONTCLIP_REAL_MODELS=1 MONTCLIP_FOOTAGE_OUT=<folder> xvfb-run -a desktop/node_modules/electron/dist/electron \
//     real-tests/meta-demo-footage.cjs --montclip-smoke --user-data-dir=<fresh> --no-sandbox     (europa: with the session DBUS)
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke')||process.env.MONTCLIP_REAL_MODELS!=='1')throw Error('Explicit run with MONTCLIP_REAL_MODELS=1 required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length).trim();
const out=process.env.MONTCLIP_FOOTAGE_OUT;if(!out)throw Error('MONTCLIP_FOOTAGE_OUT required');
const found=require('./meta-key-file.cjs').readKey();if(!found.key){process.stdout.write('FOOTAGE SKIPPED: KEY_UNAVAILABLE; check the key file owner and permissions on Linux.\n');process.exit(2);}
const KEY=found.key,hide=s=>String(s).split(KEY).join('<key>');
const log=(k,v)=>process.stdout.write(k+' '+hide(JSON.stringify(v))+'\n');
const SECONDS=10,FFMPEG=process.env.MONTCLIP_FOOTAGE_FFMPEG||'ffmpeg';
// Output must be new, including dangling links. Electron may create an empty profile before loading this script.
function requireNew(dir){try{fs.lstatSync(dir);}catch(e){if(e.code==='ENOENT')return;throw Error('DIRECTORY_CHECK_FAILED');}throw Error('FRESH_DIRECTORY_REQUIRED');}
let profileExists=false;
try{const st=fs.lstatSync(profile);profileExists=true;if(st.isSymbolicLink()||!st.isDirectory()||fs.readdirSync(profile).length)throw Error('FRESH_PROFILE_REQUIRED');}
catch(e){if(e.code!=='ENOENT')throw Error('FRESH_PROFILE_REQUIRED');}
requireNew(out);
try{if(!profileExists)fs.mkdirSync(profile);fs.mkdirSync(out);}catch{throw Error('DIRECTORY_CREATE_FAILED');}
function makeSource(file){
 const r=cp.spawnSync(FFMPEG,['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=640x360:rate=30:duration=${SECONDS}`,'-f','lavfi','-i',`sine=frequency=440:sample_rate=48000:duration=${SECONDS}`,
  '-map','0:v','-map','1:a','-c:v','libvpx-vp9','-b:v','0','-crf','34','-deadline','good','-cpu-used','5','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ac','2','-movflags','+faststart',file],{windowsHide:true});
 if(r.status!==0)throw Error('SOURCE_FAILED');
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const result={language:'en',takes:{},steps:[]};const step=(name,data)=>{result.steps.push({name,...data});log('FOOTAGE_STEP',{name,...data});};
 // the recorder: frames with their times, one take at a time; never a frame while the settings are open
 let take=null;const takes={};
 const tick=setInterval(async()=>{const t=take;if(!t||t.busy||win.isDestroyed())return;t.busy=true;try{
  if(await read(`!!document.querySelector('.cindy-config')`))return;
  const img=await win.webContents.capturePage(),at=Date.now()-t.t0,file=String(t.frames.length).padStart(5,'0')+'.jpg';
  fs.writeFileSync(path.join(t.dir,file),img.toJPEG(90));t.frames.push({file,at});}catch{}finally{t.busy=false;}},100);
 const startTake=name=>{const dir=path.join(out,'frames-'+name);fs.mkdirSync(dir);take=takes[name]={name,dir,frames:[],shots:[],t0:Date.now(),busy:false};};
 const shot=(what)=>{if(take)take.shots.push({at:Date.now()-take.t0,what});};
 const stopTake=async()=>{const t=take;take=null;while(t.busy)await wait(20);
  if(!t.frames.length)throw Error('NO_FRAMES');
  // each frame lasts until the next one: the take keeps its real pace
  const list=t.frames.map((f,i)=>`file '${f.file}'\nduration ${(((t.frames[i+1]?.at??f.at+100)-f.at)/1000).toFixed(3)}`).join('\n')+`\nfile '${t.frames.at(-1).file}'\n`;
  fs.writeFileSync(path.join(t.dir,'list.ffconcat'),'ffconcat version 1.0\n'+list);
  const mp4=path.join(out,'take-'+t.name+'.mp4'),staged=path.join(t.dir,'encoded.mp4');
  const r=cp.spawnSync(FFMPEG,['-hide_banner','-nostdin','-loglevel','error','-n','-f','concat','-safe','0','-i',path.join(t.dir,'list.ffconcat'),'-vf','fps=30,scale=1280:-2,format=yuv420p','-c:v','libx264','-crf','18','-preset','medium','-movflags','+faststart',staged],{windowsHide:true});
  result.takes[t.name]={file:path.basename(mp4),ok:false,frames:t.frames.length,seconds:+((t.frames.at(-1)?.at||0)/1000).toFixed(1),shots:t.shots,error:'ENCODE_FAILED'};
  if(r.status!==0)throw Error('ENCODE_FAILED');
  // Exclusive publication: a failed encode stays in the private frame directory.
  try{if(!fs.statSync(staged).size)throw Error();fs.copyFileSync(staged,mp4,fs.constants.COPYFILE_EXCL);}catch{throw Error('PUBLISH_FAILED');}
  result.takes[t.name].ok=true;result.takes[t.name].error=null;
  fs.rmSync(t.dir,{recursive:true,force:true});};
 const still=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 const videoClips='JSON.stringify(project.clips.filter(c=>c.kind==="video").map(c=>[c.start,c.in,c.duration]))';
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  win.setContentSize(1280,800);await wait(500);
  await read(`updateMontClipView({language:'en'});setSideTab('assistant');mcAgent.render();true`);await wait(400);
  const T=await read(`(()=>{const e=MontClipView.text.en;return{config:e.officialPane_config,reference:e.officialPane_reference,save:e.officialPane_save};})()`);
  const byText=t=>`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(t)})`;
  const click=async sel=>{const ok=await read(`(()=>{const e=${sel};if(!e)return false;e.click();return true;})()`);assert.ok(ok,'missing '+sel);await wait(300);};
  const setValue=async(sel,v)=>read(`(()=>{const e=${sel},proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`);
  // the synthetic recording through the editor's own import, on the timeline, and three synthetic subtitles
  const file=path.join(profile,'Synthetic clip.mp4');makeSource(file);const b64=fs.readFileSync(file).toString('base64');
  step('imported',await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const [m]=await importFiles([new File([b],'Synthetic clip.mp4',{type:'video/mp4'})]);if(!m)throw Error('IMPORT');
   const until=Date.now()+10000;while(!(m.duration>0)&&Date.now()<until)await new Promise(r=>setTimeout(r,50));addClipFromMedia(m,'V1',0);
   const cues=MontClipCaptions.parse('1\\n00:00:00,000 --> 00:00:03,000\\nHi, here are three quick editing tips.\\n\\n2\\n00:00:03,000 --> 00:00:05,000\\nUm, I got that wrong, cut this.\\n\\n3\\n00:00:05,000 --> 00:00:10,000\\nTip one: cut the pauses.\\n');
   project.clips=project.clips.concat(cues.map((c,i)=>MontClipCaptions.clip(c,{id:'demo_c'+i,track:'V2'})));project.name='Muse Spark demo';els.projectName.textContent=projectStatusText();rebuildClips();setSelection([]);setTime(0);scheduleSave();if(!await flushSave())throw Error('SAVE');
   return{media:m.name,duration:m.duration};})()`));
  // the connection through the settings: a still with Meta chosen before the key is typed, then the key, then closed
  await click(byText(T.config));
  await setValue(`document.querySelector('.cindy-config select')`,'meta');await wait(500);
  const settings=await read(`(()=>{const s=document.querySelector('.cindy-config select');return{option:Array.from(s.options).find(o=>o.value==='meta')?.textContent,model:document.querySelectorAll('.cindy-config input')[0].value,keyEmpty:document.querySelectorAll('.cindy-config input')[1].value===''};})()`);
  step('settings',settings);assert.ok(settings.keyEmpty);await still('00-settings-meta-before-key');
  await setValue(`document.querySelectorAll('.cindy-config input')[1]`,KEY);await wait(200);
  await click(`Array.from(document.querySelectorAll('.cindy-config button')).find(b=>b.textContent===${JSON.stringify(T.save)})`);await wait(300);
  const conf=await read('montclipAgentService.get()');step('configured',{provider:conf.provider,model:conf.model,configured:conf.configured});assert.ok(conf.configured&&conf.provider==='meta');
  await click(byText(T.config));assert.equal(await read(`!!document.querySelector('.cindy-config')`),false);
  const takeOf=async(name,prompt,select)=>{
   const before=await read(videoClips),depth=await read('runtime.undo.length'),replies0=await read(`document.querySelectorAll('[role=log] .cindy-message.assistant').length`);
   await read(`(()=>{setTime(0);setSelection([]);for(const e of document.querySelectorAll('*'))if(e.scrollTop>0&&!e.closest('.cindy-port'))e.scrollTop=0;return true;})()`);await wait(400);
   startTake(name);shot('the timeline: a 10 s synthetic clip, its sound and three subtitles');await wait(2500);
   if(select){shot('select subtitles 1 and 3');await read(`setSelection(${JSON.stringify(select)});true`);await wait(1500);shot('Quote selected captions');await click(byText(T.reference));await wait(1500);}
   shot('type the request: "'+prompt+'"');for(let i=1;i<=prompt.length;i++){await setValue(`document.querySelector('[data-cindy-draft]')`,prompt.slice(0,i));await wait(70);}
   await wait(1200);shot('send → the review: what goes out, to api.meta.ai · muse-spark-1.1');await click(`document.querySelector('.cindy-send button')`);await wait(3500);
   const review=await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');return d?{domain:d.querySelector('p').textContent}:null;})()`);
   step(name+'-review',review||{});assert.ok(review&&review.domain.includes('api.meta.ai'));
   shot('confirm → the request goes to Muse Spark');const t0=Date.now();await click(`document.querySelector('.cindy-confirm[open] button')`);
   for(let i=0;i<240;i++){await wait(250);const s=JSON.parse(await read(`JSON.stringify({replies:document.querySelectorAll('[role=log] .cindy-message.assistant').length,approval:!!document.querySelector('[data-agent-approval][open]')})`));if(s.approval||s.replies>replies0&&i>20)break;}
   const reply=await read(`(()=>{const m=Array.from(document.querySelectorAll('[role=log] .cindy-message.assistant')).at(-1);return{text:m?m.textContent:'',approval:!!document.querySelector('[data-agent-approval][open]')};})()`);
   step(name+'-reply',{ms:Date.now()-t0,...reply});shot('Muse Spark replies in '+((Date.now()-t0)/1000).toFixed(1)+' s; Manual mode asks first');assert.ok(reply.approval,'approval asked; reply: '+reply.text.slice(0,200));
   await wait(3500);shot('Allow this once → the cut is made');await click(`document.querySelector('[data-agent-approval][open] [data-choice="once"]')`);await wait(2500);
   const clips=JSON.parse(await read(videoClips)),kept=clips.map(([,f,d])=>[f,f+d]);
   const overlap=kept.reduce((n,[f,t])=>n+Math.max(0,Math.min(t,5)-Math.max(f,3)),0),total=kept.reduce((n,[f,t])=>n+t-f,0),steps=(await read('runtime.undo.length'))-depth;
   const event=await read(`(()=>{const e=runtime.eventLog.list().filter(e=>e.actor==='ai').at(-1);return e&&{capability:e.capability,state:e.state,args:e.args};})()`);
   step(name+'-applied',{clips,overlapWith3to5:+overlap.toFixed(3),keptSeconds:+total.toFixed(3),undoSteps:steps,event});
   assert.ok(overlap<=0.1&&total>=7.8&&total<=8.1&&steps===1&&event.state==='applied','cut as asked, one undo step');
   shot('play the 8 s cut');await read(`(()=>{setTime(0);play();return true;})()`);await wait(8800);await read(`(()=>{pause();return true;})()`);await wait(1200);
   shot('Undo → back to 10 s');await read('undo();true');await wait(3000);
   const undone=await read(videoClips);step(name+'-undone',{restored:undone===before});assert.equal(undone,before);
   await stopTake();return event.capability;
  };
  result.A=await takeOf('A','Keep only these two sentences',['demo_c0','demo_c2']);
  result.B=await takeOf('B','Delete 3 to 5 seconds',null);
  assert.ok(result.takes.A?.ok&&result.takes.B?.ok,'ENCODE_FAILED');result.passed=true;
 }catch(e){const code=String(e&&e.message||e);result.failed=/^(SOURCE_FAILED|NO_FRAMES|ENCODE_FAILED|PUBLISH_FAILED)$/.test(code)?code:'RECORDING_FAILED';if(take)await stopTake().catch(()=>{});}
 finally{clearInterval(tick);
  const text=hide(JSON.stringify(result,null,1));fs.writeFileSync(path.join(out,'footage-result.json'),text+'\n');
  const lines=['# Demo footage — MontClip × Muse Spark (English interface)','','Recorded '+new Date().toISOString()+' on europa (Linux), the real MontClip desktop app in a hidden window, frames from Electron capturePage, model muse-spark-1.1 via api.meta.ai. Synthetic material only; no key in any frame (nothing is recorded while the settings are open).','',
   '`00-settings-meta-before-key.png` — the AI service settings with Meta (Muse Spark) · api.meta.ai chosen and muse-spark-1.1 filled in, before any key is typed.',''];
  for(const [n,t] of Object.entries(result.takes)){lines.push('## Take '+n+' — `'+t.file+'` ('+t.seconds+' s'+(t.ok?'':', ENCODE FAILED')+')','','| at | shot |','|---|---|');for(const s of t.shots)lines.push('| '+(s.at/1000).toFixed(1)+' s | '+s.what+' |');lines.push('');}
  lines.push('Result: '+(result.passed?'both takes passed (cut as asked, one undo step, undone)':'FAILED: '+result.failed)+'. Details: `footage-result.json`.');
  fs.writeFileSync(path.join(out,'shotlist.md'),hide(lines.join('\n'))+'\n');
  log('FOOTAGE_DONE',{passed:!!result.passed,failed:result.failed||null,takes:Object.fromEntries(Object.entries(result.takes).map(([k,v])=>[k,{ok:v.ok,seconds:v.seconds}]))});
  setTimeout(()=>app.exit(result.passed?0:1),300);}
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('../desktop/main');
