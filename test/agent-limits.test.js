'use strict';
// JJ via Deja (2026-11-05): 「剪到 1 分钟以内，发快手和 B 站竖屏」 gave 「保留 1 段」, and 〔应用〕 changed nothing and made
// nothing vertical. Two rules: (1) a proposal that would change nothing gets no button — decided by the host from the
// numbers (chat-proposal.js unchanged); (2) what the assistant can't do is said first — the format note asks the model,
// and, because an edit reply is JSON only, the pane can put the host's own sentence above the reply when the message asks
// for something the assistant has no capability for (agent-limits.js; nothing now — the vertical picture was the one, and
// went with the assistant's reframe). Substitute transport, no network.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const P=require('../chat-proposal'),L=require('../agent-limits'),F=require('../agent-format'),V=require('../agent-conversation');
const S=require('../desktop/agent-service'),View=require('../ui-preferences'),Cap=require('../capabilities');

const ctx={projectId:'p',sequenceId:'main',generation:0,revision:1};
const doc=(clips)=>({fps:30,media:[{id:'m',kind:'video',duration:600}],clips:clips||[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:100,duration:50,props:{}}]});
/** The export-frame drop-down as app.js renders it in a language: its own code, on a stand-in <select>. */
function dropdown(lang){
 const app=read('app.js');
 const slice=(from,to)=>{const i=app.indexOf(from);a.ok(i>=0,from);return app.slice(i,app.indexOf(to,i));};
 const src=slice('const EXPORT_FRAME_ASPECTS = [','const WAVE_PEAKS_PER_SEC')+slice('function syncExportFrameSel()','function applyProject(');
 const attrs={},sel={title:'',innerHTML:'',setAttribute:(k,v)=>{attrs[k]=String(v);},getAttribute:(k)=>attrs[k]??null};
 new Function('els','getExportFrame','exportFrameAspectIndex','uiText','escapeHtml',src+';syncExportFrameSel();')({exportFrameSel:sel},()=>null,()=>-1,(k,v)=>View.t(lang,k,v),(x)=>String(x));
 return sel;
}
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
 // JJ定稿 (2026-11-05), word for word
 a.equal(View.text['zh-CN'].officialPane_noChange.replace('{duration}','00:50'),'按这个建议剪，时间线不会有任何变化（现在一共 00:50），所以不用应用。');
 a.equal(View.text.en.officialPane_noChange.replace('{duration}','00:50'),"This suggestion wouldn't change the timeline (it's 00:50 now), so there's nothing to apply.");
});

// Deja (2026-11-05): with the assistant's own reframe (test/agent-reframe.test.js) the 「改竖屏」 sentence and the check that
// showed it are gone together. The mechanism stays, with nothing in its list: no message gets a host sentence now.
test('nothing is reported as missing: the vertical check and its sentence are gone; the assistant can reframe',()=>{
 a.ok(Cap.get('fablecut_reframe'),'MCP has it');
 a.deepEqual([...L.ASSISTANT],['keep_sentences','keep_ranges','reframe']);
 a.deepEqual([...L.UNSUPPORTED],[]);
 for(const t of ['剪到 1 分钟以内，发快手和 B 站竖屏','改成竖版视频','做个 9:16 的','make it vertical','Reframe for Shorts','把 1:15 到 2:30 留下'])
  {a.deepEqual(L.unsupported(t),[],t);a.deepEqual(L.unsupported(t,['keep_ranges']),[],t);a.equal(L.note(t,{limitReframe:'x'}),'',t);}
 for(const l of ['zh-CN','en'])a.equal(View.text[l].officialPane_limitReframe,undefined,l);
 const app=read('app.js'),pane=read('agent-ui/pane.tsx');
 a.ok(!/exportFrameNames|limitNames/.test(app),'app.js no longer reads names for it');
 a.ok(!/limitNames/.test(pane));
 a.ok(!/limitReframe/.test(read('agent-limits.js')+read('ui-preferences.js')));
});

test('a mixed message, with a substitute transport: the format note sent carries the rules; no host sentence is added',async()=>{
 const draft='剪到 1 分钟以内，发快手和 B 站竖屏',edit={type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'c',from:100,to:150}]};
 // the desktop service with an injected request: what would go to the provider
 let sent=null;
 const service=S.createService({read:()=>JSON.stringify({version:1,provider:'openrouter',model:'m',secret:'sealed'}),write(){},seal:k=>k,unseal:()=>'k',providers:S.ALL_PROVIDERS,
  request:async(cfg,p)=>{sent=p;return {text:JSON.stringify(edit)};}});
 const state={current:()=>({id:'1',draft,messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),service,id:()=>'r1'});
 conv.prepare();a.equal((await conv.confirm()).ok,true);
 const system=sent.messages[0];
 a.equal(system.role,'system');
 // the rule names what is still missing (publishing); the vertical copy has its own reply
 a.ok(system.content.includes('When a message also asks for something you cannot do and you answer in words, your first sentence says plainly what you cannot do, for example 「发到快手和 B 站这一步我做不了。」'));
 a.ok(system.content.includes('When one message asks both to cut and for another shape, reply with the cut first; the user asks for the shape after it.'));
 a.ok(system.content.includes('Do not propose an edit that would change nothing'));
 a.match(system.content,/Apart from these replies you cannot change anything: you cannot export, upload or publish\./);
 for(const lang of ['zh-CN','en']){
  const strings=new Proxy({},{get:(_,k)=>View.text[lang]['officialPane_'+String(k)]});
  a.deepEqual(L.shown(draft,conv.result().text,strings),[conv.result().text],'the reply alone');
 }
 a.ok(!/我/.test(View.text['zh-CN'].officialPane_noChange),'fixed words: no 我');
 // the pane keeps the place for a host sentence, for something missing later
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/const limit=m\.role==='assistant'\?W\.MontClipLimits\?\.note\(MontClipAgentPane\.displayMessage\(session\.messages\[i-1\]\?\.text\|\|''\)\.text,t\):'';/);
 a.match(pane,/<strong>\{m\.role==='user'\?t\.user:t\.assistant\}<\/strong>\{limit&&<p data-host-limit>\{limit\}<\/p>\}<ThinkingText content=\{shown\.text\}\/>/);
 a.match(read('cindy-official.js'),/data-host-limit/);
 a.match(read('index.html'),/<script src="agent-limits\.js"><\/script>/);
});

test('the export-frame drop-down keeps its label (aria-label and tooltip, 待 JJ 定稿), set with the options',()=>{
 for(const lang of ['zh-CN','en']){
  const sel=dropdown(lang);
  a.equal(sel.getAttribute('aria-label'),View.text[lang]['own.ef-label']);a.equal(sel.title,View.text[lang]['own.ef-label']);
 }
 a.equal(View.text['zh-CN']['own.ef-label'],'导出画面');a.equal(View.text.en['own.ef-label'],'Export frame');
 a.match(read('ui-preferences.js'),/the export-frame drop-down above the player: its name \(aria-label and tooltip; Deja, 2026-11-05\)\. 待 JJ 定稿/);
 const app=read('app.js'),refresh=app.slice(app.indexOf('function refreshLanguageText()'),app.indexOf('function updateMontClipView('));
 a.match(refresh,/syncExportFrameSel\(\);/,'a language switch rebuilds it');
});
