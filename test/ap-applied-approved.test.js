'use strict';
// QQ (2026-11-04, seen in the Meta hackathon recording): after the streamer said yes in the approval box, the toast read
// 「已按 AI 的建议改好，没有问你（手动模式）」 — but it had just asked. Asked → own.ap-applied-approved; run by the mode without
// asking (自动 / Yolo) → own.ap-applied, as before. onAgentReply itself runs here, from app.js, with stand-ins around it.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const View=require('../ui-preferences');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function fn(name){const s=src.indexOf('async function '+name+'(');a.ok(s>=0,name);return src.slice(s,src.indexOf('\n}',s)+2);}

async function reply(action,mode){
 const toasts=[],asked=[],commits=[];
 const ctx={
  window:{montclipAgentPolicy:{decide:async()=>({ok:true,mode,action,ticket:'t1'}),answer:async()=>({ok:true,run:true})}},
  MontClipConversation:{parseProposal:()=>({type:'keep_sentences',ranges:[]}),proposalSummary:()=>({count:2})},
  MontClipPolicy:{MODES:['plan','manual','auto','yolo'],modeLabel:(m,l)=>View.t(l,'officialPane_mode'+m[0].toUpperCase()+m.slice(1))||m},
  MontClipPlan:{stepDetail:()=>''},MontClipProposal:{current:()=>true},MontClipRangePlan:{create:()=>({})},
  agentPolicy:{mode},paintAgentMode(){},runtime:{projectId:'p'},project:{revision:3},
  agentProposalStep:()=>({proposal:{type:'keep_sentences',keep:[{from:0,to:3}]},ev:null,c:{projectId:'p',sequenceId:'main',gen:1},version:null}),
  askAgentApproval:async()=>{asked.push(1);return 'once';},agentProposalText:()=>'',moveEvent(){},
  projectJSON:()=>({}),agentProjectContext:()=>({projectId:'p',sequenceId:'main',gen:1}),rangeEditBusy:()=>false,
  commitRangePlan:()=>{commits.push(1);return 'tok';},officialProposalApplications:new Map(),
  toast:(t)=>toasts.push(t),toastAction:(t)=>toasts.push(t),uiText:(k,v)=>View.t('zh-CN',k,v),
  mcView:{get:()=>({language:'zh-CN'})},mcAgent:{render(){}},canUndoOfficialProposal:()=>true,undoEvent:()=>({ok:true}),undo(){},
  toastText:null
 };
 vm.createContext(ctx);vm.runInContext(fn('onAgentReply'),ctx);
 await ctx.onAgentReply({text:'{}',references:[],sessionId:'s',context:{revision:3}});
 return {toasts,asked:asked.length,commits:commits.length};
}

test('手动: asked and approved → the toast says it was done as approved, never 「没有问你」',async()=>{
 const r=await reply('ask','manual');
 a.equal(r.asked,1);a.equal(r.commits,1);
 a.deepEqual(r.toasts,['已按你批准的改好。可以撤销。']);
 a.ok(!r.toasts.join('').includes('没有问你'));
});
test('自动 / Yolo: run without asking → the toast keeps its words (「没有问你（自动模式）」)',async()=>{
 for(const mode of ['auto','yolo']){
  const r=await reply('run',mode);
  a.equal(r.asked,0);a.equal(r.commits,1);
  a.equal(r.toasts.length,1);a.match(r.toasts[0],/^已按 AI 的建议改好，没有问你（.+模式）。可以撤销。$/);
 }
});
test('自动 asks too for what cannot be undone: asked there → the approved words as well',async()=>{
 const r=await reply('ask','auto');a.deepEqual(r.toasts,['已按你批准的改好。可以撤销。']);
});
test('the new words, both languages (JJ words them finally)',()=>{
 a.equal(View.t('zh-CN','own.ap-applied-approved'),'已按你批准的改好。可以撤销。');
 a.equal(View.t('en','own.ap-applied-approved'),'Done as you approved. Undo is available.');
 a.match(View.t('en','own.ap-applied',{mode:'Auto'}),/without asking \(Auto mode\)/,'the old line is unchanged');
});
