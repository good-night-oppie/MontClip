'use strict';
// P4, second half: how the plan list is wired. Behaviour: test/agent-plan.test.js and desktop/agent-plan-smoke.cjs (a mock
// model in the real page).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences'),F=require('../agent-format');

test('the format note tells the model the plan shape: steps of the two edits, at most 30, no example numbers',()=>{
 a.match(F.FORMAT_NOTE,/\{"type":"plan","steps":\[\{"capability":"<keep_sentences or keep_ranges>","args":/);
 a.match(F.FORMAT_NOTE,/At most 30 steps/);
 a.ok(!/"from"\s*:\s*\d|"to"\s*:\s*\d/.test(F.FORMAT_NOTE));
});

test('every step goes through the host’s decision and its own check when its turn comes; one run, undone at once',()=>{
 const app=read('app.js'),i=app.indexOf('async function runAgentPlanStep'),body=app.slice(i,app.indexOf('function canUndoOfficialProposal',i));
 a.ok(body.indexOf('montclipAgentPolicy.decide(')<body.indexOf('MontClipProposal.prepare('),'decided first');
 a.match(body,/runId:entry\.runId,step:s\.index\+1/,'each step an event of the plan’s run');
 a.match(body,/MontClipProposal\.current\(proposal,projectJSON\(\),/,'the CAS before applying');
 a.ok(body.indexOf("outputMode==='per_range'")<body.indexOf('commitRangePlan('),'slices through the dialog');
 a.match(body,/if\(s\.capability!=='keep_sentences'&&s\.capability!=='keep_ranges'\)return \{ok:false,code:'NO_EXECUTOR'\};/);
 a.match(body,/await versionBeforeAgent\(\);/,'the agent version before the first step');
 a.match(body,/const r=undoRun\(entry\.runId\);/);
 // the plan starts only on the streamer's 〔开始〕, never on its own
 a.equal((app.match(/runAgentPlan\(/g)||[]).length,1,'defined once; started from the pane option only');
 a.match(app,/planStart:runAgentPlan/);
});

test('the list shows the plain sentence and the state in words; deleting only before it starts',()=>{
 const app=read('app.js'),pane=read('agent-ui/pane.tsx');
 a.match(app,/label:MontClipPlan\.stepLabel\(s,lang\),state:s\.state,stateText:MontClipPlan\.stateLabel\(s\.state,lang\)/);
 a.match(pane,/<span data-step-label>\{st\.label\}<\/span>/);
 a.match(pane,/\{plan\.status==='ready'&&<button data-step-remove/);
 a.match(read('cindy-official.js'),/data-plan/,'the bundle was rebuilt');
});

test('the page reads the tool list from the main process before capabilities.js, read-only',()=>{
 const html=read('index.html'),page=read('capabilities-page.js');
 a.ok(html.indexOf('capabilities-page.js')<html.indexOf('"capabilities.js"'));
 a.ok(html.indexOf('"capabilities.js"')<html.indexOf('agent-plan.js'));
 a.match(page,/window\.montclipCapabilities\.get\(\)/);
 a.ok(!/risk/.test(page.replace(/\/\*[\s\S]*?\*\//,'')),'risks are not taken from it');
});

test('new words, both languages (for JJ)',()=>{
 for(const k of ['pl-step-of','pl-denied','pl-listed','pl-refused','pl-no-executor','pl-busy','pl-cancelled','pl-stale','pl-plan-mode','pl-discarded','pl-done','pl-stopped','pl-stale-plan','pl-undone','pl-undo-interleaved','pl-undo-none']){
  const zh=View.t('zh-CN','own.'+k),en=View.t('en','own.'+k);a.ok(zh&&zh!=='own.'+k,k);a.ok(en&&!/[一-鿿]/.test(en),k);
 }
 for(const k of ['planTitle','planSummary','planInvalid','planRemove','planStart','planDiscard','planUndo'])for(const l of ['zh-CN','en'])a.ok(View.text[l]['officialPane_'+k],l+' '+k);
 a.deepEqual(['planStart','planDiscard','planUndo','planRemove'].map(k=>View.text['zh-CN']['officialPane_'+k]),['开始','不要这个计划','撤销整个计划','删掉']);
});

test('JJ’s final words (5d360cd7); the help’s body has no internal names, the plan JSON is in the small print',()=>{
 const zh=k=>View.text['zh-CN']['officialPane_'+k],en=k=>View.text.en['officialPane_'+k];
 const Plan=require('../agent-plan');
 a.equal(Plan.stateLabel('failed','zh-CN'),'没做成');a.equal(Plan.stateLabel('failed','en'),'Not done');
 a.equal(View.t('zh-CN','own.pl-refused'),'这一步任何时候都不允许做。');
 a.equal(View.t('zh-CN','own.pl-stopped'),'计划停在了这一步，后面的步骤没有做。可以让助手按现在的项目重新排一次计划。');
 a.equal(View.t('zh-CN','own.pl-busy'),'软件正在忙别的事。等它做完，再让助手重新排一次。');
 a.equal(zh('planDiscard'),'不要这个计划');a.equal(en('planDiscard'),'Drop this plan');
 a.equal(zh('formatPlan'),'想让 AI 一次做好几步，可以让它先排一个计划：它会列出每一步，你看一遍、删掉不要的，再点「开始」。每一步还是按你选的模式来问你。');
 a.equal(zh('formatPlanTech'),'以下是给 AI 的格式说明，不用看。');
 for(const l of ['zh-CN','en']){const body=View.formatBody(l);a.ok(body.endsWith(View.text[l].officialPane_formatPlan),l);a.ok(!/keep_sentences|keep_ranges|fablecut_/.test(body),l+': no internal names in the body');}
 const F=require('../agent-format');
 for(const line of F.PLAN_LINES)a.ok(F.FORMAT_NOTE.includes(line),'the small print is the note’s own lines');
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/<p className="dim" data-format-plan-tech>\{t\.formatPlanTech\}<\/p><pre className="dim" data-format-plan>\{MontClipFormat\.PLAN_LINES\.join\('\\n'\)\}<\/pre><\/details>/);
 a.ok(pane.indexOf('data-format-body')<pane.indexOf('data-format-plan'),'after the body, in the small print');
});
