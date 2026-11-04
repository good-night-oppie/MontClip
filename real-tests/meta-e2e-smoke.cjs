'use strict';
// End-to-end with a real model (Meta Muse Spark) in the real desktop app: fresh profile, a new project with a synthetic
// 10 s recording, the connection set up through the AI service settings (Meta（Muse Spark）, model filled in), a plain
// Chinese request「把 3 到 5 秒删掉」, the review (it names api.meta.ai), the real reply, the approval in 手动, the cut
// on the timeline, and Undo. Run only through real-tests/run-meta-e2e.cjs. The key is typed into the password field
// like a user would; it is never printed, and no screenshot is taken while the settings are open.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke')||process.env.MONTCLIP_REAL_MODELS!=='1')throw Error('Explicit smoke with MONTCLIP_REAL_MODELS=1 required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length).trim();
const out=process.env.MONTCLIP_E2E_OUT,KEY=process.env.MONTCLIP_E2E_KEY_FILE?fs.readFileSync(process.env.MONTCLIP_E2E_KEY_FILE,'utf8').trim():null,MODEL=process.env.MONTCLIP_E2E_MODEL;
if(!out||!KEY||!MODEL)throw Error('runner required');
const hide=s=>String(s).split(KEY).join('<key>');
const log=(k,v)=>process.stdout.write(k+' '+hide(JSON.stringify(v))+'\n');
const SECONDS=10,PROMPT='把 3 到 5 秒删掉';
// 10 s: a test pattern with a running counter, a tone; the bundled ffmpeg when given, else the system one (no A/V evidence here)
function makeSource(file){
 const dir=process.env.MONTCLIP_FFMPEG_DIR,ffmpeg=dir?path.join(dir,'ffmpeg'+(process.platform==='win32'?'.exe':'')):'ffmpeg';
 const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-n','-f','lavfi','-i',`testsrc2=size=320x180:rate=30:duration=${SECONDS}`,'-f','lavfi','-i',`sine=frequency=440:sample_rate=48000:duration=${SECONDS}`,
  '-map','0:v','-map','1:a','-c:v','mpeg4','-q:v','5','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',file],{windowsHide:true});
 if(r.status!==0)throw Error('SOURCE_FAILED '+String(r.stderr).slice(0,300));
}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const result={model:MODEL,prompt:PROMPT,checks:JSON.parse(process.env.MONTCLIP_E2E_CHECKS||'{}'),steps:[]};const step=(name,data)=>{result.steps.push({name,...data});log('E2E_STEP',{name,...data});};
 const shot=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 const videoClips='JSON.stringify(project.clips.filter(c=>c.kind==="video").map(c=>[c.start,c.in,c.duration]))';
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  win.setContentSize(1270,800);await wait(500);
  // a new project with the synthetic recording on V1 and its sound on A1
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'Meta e2e',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);await wait();
  const media=path.join(profile,'workspace','media');fs.mkdirSync(media,{recursive:true});makeSource(path.join(media,'合成.mp4'));
  await read(`(async()=>{const doc=projectJSON();Object.assign(doc,{width:320,height:180,fps:30,media:[{id:'m1',src:'/media/合成.mp4',kind:'video',name:'合成.mp4',duration:${SECONDS},width:320,height:180}],
   clips:[{id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:${SECONDS},props:{volume:0},linkGroup:'g1'},{id:'a1',kind:'audio',mediaId:'m1',track:'A1',start:0,in:0,duration:${SECONDS},props:{volume:1},linkGroup:'g1'}]});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait(300);
  const byText=t=>`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(t)})`;
  const click=async sel=>{const ok=await read(`(()=>{const e=${sel};if(!e)return false;e.click();return true;})()`);assert.ok(ok,'missing '+sel);await wait(250);};
  const setValue=async(sel,v)=>read(`(()=>{const e=${sel},proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`);
  // the connection, through the settings
  await click(byText('AI 服务'));
  await setValue(`document.querySelector('.cindy-config select')`,'meta');await wait(300);
  const settings=await read(`(()=>{const s=document.querySelector('.cindy-config select');return{option:Array.from(s.options).find(o=>o.value==='meta')?.textContent,options:Array.from(s.options).map(o=>o.value),model:document.querySelectorAll('.cindy-config input')[0].value};})()`);
  step('settings',settings);assert.ok(settings.option&&settings.option.startsWith('Meta（Muse Spark） · api.meta.ai'),settings.option);assert.equal(settings.model,'muse-spark-1.1','the model is filled in');
  if(MODEL!==settings.model)await setValue(`document.querySelectorAll('.cindy-config input')[0]`,MODEL);
  await setValue(`document.querySelectorAll('.cindy-config input')[1]`,KEY);await wait(200);
  await click(`document.querySelector('.cindy-config button')`);
  const conf=await read('montclipAgentService.get()');step('configured',{provider:conf.provider,model:conf.model,configured:conf.configured});
  assert.equal(conf.configured,true);assert.equal(conf.provider,'meta');
  await click(byText('AI 服务'));
  assert.equal(await read(`!!document.querySelector('.cindy-config')`),false,'settings closed before any screenshot');
  const before=await read(videoClips),depth=await read('runtime.undo.length');
  await setValue(`document.querySelector('[data-cindy-draft]')`,PROMPT);
  await click(`document.querySelector('.cindy-send button')`);await wait(500);
  const review=await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');return d?{domain:d.querySelector('p').textContent,formatNote:!!d.querySelector('[data-format-note]'),raw:d.querySelector('[data-raw-request] pre').textContent.includes('"role": "system"')}:null;})()`);
  step('review',review||{});assert.ok(review&&review.formatNote&&review.raw&&review.domain.includes('api.meta.ai'),'the review names api.meta.ai');
  await shot('meta-review');
  const t0=Date.now();await click(`document.querySelector('.cindy-confirm[open] button')`);
  for(let i=0;i<240;i++){await wait(500);const s=JSON.parse(await read(`JSON.stringify({replies:document.querySelectorAll('[role=log] .cindy-message.assistant').length,approval:!!document.querySelector('[data-agent-approval][open]'),notice:Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join(' | ')})`));if(s.approval||s.replies>0&&i>6||/限流|密钥|没有及时|连不上|出了问题|请求失败|模型名称/.test(s.notice))break;}
  const reply=await read(`(()=>{const m=Array.from(document.querySelectorAll('[role=log] .cindy-message.assistant')).at(-1);return{text:m?m.textContent:'',notice:Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join(' | '),approval:document.querySelector('[data-agent-approval][open]')?.textContent||null};})()`);
  step('reply',{ms:Date.now()-t0,...reply});await shot('meta-reply');
  if(/限流|没有及时|连不上|出了问题/.test(reply.notice)&&!reply.text){result.skipped='provider unavailable: '+reply.notice;throw Object.assign(new Error('SKIP'),{skip:true});}
  assert.ok(reply.approval,'手动 asks before the AI edits; reply: '+reply.text.slice(0,300)+' notice: '+reply.notice);
  await click(`document.querySelector('[data-agent-approval][open] [data-choice="once"]')`);await wait(800);
  const after=await read(videoClips),clips=JSON.parse(after);
  // what was kept, in source seconds: nothing of 3–5 s may remain (a tenth of a second of slack), and the other 8 s stay
  const kept=clips.map(([,from,dur])=>[from,from+dur]),overlap=kept.reduce((n,[f,t])=>n+Math.max(0,Math.min(t,5)-Math.max(f,3)),0),total=kept.reduce((n,[f,t])=>n+t-f,0);
  const steps=(await read('runtime.undo.length'))-depth;
  step('applied',{clips,overlapWith3to5:+overlap.toFixed(3),keptSeconds:+total.toFixed(3),undoSteps:steps});
  assert.notEqual(after,before,'the timeline changed');assert.ok(overlap<=0.1,'3–5 s is gone');assert.ok(total>=7.8&&total<=8.1,'the other 8 s are kept');
  assert.equal(steps,1,'one undo step');
  result.event=await read(`(()=>{const e=runtime.eventLog.list().filter(e=>e.actor==='ai').at(-1);return e&&{capability:e.capability,state:e.state,args:e.args};})()`);
  await shot('meta-applied');
  await read('undo();true');await wait(400);
  const undone=await read(videoClips);step('undone',{restored:undone===before});assert.equal(undone,before);
  result.eventAfterUndo=await read(`runtime.eventLog.list().filter(e=>e.actor==='ai').at(-1)?.state||null`);
  result.passed=true;
 }catch(e){if(!e.skip){result.failed=hide(String(e.message||e));}}
 finally{fs.writeFileSync(path.join(out,'e2e-result.json'),hide(JSON.stringify(result,null,1))+'\n');log('E2E_DONE',{passed:!!result.passed,skipped:result.skipped||null,failed:result.failed||null});setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('../desktop/main');
