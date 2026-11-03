'use strict';
// Deja (2026-11-03): the plan's 「找歌 / 找高光 / 导出」 steps run in the page. These check the wiring in app.js by its source;
// desktop/plan-steps-smoke.cjs runs 「把我唱歌的部分一首一个切片剪出来」 end to end in a hidden window.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js'),html=read('index.html');
const fn=(name)=>{const i=app.indexOf(name);a.ok(i>=0,name);return app.slice(i,app.indexOf('\n}\n',i)+2);};

test('plan-steps.js loads after agent-plan.js and auto-slices.js',()=>{
 const at=f=>html.indexOf(`<script src="${f}"></script>`);
 a.ok(at('plan-steps.js')>at('agent-plan.js')&&at('agent-plan.js')>0);
 a.ok(at('plan-steps.js')>at('auto-slices.js')&&at('auto-slices.js')>0);
});
test('a step runs only if plan-steps.js can do it, after the main process decided it with its args',()=>{
 const run=fn('async function runAgentPlanStep(');
 a.match(run,/montclipAgentPolicy\.decide\(\{[^}]*capability:s\.capability,args:s\.args/);
 a.match(run,/MontClipPlanSteps\.DOABLE\.includes\(s\.capability\)\)return \{ok:false,code:'NO_EXECUTOR'\}/);
 a.match(run,/MontClipPlanSteps\.resolve\(s\.args,entry\.outputs,s\.index\+1\)/);
 a.ok(run.indexOf('decide(')<run.indexOf('DOABLE')&&run.indexOf('DOABLE')<run.indexOf('resolve('),'decide, then whether it can, then the references');
 // a find or the export asks like any step (the box), and a refusal stops the plan
 a.match(run,/if\(!await ask\(\)\)return \{halt:'DENIED'\}/);
});
test('finding changes nothing in the project: its ranges are kept for a later {"$step": n}',()=>{
 const run=fn('async function runAgentPlanStep(');
 a.match(run,/entry\.outputs\[s\.index\]=\{ranges\}/);
 // a find or the export is an event of the plan's run, in the log's own shape (agent-events.js refuses any other key)
 const Ev=require('../agent-events'),m=/ev=recordAgentEvent\(\{\.\.\.(\w+),capability:s\.capability,args:null,risk:d\.risk,state:'running',revisionBefore:project\.revision\?\?null,revisionAfter:null\}\)/.exec(run);
 a.ok(m,'the event');
 const meta={id:'e1',runId:'r1',step:1,actor:'ai',at:new Date().toISOString(),revision:3};
 const base=m[1]==='meta'?meta:(({revision,...rest})=>rest)(meta);
 a.match(run,new RegExp('const \\{revision:_r,\\.\\.\\.'+m[1]+'\\}=meta'),'the step’s revision is not an event key');
 a.doesNotThrow(()=>Ev.createLog().append({...base,capability:'find_songs',args:null,risk:'read',state:'running',revisionBefore:3,revisionAfter:null}));
 for(const f of ['async function planFindSongs(','async function planFindHighlights(']){
  const body=fn(f);
  a.ok(!/commitRangePlan|scheduleSave|project\.clips\s*=|pushUndo/.test(body),f+' does not edit');
 }
 // names: the auto-slices dialog's, so 「第 n 首歌」 waits for Deja's gate on songs.js
 a.match(app,/const planPartName=\(kind\)=>\(n,r\)=>\{const t=MontClipAutoSlices\.title\(/);
});
test('export: the plan’s own clips (else the whole timeline), each saved through the system’s Save window only',()=>{
 const ex=fn('async function planExport(');
 a.match(ex,/saveDownload\(q\.src,.*\{exportFile:true\}\)/);
 a.ok(!/setSavePath|writeFile|\/api\/export\/request/.test(ex),'no path of its own');
 a.match(ex,/entry\.queued\.has\(q\.id\)/);
 // the streamer's own waiting items are held back, then put back
 a.match(ex,/q\.status='held'/);a.match(ex,/if\(q\.status==='held'\)q\.status='pending'/);
 a.match(ex,/return saved\?\{ok:true\}:\{halt:'SAVE_CANCELLED'\}/);
});
test('one clip per range inside a plan: applied as one undo step and queued for the export step, not exported',()=>{
 const run=fn('async function runAgentPlanStep(');
 a.match(run,/queueSlices\(plan\.segments,[^;]*\{open:false\}\);\s*for\(const q of exportQueue\)if\(!before\.has\(q\.id\)\)entry\.queued\.add\(q\.id\)/);
 a.ok(!/runQueue\(/.test(run),'the edit step does not render');
});
test('what a stopped find or export says, in both languages (new, for JJ)',()=>{
 const P=require('../ui-preferences');
 for(const k of ['pl-empty','pl-nothing-found','pl-find-failed','pl-export-failed','pl-save-cancelled']){
  const zh=P.t('zh-CN','own.'+k),en=P.t('en','own.'+k);
  a.ok(zh&&zh!=='own.'+k&&/[一-鿿]/.test(zh),k+' zh');a.ok(en&&en!=='own.'+k&&!/[一-鿿]/.test(en),k+' en');
  a.ok(app.includes(`'own.${k}'`),k+' used');
 }
});
