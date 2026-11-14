'use strict';
// 设置 › AI 助手 › 用 AI 助手 (Deja and JJ, 2026-11-04): off, the main process refuses every request to the AI — the
// assistant's sends, its plans and suggestions alike — and Yolo's external steps are off too. Before she has read the
// 「AI 数据说明」, nothing goes to DeepSeek either.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Switch=require('../desktop/agent-switch');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'mc-switch-'));

test('the switch: on until switched off, kept across launches, a boolean only',()=>{
 const dir=tmp(),s=Switch.createStore(dir);
 a.deepEqual(s.get(),{ok:true,enabled:true});
 for(const v of ['false',0,null,undefined,{}])a.equal(s.set(v).code,'SWITCH_INVALID');
 a.equal(s.get().enabled,true,'a refused value changes nothing');
 a.deepEqual(s.set(false),{ok:true,enabled:false});
 a.equal(Switch.createStore(dir).get().enabled,false,'a new launch reads it');
 a.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,Switch.NAME),'utf8')),{version:1,enabled:false},'the file holds the switch and nothing else');
 a.equal(s.set(true).enabled,true);
});

test('an unreadable or odd file reads as on (the default), never as a crash',()=>{
 for(const body of ['{','[]','{"version":2,"enabled":false}','{"version":1,"enabled":"no"}','{"version":1,"enabled":false,"x":1}']){
  const dir=tmp();fs.writeFileSync(path.join(dir,Switch.NAME),body);a.equal(Switch.createStore(dir).get().enabled,true,body);}
});

test('a failed write says so and reports what is kept',()=>{
 const dir=tmp(),s=Switch.createStore(dir,{...fs,renameSync(){throw Error('EPERM');}});
 const r=s.set(false);a.equal(r.code,'SWITCH_WRITE_FAILED');a.equal(r.enabled,true);
 a.deepEqual(fs.readdirSync(dir),[],'no temporary file left');
});

test('the main process: off, every send is refused before the service; DeepSeek before the notice is read, too',()=>{
 const main=fs.readFileSync(path.join(__dirname,'..','desktop','main.js'),'utf8');
 const loop=main.slice(main.indexOf("for(const operation of ['get','configure','reset','deleteConnection','send','cancel'])"));
 const body=loop.slice(0,loop.indexOf('return agentService[operation](value);'));
 a.ok(body.includes("if(operation==='send'){if(!agentSwitch.get().enabled)return {ok:false,code:'AI_OFF'};if(agentService.get().provider==='deepseek'&&!dataNotice.get().accepted)return {ok:false,code:'NOTICE_REQUIRED'};}"),
  'the gate sits between the guard and the service');
 a.ok(main.indexOf("const agentSwitch = require('./agent-switch').createStore(app.getPath('userData'));")<main.indexOf("for(const operation of ['get','configure'"),'the switch is read here, in the main process');
 a.ok(main.includes("external: () => ({ enabled: agentSwitch.get().enabled === true && agentService.get().configured === true,"),'Yolo: no external step while off');
 // the only way out to the AI is montclip:agent:send: no other call into the service's send
 a.equal((main.match(/agentService\.send|agentService\[/g)||[]).length,1);
 a.ok(main.includes("ipcMain.handle('montclip:agent:switchGet', (event) => settingsAllowed(event, win, origin) ? agentSwitch.get() :"),'switchGet is guarded');
 a.ok(main.includes("ipcMain.handle('montclip:agent:switchSet', (event, enabled) => settingsAllowed(event, win, origin) ? agentSwitch.set(enabled) :"),'switchSet is guarded');
});

test('the pane: switched off, no review box and a line that says so; the settings section and its notice button',()=>{
 const pane=fs.readFileSync(path.join(__dirname,'..','agent-ui','pane.tsx'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','app/index.html'),'utf8'),app=fs.readFileSync(path.join(__dirname,'..','app/app.js'),'utf8');
 a.ok(pane.indexOf("if(sw&&!sw.enabled){setNotice('aiOff');return;}")<pane.indexOf('setReview(conversation.prepare())'),'off: the review box is not even prepared');
 a.ok(pane.includes('{!aiOn&&<p className="agent-ai-off" data-ai-off>{t.aiOff}</p>}'));
 a.match(html,/<div class="settings-section hidden" id="setAi">[\s\S]*?id="setAiEnabled"[\s\S]*?data-i18n="own\.ai-set-enabled"[\s\S]*?id="btnAiNotice"[^>]*data-i18n="own\.ai-set-notice"/);
 a.ok(app.includes('const r=await svc.switchSet(box2.checked);box2.checked=r?.enabled!==false;mcAgent.refreshSwitch?.();'),'the box shows what the main process kept');
 a.ok(app.includes('if(!box2.checked&&!$("mcAssistantPanel").classList.contains("hidden"))setSideTab("inspector");'),'off: the panel folds away (Deja)');
 a.ok(pane.includes("if(sw?.enabled===false||!m?.configured||m.provider!=='deepseek')return;"),'off: the notice is not shown on opening');
 a.ok(app.includes('$("btnAiNotice").addEventListener("click",()=>{$("btnCloseSettings")?.click();setSideTab("assistant");mcAgent.render();void mcAgent.showNotice();});'));
 const review=pane.slice(pane.indexOf('<dialog ref={dialog}'),pane.indexOf('</dialog>',pane.indexOf('<dialog ref={dialog}')));
 a.ok(review.includes('<a href="#" className="cindy-link" data-notice-link onClick={e=>{e.preventDefault();void showNotice();}}>{t.noticeLink}</a>'),'the review box links to the notice');
 a.ok(review.indexOf('data-notice-link')<review.indexOf('<button onClick={confirm}>'),'a link, not a button: 〔发送〕 stays the first button');
 a.ok(pane.includes('<div className="agent-toolbar"><span className="cindy-ai-label" data-ai-generated>{t.aiGenerated}</span>{plan.status'),'the plan is marked 「AI 生成」');
});
