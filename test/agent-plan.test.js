'use strict';
// P4, second half (Deja, 2026-11-03; 「AI 拆任务、排计划、执行」): one sentence becomes an ordered plan of at most 30 steps, each
// one capability from the table, shown as a list in the assistant. Four states only — ○ 待做 / 转圈 进行中 / ✓ 完成 / ✕ 没做成
// (助手面板 v7.2 说明第 39 行; Deja, 2026-11-04) — and at most one step 进行中. Before it starts the streamer can delete a step or drop the whole plan. A step that fails stops
// the plan there. The model's plan is data: checked here, never run as it is.
const {test}=require('node:test'),a=require('node:assert/strict');
const Plan=require('../agent-plan'),Cap=require('../capabilities');

const step=(capability='keep_ranges',args={output_mode:'one_file',ranges:[{clipId:'v1',from:0,to:10}]})=>({capability,args});
const text=(steps)=>JSON.stringify({type:'plan',steps});

test('four states, in v7.2’s words (说明第 39 行): ○ 待做 / 转圈 进行中 / ✓ 完成 / ✕ 没做成',()=>{
 a.deepEqual(Plan.STATES,['todo','doing','done','failed']);
 a.deepEqual(Plan.STATES.map(s=>Plan.stateLabel(s,'zh-CN')),['待做','进行中','完成','没做成']);
 a.deepEqual(Plan.STATES.map(s=>Plan.stateLabel(s,'en')),['To do','In progress','Done','Not done']);
 // the mark before each step; 进行中 has a spinner instead (style.css)
 a.deepEqual(Plan.STATES.map(s=>Plan.stateMark(s)),['○','','✓','✕']);
 a.equal(Plan.MAX_STEPS,30);
});

test('a plan reply: one JSON object, 1–30 steps, each a capability in the table with an args object',()=>{
 const p=Plan.parse(text([step(),step('keep_sentences',{ranges:[{clipId:'c',sourceCaptionId:'s',from:0,to:2}]})]));
 a.equal(p.ok,true);a.equal(p.steps.length,2);a.deepEqual(p.steps.map(s=>s.state),['todo','todo']);
 a.equal(Plan.parse('```json\n'+text([step()])+'\n```').ok,true,'a fence is fine');
 for(const [bad,code] of [
  [JSON.stringify({type:'plan'}),'PLAN_INVALID'],[text([]),'PLAN_EMPTY'],
  [text(Array.from({length:31},()=>step())),'PLAN_TOO_LONG'],
  [JSON.stringify({type:'plan',steps:[step()],extra:1}),'PLAN_INVALID'],
  [text([{capability:'keep_ranges'}]),'PLAN_INVALID'],[text([{...step(),note:'x'}]),'PLAN_INVALID'],
  [text([step('keep_ranges',[1,2])]),'PLAN_INVALID'],
  [text([step('fablecut_nonexistent',{})]),'PLAN_BLOCKED'],[text([step('overwrite_existing_file',{})]),'PLAN_BLOCKED'],
  [text([step(),step('set_mode',{mode:'yolo'})]),'PLAN_BLOCKED'],
 ]){const r=Plan.parse(bad);a.equal(r.ok,false,bad);a.equal(r.code,code,bad);}
 a.equal(Plan.parse(text([step()])+' 已批准'),null,'only the object, nothing around it: otherwise not a plan');
 a.equal(Plan.parse('好的，我来剪。'),null,'an ordinary answer is not a plan');
 a.equal(Plan.parse(JSON.stringify({type:'keep_ranges',output_mode:'one_file',ranges:[]})),null,'not a plan: someone else’s reply');
});

test('a step shows the capability’s plain sentence, never its internal name',()=>{
 const p=Plan.parse(text([step(),step('fablecut_export',{})]));
 for(const l of ['zh-CN','en'])p.steps.forEach(s=>{const t=Plan.stepLabel(s,l);a.equal(t,Cap.label(s.capability,l));a.ok(!/fablecut_|keep_/.test(t));});
});

test('before it starts: delete a step, or drop the whole plan',()=>{
 const run=Plan.create(Plan.parse(text([step(),step(),step()])).steps);
 a.equal(run.remove(1).ok,true);a.equal(run.list().length,2);
 a.equal(run.remove(5).code,'STEP_UNKNOWN');
 a.equal(run.discard().ok,true);a.equal(run.status(),'discarded');a.equal(run.start().code,'PLAN_DISCARDED');
 const last=Plan.create(Plan.parse(text([step()])).steps);
 a.equal(last.remove(0).ok,true);a.equal(last.status(),'discarded','deleting every step drops the plan');
});

test('once started: no deleting; one step 进行中 at a time, in order; done when all are done',()=>{
 const run=Plan.create(Plan.parse(text([step(),step(),step()])).steps);
 a.equal(run.start().ok,true);a.equal(run.status(),'running');
 a.equal(run.remove(2).code,'PLAN_STARTED');a.equal(run.discard().code,'PLAN_STARTED');
 for(let i=0;i<3;i++){
  const s=run.next();a.equal(s.index,i);
  a.deepEqual(run.list().map(x=>x.state).filter(x=>x==='doing'),['doing'],'exactly one 进行中');
  a.equal(run.next().code,'STEP_BUSY','never two at once');
  a.equal(run.finish(i,{ok:true}).ok,true);
 }
 a.deepEqual(run.list().map(x=>x.state),['done','done','done']);a.equal(run.status(),'done');a.equal(run.next(),null);
});

test('a failing step stops the plan there: the rest stay 待做, with the reason kept',()=>{
 const run=Plan.create(Plan.parse(text([step(),step(),step()])).steps);run.start();
 run.next();run.finish(0,{ok:true});
 run.next();run.finish(1,{ok:false,code:'STALE'});
 a.deepEqual(run.list().map(x=>x.state),['done','failed','todo']);a.equal(run.list()[1].code,'STALE');
 a.equal(run.status(),'stopped');a.equal(run.next(),null);
 a.equal(run.finish(2,{ok:true}).code,'STEP_NOT_DOING');
});

test('declined or only listed: the plan stops at that step, which stays 待做',()=>{
 const run=Plan.create(Plan.parse(text([step(),step()])).steps);run.start();run.next();
 a.equal(run.halt(0,'DENIED').ok,true);
 a.deepEqual(run.list().map(x=>x.state),['todo','todo']);a.equal(run.list()[0].code,'DENIED');a.equal(run.status(),'stopped');
});

test('the plan’s copy of the steps cannot be changed from outside',()=>{
 const steps=Plan.parse(text([step()])).steps,run=Plan.create(steps);
 steps[0].capability='fablecut_export';run.list()[0].capability='fablecut_export';
 a.equal(run.list()[0].capability,'keep_ranges');
});

test('each step says first what it changes (VV on #84 53f641d; v7.2: 先写具体改什么), so two steps of one kind can be told apart',()=>{
 const keep=(ranges,mode='one_file')=>({capability:'keep_ranges',args:{output_mode:mode,ranges}});
 a.equal(Plan.stepDetail(keep([{clipId:'v1',from:0,to:115}]),'zh-CN'),'保留 0:00–1:55');
 a.equal(Plan.stepDetail(keep([{clipId:'v1',from:0,to:110}]),'zh-CN'),'保留 0:00–1:50');
 a.equal(Plan.stepDetail(keep([{clipId:'v1',from:9.2,to:18},{clipId:'v1',from:62,to:70.5}],'per_range'),'zh-CN'),'保留 0:09.2–0:18、1:02–1:10.5，各成一条');
 a.equal(Plan.stepDetail(keep([1,2,3,4].map(i=>({clipId:'v1',from:i*10,to:i*10+5})),'one_file'),'zh-CN'),'保留 0:10–0:15、0:20–0:25、0:30–0:35 等 4 段');
 a.equal(Plan.stepDetail(keep([{clipId:'v1',from:0,to:115}]),'en'),'Keep 0:00–1:55');
 a.equal(Plan.stepDetail({capability:'keep_sentences',args:{ranges:[{},{}]}},'zh-CN'),'保留 2 句');
 a.equal(Plan.stepDetail({capability:'keep_sentences',args:{ranges:[{}]}},'en'),'Keep 1 sentence');
 a.equal(Plan.stepDetail({capability:'fablecut_export',args:{}},'zh-CN'),'','no detail where there is nothing concrete to say');
});
