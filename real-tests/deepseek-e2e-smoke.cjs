'use strict';
// End-to-end with a real model (DeepSeek Flash) in the real desktop app: fresh profile,
// default project, connection set up through the AI service settings, two subtitles
// referenced, a plain request, the review (format note shown), the real reply, the
// proposal applied and undone. Run only through real-tests/run-deepseek-e2e.cjs.
// The key is typed into the password field like a user would; it is never printed.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke')||process.env.MONTCLIP_REAL_MODELS!=='1')throw Error('Explicit smoke with MONTCLIP_REAL_MODELS=1 required');
const out=process.env.MONTCLIP_E2E_OUT,KEY=process.env.MONTCLIP_E2E_KEY_FILE?fs.readFileSync(process.env.MONTCLIP_E2E_KEY_FILE,'utf8').trim():null,MODEL=process.env.MONTCLIP_E2E_MODEL;
if(!out||!KEY||!MODEL)throw Error('runner required');
const log=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v).split(KEY).join('<key>')+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const result={steps:[]};const step=(name,data)=>{result.steps.push({name,...data});log('E2E_STEP',{name,...data});};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  win.show();win.setContentSize(1270,800);await wait(500);
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait(300);
  const byText=t=>`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(t)})`;
  const click=async sel=>{const ok=await read(`(()=>{const e=${sel};if(!e)return false;e.click();return true;})()`);assert.ok(ok,'missing '+sel);await wait(250);};
  const setValue=async(sel,v)=>read(`(()=>{const e=${sel},proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`);
  // connection through the settings UI
  await click(byText('AI 服务'));
  await setValue(`document.querySelector('.cindy-config select')`,'deepseek');await wait(200);
  await setValue(`document.querySelectorAll('.cindy-config input')[0]`,MODEL);
  await setValue(`document.querySelectorAll('.cindy-config input')[1]`,KEY);await wait(200);
  await click(`document.querySelector('.cindy-config button')`);
  const conf=await read('montclipAgentService.get()');step('configured',{provider:conf.provider,model:conf.model,configured:conf.configured});
  assert.equal(conf.configured,true);assert.equal(conf.provider,'deepseek');
  await click(byText('AI 服务'));
  // two synthetic subtitles on the default project
  await read(`(()=>{const cues=FableCutCaptions.parse('1\\n00:00:01,000 --> 00:00:03,200\\n今天我们来看三个剪辑技巧。\\n\\n2\\n00:00:03,200 --> 00:00:05,000\\n第一个是删掉停顿。\\n\\n3\\n00:00:05,000 --> 00:00:07,000\\n这一句不要。\\n');project.clips=cues.map((c,i)=>FableCutCaptions.clip(c,{id:'e2e_c'+i,track:'V1'}));rebuildClips();setSelection(['e2e_c0','e2e_c1']);scheduleSave();})()`);
  assert.ok(await read('flushSave()'));
  await click(byText('引用选中字幕'));
  await setValue(`document.querySelector('[data-cindy-draft]')`,'只保留这两句');
  await click(`document.querySelector('.cindy-send button')`);await wait(500);
  const review=await read(`(()=>{const d=document.querySelector('.cindy-confirm[open]');return d?{domain:d.querySelector('p').textContent,formatNote:!!d.querySelector('[data-format-note]'),raw:d.querySelector('[data-raw-request] pre').textContent.includes('"role": "system"')}:null;})()`);
  step('review',review||{});assert.ok(review&&review.formatNote&&review.raw&&review.domain.includes('api.deepseek.com'));
  fs.writeFileSync(path.join(out,'e2e-review.png'),(await win.webContents.capturePage()).toPNG());
  const t0=Date.now();await click(`document.querySelector('.cindy-confirm[open] button')`);
  let status='';for(let i=0;i<180;i++){await wait(500);status=await read(`(()=>{const m=document.querySelectorAll('[role=log] .cindy-message.assistant');return JSON.stringify({replies:m.length,notice:Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join(' | '),busy:!!document.querySelector('.cindy-send button[aria-label]')&&mcAgent!==undefined})})()`);const s=JSON.parse(status);if(s.replies>0||/限流|密钥|没有及时|连不上|出了问题|请求失败/.test(s.notice))break;}
  const reply=await read(`(()=>{const m=Array.from(document.querySelectorAll('[role=log] .cindy-message.assistant')).at(-1);return{text:m?m.textContent:'',button:!!document.querySelector('[data-review-proposal]'),noProposal:!!document.querySelector('[data-no-proposal]'),notice:Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join(' | ')};})()`);
  step('reply',{ms:Date.now()-t0,...reply});fs.writeFileSync(path.join(out,'e2e-reply.png'),(await win.webContents.capturePage()).toPNG());
  if(/限流|没有及时|连不上|出了问题/.test(reply.notice)&&!reply.text){result.skipped='provider unavailable: '+reply.notice;throw Object.assign(new Error('SKIP'),{skip:true});}
  assert.ok(reply.button,'usable proposal button; reply: '+reply.text.slice(0,200));
  const before=await read('JSON.stringify(project.clips.map(c=>[c.id,c.start,c.duration]))');
  await click(`document.querySelector('[data-review-proposal]')`);await wait(500);
  const dlg=await read(`(()=>{const d=document.querySelector('dialog.sentence-dialog[open], dialog[open] form [data-apply]')?.closest('dialog');return d?{ranges:d.querySelector('[data-ranges]').value}:null;})()`);
  step('proposal-dialog',dlg||{});assert.ok(dlg,'sentence dialog opened');
  await click(`document.querySelector('dialog[open] [data-apply]')`);await wait(600);
  const after=await read('JSON.stringify(project.clips.map(c=>[c.id,c.start,c.duration]))');
  step('applied',{changed:after!==before,clips:JSON.parse(after).length});assert.notEqual(after,before);
  fs.writeFileSync(path.join(out,'e2e-applied.png'),(await win.webContents.capturePage()).toPNG());
  await read('undo();true');await wait(300);
  const undone=await read('JSON.stringify(project.clips.map(c=>[c.id,c.start,c.duration]))');
  step('undone',{restored:undone===before});assert.equal(undone,before);
  result.passed=true;
 }catch(e){if(!e.skip){result.failed=String(e.message||e).split(KEY).join('<key>');}}
 finally{fs.writeFileSync(path.join(out,'e2e-result.json'),JSON.stringify(result,null,1).split(KEY).join('<key>')+'\n');log('E2E_DONE',{passed:!!result.passed,skipped:result.skipped||null,failed:result.failed||null});setTimeout(()=>app.exit(0),300);}
};
require('../desktop/main');
