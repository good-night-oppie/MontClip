'use strict';
// QQ (2026-11-04, seen in the Meta hackathon recording): after the streamer said yes in the approval box, the toast read
// 「已按 AI 的建议改好，没有问你（手动模式）」 — but it had just asked. JJ's words (2026-11-04), one toast for each reason a
// step ran: (1) approved in the box just now; (2) allowed earlier for this chat 「这个聊天中都批准」, not asked again;
// (3) run by 自动 / Yolo without asking (the old line). onAgentReply itself runs here, from app.js, with stand-ins around
// it; the reason comes from the real policy host (desktop/agent-policy-host.js).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const View=require('../shared/ui-preferences'),{createPolicyHost}=require('../desktop/agent-policy-host');
const src=fs.readFileSync(path.join(__dirname,'..','app/app.js'),'utf8');
function fn(name){const s=src.indexOf('async function '+name+'(');a.ok(s>=0,name);return src.slice(s,src.indexOf('\n}',s)+2);}

const APPROVED={zh:'已按你批准的改好。可以撤销。',en:'Done as you approved. Undo is available.'};
const ALLOWED={zh:'已按 AI 的建议改好。你在这个聊天中批准过这类修改，所以没再问你。可以撤销。',en:'Done as the AI suggested. You allowed this kind of change for this chat, so you weren\'t asked again. Undo is available.'};

/** One AI reply through onAgentReply, the decision from the real host in `mode`; the box answers `choice`. */
async function reply(host,{mode,choice='once',language='zh-CN'}){
 const toasts=[],asked=[],commits=[];
 const ctx={
  window:{montclipAgentPolicy:{decide:async(v)=>host.decide(v),answer:async(v)=>host.answer({...v,choice})}},
  MontClipConversation:{parseProposal:()=>({type:'keep_sentences',ranges:[]}),proposalSummary:()=>({count:2})},
  MontClipPolicy:{MODES:['plan','manual','auto','yolo'],modeLabel:require('../shared/agent-policy').modeLabel},
  MontClipPlan:{stepDetail:()=>''},MontClipProposal:{current:()=>true},MontClipRangePlan:{create:()=>({})},
  agentPolicy:{mode},paintAgentMode(){},runtime:{projectId:'p_1'},project:{revision:3},
  agentProposalUnchanged:()=>null,agentProposalStep:()=>({proposal:{type:'keep_sentences',keep:[{from:0,to:3}]},ev:null,c:{projectId:'p_1',sequenceId:'main',gen:1},version:null}),
  askAgentApproval:async()=>{asked.push(1);return choice;},agentProposalText:()=>'',moveEvent(){},
  projectJSON:()=>({}),agentProjectContext:()=>({projectId:'p_1',sequenceId:'main',gen:1}),rangeEditBusy:()=>false,
  commitRangePlan:()=>{commits.push(1);return 'tok';},officialProposalApplications:new Map(),
  toast:(t)=>toasts.push(t),toastAction:(t)=>toasts.push(t),uiText:(k,v)=>View.t(language,k,v),
  mcView:{get:()=>({language})},mcAgent:{render(){}},canUndoOfficialProposal:()=>true,undoEvent:()=>({ok:true}),undo(){}
 };
 vm.createContext(ctx);vm.runInContext(fn('onAgentReply'),ctx);
 await ctx.onAgentReply({text:'{}',references:[],sessionId:'chat_1',context:{revision:3}});
 return {toasts,asked:asked.length,commits:commits.length};
}
async function hostIn(mode){
 const h=createPolicyHost({confirmYolo:async()=>true,external:()=>({enabled:false,allowlist:[]}),language:()=>'zh-CN'});
 if(mode!=='manual')a.equal((await h.setMode(mode)).ok,true);
 return h;
}

test('1. 〔只批准这次〕 just now: 「已按你批准的改好。可以撤销。」',async()=>{
 for(const language of ['zh-CN','en']){
  const r=await reply(await hostIn('manual'),{mode:'manual',choice:'once',language});
  a.equal(r.asked,1);a.equal(r.commits,1);a.deepEqual(r.toasts,[language==='en'?APPROVED.en:APPROVED.zh]);
 }
 // 〔这个聊天中都批准〕 in the box this time is a yes just now too
 const r=await reply(await hostIn('manual'),{mode:'manual',choice:'session'});a.deepEqual(r.toasts,[APPROVED.zh]);
});

test('2. allowed earlier for this chat, not asked again: 「…你在这个聊天中批准过这类修改，所以没再问你。…」',async()=>{
 for(const language of ['zh-CN','en']){
  const h=await hostIn('manual');
  const first=await reply(h,{mode:'manual',choice:'session',language});a.equal(first.asked,1);
  const again=await reply(h,{mode:'manual',language});
  a.equal(again.asked,0,'not asked again');a.equal(again.commits,1);a.deepEqual(again.toasts,[language==='en'?ALLOWED.en:ALLOWED.zh]);
 }
});

test('3. run by 自动 / Yolo without asking: the old line, 「已按 AI 的建议改好，没有问你（{mode}模式）。可以撤销。」',async()=>{
 for(const [mode,name] of [['auto','自动'],['yolo','全自动']]){
  const r=await reply(await hostIn(mode),{mode});
  a.equal(r.asked,0);a.equal(r.commits,1);a.deepEqual(r.toasts,['已按 AI 的建议改好，没有问你（'+name+'模式）。可以撤销。']);
 }
 const en=await reply(await hostIn('auto'),{mode:'auto',language:'en'});
 a.deepEqual(en.toasts,['Done as the AI suggested, without asking (Auto mode). Undo is available.']);
});

test('the words, exactly as JJ wrote them; the policy says when a step ran because of an earlier approval',()=>{
 a.equal(View.t('zh-CN','own.ap-applied-approved'),APPROVED.zh);a.equal(View.t('en','own.ap-applied-approved'),APPROVED.en);
 a.equal(View.t('zh-CN','own.ap-applied-allowed'),ALLOWED.zh);a.equal(View.t('en','own.ap-applied-allowed'),ALLOWED.en);
 a.equal(View.t('zh-CN','own.ap-applied',{mode:'手动'}),'已按 AI 的建议改好，没有问你（手动模式）。可以撤销。','the old line is unchanged');
 const P=require('../shared/agent-policy'),cap='keep_sentences';
 a.equal(P.decide({mode:'manual',capability:cap,approved:true}).byApproval,true);
 a.equal(P.decide({mode:'auto',capability:cap}).byApproval,undefined,'自动 runs an undoable step by itself');
 a.equal(P.decide({mode:'yolo',capability:cap,approved:true}).byApproval,undefined,'Yolo runs it by itself');
});

// VV (2026-11-04): a new approval box came up while the last step's toast (with its 〔撤销〕) was still showing, one over
// the other. The box now takes the toast away first.
test('a new approval box takes the last toast away first',async()=>{
 const fnSync=(name)=>{const s=src.indexOf('function '+name+'(');a.ok(s>=0,name);return src.slice(s,src.indexOf('\n}',s)+2);};
 const classes=new Set(['show','has-action']),stopped=[],cleared=[];
 const ctx={els:{toast:{classList:{remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:(c)=>classes.has(c)}}},toastTimer:7,toastHold:{stop:()=>stopped.push(1)},clearTimeout:(t)=>cleared.push(t)};
 vm.createContext(ctx);vm.runInContext('var toastTimer=7;var toastHold={stop:()=>stopped.push(1)};'+fnSync('dismissToast'),Object.assign(ctx,{stopped}));
 ctx.dismissToast();
 a.equal(classes.size,0,'the toast is hidden, its button too');a.deepEqual(cleared,[7],'its timer stopped');a.equal(stopped.length,1,'its hold stopped');
 // since #120 the approval is a card in the message stream (agentApprovals.ask), no longer a box over the page
 const line=src.slice(src.indexOf('function askAgentApproval('),src.indexOf('\n',src.indexOf('function askAgentApproval(')));
 a.ok(line.indexOf('dismissToast();')>=0&&line.indexOf('dismissToast();')<line.indexOf('agentApprovals.ask('),'before the card is shown');
});
