'use strict';
// JJ via Deja (2026-11-05): 「剪到 1 分钟以内，发快手和 B 站竖屏」 gave 「保留 1 段」, and 〔应用〕 changed nothing and made
// nothing vertical. Two rules: (1) a proposal that would change nothing gets no button — decided by the host from the
// numbers (chat-proposal.js unchanged); (2) what the assistant can't do is said first — the format note asks the model,
// and, because an edit reply is JSON only, the pane puts the host's own sentence above the reply whenever the message
// asks for a vertical picture (agent-limits.js), decided from the message's words. Substitute transport, no network.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const P=require('../chat-proposal'),L=require('../agent-limits'),F=require('../agent-format'),V=require('../agent-conversation');
const S=require('../desktop/agent-service'),View=require('../ui-preferences'),Cap=require('../capabilities');

const ctx={projectId:'p',sequenceId:'main',generation:0,revision:1};
const doc=(clips)=>({fps:30,media:[{id:'m',kind:'video',duration:600}],clips:clips||[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:100,duration:50,props:{}}]});
const ranges=(r,mode='one_file',d=doc())=>P.prepare({type:'keep_ranges',output_mode:mode,ranges:r.map(([from,to])=>({clipId:'c',from,to}))},{doc:d,context:ctx});

test('a proposal that keeps the whole timeline, in order and without a gap, changes nothing: unchanged',()=>{
 // a 50 s edit (source 100–150): 「剪到 1 分钟以内」 → 「保留 1 段」 = all of it
 a.equal(ranges([[100,150]]).unchanged,true);
 a.equal(ranges([[100,120],[120,150]]).unchanged,true,'two pieces back to back play the same');
 a.equal(ranges([[100,149.99]]).unchanged,true,'within the boundary tolerance (half a frame)');
 a.equal(ranges([[100,140]]).unchanged,false,'10 s shorter: a change');
 a.equal(ranges([[110,150]]).unchanged,false,'the start cut: a change');
 a.equal(ranges([[120,150],[100,120]]).unchanged,false,'reordered: a change');
 a.equal(ranges([[100,120],[121,150]]).unchanged,false,'a second cut out: a change');
 a.equal(ranges([[100,150]],'per_range').unchanged,false,'per_range adds a file to the export queue: never unchanged');
 // a timeline that starts with a gap: keeping the clip closes the gap, so it changes
 const gap=doc([{id:'c',kind:'video',mediaId:'m',track:'V1',start:5,in:100,duration:50,props:{}}]);
 a.equal(ranges([[100,150]],'one_file',gap).unchanged,false);
});

test('keep_sentences that keep every sentence of a fully captioned edit are unchanged too',()=>{
 const d=doc([{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:6,props:{}},
  {id:'s1',kind:'text',track:'V2',start:0,in:0,duration:3,props:{text:'一',caption:true}},{id:'s2',kind:'text',track:'V2',start:3,in:0,duration:3,props:{text:'二',caption:true}}]);
 const refs=[{type:'caption',clipId:'s1',sourceCaptionId:'s1',start:0,end:3,text:'一'},{type:'caption',clipId:'s2',sourceCaptionId:'s2',start:3,end:6,text:'二'}];
 const r=(ids)=>P.prepare({type:'keep_sentences',ranges:ids.map(i=>({clipId:refs[i].clipId,sourceCaptionId:refs[i].sourceCaptionId,from:refs[i].start,to:refs[i].end}))},{doc:d,context:ctx,references:refs});
 a.equal(r([0,1]).unchanged,true);a.equal(r([1]).unchanged,false);a.equal(r([1,0]).unchanged,false);
});

test('the pane shows no 〔查看剪辑建议〕 for an unchanged proposal and says so; the host never applies one',()=>{
 const pane=read('agent-ui/pane.tsx'),app=read('app.js');
 a.match(pane,/const unchanged=usable\?options\.noChange\?\.\(result\)\|\|null:null;/);
 a.match(pane,/\{usable&&unchanged&&<p data-no-change>\{t\.noChange\.replace\('\{duration\}',MontClipConversation\.durationText\(unchanged\.duration\)\)\}<\/p>\}\{usable&&!unchanged&&<button data-review-proposal /);
 a.match(read('cindy-official.js'),/data-no-change/,'the bundle was rebuilt');
 a.match(app,/ noChange:agentProposalUnchanged,/);
 a.match(app,/return p\.unchanged\?\{duration:p\.duration\}:null;/);
 // in every mode (Auto, Yolo too): checked before the host is even asked
 const reply=app.slice(app.indexOf('async function onAgentReply'));
 a.ok(reply.indexOf('if(agentProposalUnchanged(result))return;')>0&&reply.indexOf('if(agentProposalUnchanged(result))return;')<reply.indexOf('montclipAgentPolicy.decide'));
 a.equal(View.text['zh-CN'].officialPane_noChange.replace('{duration}','00:50'),'按这个建议剪，时间线和现在完全一样（现在一共 00:50），不用应用。');
 a.equal(View.text.en.officialPane_noChange.replace('{duration}','00:50'),'This suggestion would leave the timeline exactly as it is (it is 00:50 now), so there is nothing to apply.');
});

// since the assistant's own reframe (test/agent-reframe.test.js) a vertical picture is something it can do: the words are
// still recognised, and reported as missing only for an assistant without it
test('a vertical picture is recognised from the words; reported as missing only without the assistant\'s reframe',()=>{
 a.ok(Cap.get('fablecut_reframe'),'MCP has it');
 a.deepEqual([...L.ASSISTANT],['keep_sentences','keep_ranges','reframe']);
 const without=['keep_sentences','keep_ranges'];
 for(const t of ['剪到 1 分钟以内，发快手和 B 站竖屏','改成竖版视频','做个 9:16 的','9：16','画面比例改成 1:1','make it vertical','Reframe for Shorts','portrait please','change the aspect ratio'])
  {a.deepEqual(L.unsupported(t,without).map(u=>u.id),['reframe'],t);a.deepEqual(L.unsupported(t),[],t);}
 for(const t of ['剪到 1 分钟以内','把 1:15 到 2:30 留下','保留 0:16 之后的','keep the first 30 seconds','把她开口唱之前的安静部分剪掉'])
  a.deepEqual(L.unsupported(t,without),[],t);
});

test('a mixed message, with a substitute transport: the format note sent carries the rule, and the reply as shown starts with what can\'t be done',async()=>{
 const without=['keep_sentences','keep_ranges'],draft='剪到 1 分钟以内，发快手和 B 站竖屏',edit={type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'c',from:100,to:150}]};
 // the desktop service with an injected request: what would go to the provider
 let sent=null;
 const service=S.createService({read:()=>JSON.stringify({version:1,provider:'openrouter',model:'m',secret:'sealed'}),write(){},seal:k=>k,unseal:()=>'k',providers:S.ALL_PROVIDERS,
  request:async(cfg,p)=>{sent=p;return {text:JSON.stringify(edit)};}});
 const state={current:()=>({id:'1',draft,messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),service,id:()=>'r1'});
 conv.prepare();a.equal((await conv.confirm()).ok,true);
 const system=sent.messages[0];
 a.equal(system.role,'system');
 // the rule now names what is still missing (publishing); the vertical copy has its own reply (test/agent-reframe.test.js)
 a.ok(system.content.includes('When a message also asks for something you cannot do and you answer in words, your first sentence says plainly what you cannot do, for example 「发到快手和 B 站这一步我做不了。」'));
 a.ok(system.content.includes('When one message asks both to cut and for another shape, reply with the cut first; the user asks for the shape after it.'));
 a.ok(system.content.includes('Do not propose an edit that would change nothing'));
 a.match(system.content,/Apart from these replies you cannot change anything: you cannot export, upload or publish\./);
 // the host's own first sentence: none now (the assistant can make the vertical copy); for an assistant without it, first
 a.deepEqual(L.shown(draft,conv.result().text,{limitReframe:'x'}),[conv.result().text]);
 for(const lang of ['zh-CN','en']){
  const strings=new Proxy({},{get:(_,k)=>View.text[lang]['officialPane_'+String(k)]});
  const shown=L.unsupported(draft,without).length?[View.text[lang].officialPane_limitReframe,conv.result().text]:[conv.result().text];
  a.equal(shown.length,2);a.equal(shown[0],View.text[lang].officialPane_limitReframe);a.equal(shown[1],conv.result().text);
 }
 a.equal(View.text['zh-CN'].officialPane_limitReframe,'改竖屏（改画面比例）这一步，助手现在做不了。可以手动改：在播放器上方的导出画面下拉框里选 9:16，再导出。');
 a.ok(View.text['zh-CN'].officialPane_limitReframe.startsWith('改竖屏'),'its first sentence is what can\'t be done');
 a.ok(!/我/.test(View.text['zh-CN'].officialPane_limitReframe)&&!/我/.test(View.text['zh-CN'].officialPane_noChange),'fixed words: no 我');
 a.deepEqual(L.shown('剪到 1 分钟以内',conv.result().text,{}),[conv.result().text],'nothing missing: the reply alone');
 // the pane shows it first in the assistant's message, from the user message before it
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/const limit=m\.role==='assistant'\?W\.MontClipLimits\?\.note\(MontClipAgentPane\.displayMessage\(session\.messages\[i-1\]\?\.text\|\|''\)\.text,t\):'';/);
 a.match(pane,/<strong>\{m\.role==='user'\?t\.user:t\.assistant\}<\/strong>\{limit&&<p data-host-limit>\{limit\}<\/p>\}<ThinkingText content=\{shown\.text\}\/>/);
 a.match(read('cindy-official.js'),/data-host-limit/);
 a.match(read('index.html'),/<script src="agent-limits\.js"><\/script>/);
});

test('the names in the manual way are the ones on screen: the export-frame drop-down above the player and its option',()=>{
 const app=read('app.js'),html=read('index.html');
 a.match(app,/const EXPORT_FRAME_ASPECTS = \[\n  \{ label: "Full canvas", w: 0, h: 0 \},\n  \{ label: "9:16 Reel", w: 9, h: 16 \},/);
 a.match(html,/<select data-more-rank="6" id="exportFrameSel"/);
 // the host's sentence (kept for JJ to settle; shown only for an assistant without reframe) names them
 a.ok(View.text.en.officialPane_limitReframe.includes('“Full canvas”')&&View.text.en.officialPane_limitReframe.includes('“9:16 Reel”'));
 a.ok(View.text['zh-CN'].officialPane_limitReframe.includes('在播放器上方的导出画面下拉框里选 9:16，再导出'));
});
