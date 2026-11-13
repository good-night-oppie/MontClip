'use strict';
// JJ via Deja (2026-11-05): 「剪到 1 分钟以内，发快手和 B 站竖屏」 gave 「保留 1 段」, and 〔应用〕 changed nothing and made
// nothing vertical. Two rules: (1) a proposal that would change nothing gets no button — decided by the host from the
// numbers (chat-proposal.js unchanged); (2) what the assistant can't do is said first — the format note asks the model,
// and, because an edit reply is JSON only, the pane can put the host's own sentence above the reply when the message asks
// for something the assistant has no capability for (agent-limits.js; nothing now — the vertical picture was the one, and
// went with the assistant's reframe). Substitute transport, no network.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const P=require('../app/chat-proposal'),L=require('../app/agent-limits'),F=require('../agent-format'),V=require('../app/agent-conversation');
const S=require('../desktop/agent-service'),View=require('../ui-preferences'),Cap=require('../capabilities');

const ctx={projectId:'p',sequenceId:'main',generation:0,revision:1};
const doc=(clips)=>({fps:30,media:[{id:'m',kind:'video',duration:600}],clips:clips||[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:100,duration:50,props:{}}]});
/** The export-frame drop-down as app.js renders it in a language: its own code, on a stand-in <select>. */
function dropdown(lang){
 const app=read('app/app.js');
 const slice=(from,to)=>{const i=app.indexOf(from);a.ok(i>=0,from);return app.slice(i,app.indexOf(to,i));};
 const src=slice('const EXPORT_FRAME_ASPECTS = [','const WAVE_PEAKS_PER_SEC')+slice('function syncExportFrameSel()','function applyProject(');
 const attrs={},sel={title:'',innerHTML:'',setAttribute:(k,v)=>{attrs[k]=String(v);},getAttribute:(k)=>attrs[k]??null,
  optionText:(v)=>{const m=new RegExp('<option value="'+v+'"[^>]*>([^<]*)</option>').exec(sel.innerHTML);return m?m[1]:null;},
  querySelector:(q)=>{const m=/^option\[value="([^"]+)"\]$/.exec(q),t=m&&sel.optionText(m[1]);return t==null?null:{textContent:t};}};
 const run=new Function('els','getExportFrame','exportFrameAspectIndex','uiText','escapeHtml',src+';syncExportFrameSel();return exportFrameNames();');
 const names=run({exportFrameSel:sel},()=>null,()=>-1,(k,v)=>View.t(lang,k,v),(x)=>String(x));
 return {sel,names};
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

test('small gaps must be counted together before hiding a proposal',()=>{
 const d=doc([{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:10.09,props:{}}]);
 const keep=Array.from({length:10},(_,i)=>[i*1.01,i*1.01+1]);
 const p=ranges(keep,'one_file',d);
 a.ok(Math.abs(p.duration-10)<1e-9,'the range engine removes nine 0.01-second gaps');
 a.equal(p.unchanged,false,'0.09 seconds removed exceeds half a frame at 30 fps');
});

test('keep_sentences that keep every sentence of a fully captioned edit are unchanged too',()=>{
 const d=doc([{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:6,props:{}},
  {id:'s1',kind:'text',track:'V2',start:0,in:0,duration:3,props:{text:'一',caption:true}},{id:'s2',kind:'text',track:'V2',start:3,in:0,duration:3,props:{text:'二',caption:true}}]);
 const refs=[{type:'caption',clipId:'s1',sourceCaptionId:'s1',start:0,end:3,text:'一'},{type:'caption',clipId:'s2',sourceCaptionId:'s2',start:3,end:6,text:'二'}];
 const r=(ids)=>P.prepare({type:'keep_sentences',ranges:ids.map(i=>({clipId:refs[i].clipId,sourceCaptionId:refs[i].sourceCaptionId,from:refs[i].start,to:refs[i].end}))},{doc:d,context:ctx,references:refs});
 a.equal(r([0,1]).unchanged,true);a.equal(r([1]).unchanged,false);a.equal(r([1,0]).unchanged,false);
});

test('the pane shows no 〔查看剪辑建议〕 for an unchanged proposal and says so; the host never applies one',()=>{
 const pane=read('agent-ui/pane.tsx'),app=read('app/app.js');
 a.match(pane,/const unchanged=usable\?options\.noChange\?\.\(result\)\|\|null:null;/);
 a.match(pane,/\{usable&&unchanged&&<p data-no-change>\{t\.noChange\.replace\('\{duration\}',MontClipConversation\.durationText\(unchanged\.duration\)\)\}<\/p>\}\{usable&&!unchanged&&<button data-review-proposal /);
 a.match(read('app/cindy-official.js'),/data-no-change/,'the bundle was rebuilt');
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
test('the assistant makes 9:16, 1:1 and 4:5 itself: those are not reported; a message that asks only for 16:9, 5:4 or 横屏 is',()=>{
 a.ok(Cap.get('fablecut_reframe'),'MCP has it');
 a.deepEqual([...L.ASSISTANT],['keep_sentences','keep_ranges','reframe']);
 a.deepEqual([...L.MADE],Object.keys(P.ASPECTS),'the shapes it makes are chat-proposal.js ASPECTS');
 for(const t of ['剪到 1 分钟以内，发快手和 B 站竖屏','改成竖版视频','做个 9:16 的','make it vertical','Reframe for Shorts','把 1:15 到 2:30 留下',
                 '改成 1:1','4:5 发小红书','把 16:9 改成 9:16','横屏转竖屏','16:9 和 9:16 各一版','landscape to portrait'])
  {a.deepEqual(L.unsupported(t),[],t);a.equal(L.note(t,{limitReframeAspect:'x',limitReframeAny:'y'}),'',t);}
 for(const t of ['改成 16:9','做个 16比9 的','5:4','改成横屏','make it landscape','16：9 横版'])
  a.deepEqual(L.unsupported(t).map(u=>u.id),['reframe-aspect'],t);
 // the vertical sentence of #172 stays gone; the manual way for another shape is #172's JJ定稿 (2026-11-06), unchanged
 for(const l of ['zh-CN','en']){a.equal(View.text[l].officialPane_limitReframe,undefined,l);
  for(const k of ['limitReframeAspect','limitReframeAny'])a.ok(/\{dropdown\}/.test(View.text[l]['officialPane_'+k]),l+' '+k);}
 a.match(read('app/app.js'),/limitNames:\(\)=>exportFrameNames\(\),/,'app.js gives the pane the drop-down names');
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
 // JJ定稿 (2026-11-05): the cut first, with JJ's sentence before it (test/agent-reframe-words.test.js has the words)
 a.ok(system.content.includes('When one message asks both to cut and for another shape (for example to under a minute and vertical), reply with the cut\'s JSON first'));
 a.ok(system.content.includes('Do not propose an edit that would change nothing'));
 a.match(system.content,/Apart from these replies you cannot change anything: you cannot export, upload or publish\./);
 for(const lang of ['zh-CN','en']){
  const strings=new Proxy({},{get:(_,k)=>View.text[lang]['officialPane_'+String(k)]});
  a.deepEqual(L.shown(draft,conv.result().text,strings),[conv.result().text],'the reply alone');
 }
 a.ok(!/我/.test(View.text['zh-CN'].officialPane_noChange),'fixed words: no 我');
 // the pane keeps the place for a host sentence, for something missing later
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/const limit=m\.role==='assistant'\?W\.MontClipLimits\?\.note\(MontClipAgentPane\.displayMessage\(session\.messages\[i-1\]\?\.text\|\|''\)\.text,t,options\.limitNames\?\.\(\)\|\|\{\}\):'';/);
 a.match(pane,/<strong>\{m\.role==='user'\?t\.user:t\.assistant\}<\/strong>\{limit&&<p data-host-limit>\{limit\}<\/p>\}\{soundNote&&<p data-sound-off>\{soundNote\}<\/p>\}<ThinkingText content=\{shown\.text\}\/>/);
 a.match(read('app/cindy-official.js'),/data-host-limit/);
 a.match(read('index.html'),/<script src="app\/agent-limits\.js"><\/script>/);
});

test('the export-frame drop-down keeps its label (aria-label, JJ定稿), set with the options',()=>{
 for(const lang of ['zh-CN','en']){
  const {sel}=dropdown(lang);
  a.equal(sel.getAttribute('aria-label'),View.text[lang]['own.ef-label']);
 }
 a.equal(View.text['zh-CN']['own.ef-label'],'导出画面');a.equal(View.text.en['own.ef-label'],'Export frame');
 a.match(read('ui-preferences.js'),/the export-frame drop-down above the player: its name \(aria-label; Deja, 2026-11-05\)\. JJ定稿 \(2026-11-05\)/);
 const app=read('app/app.js'),refresh=app.slice(app.indexOf('function refreshLanguageText()'),app.indexOf('function updateMontClipView('));
 a.match(refresh,/syncExportFrameSel\(\);/,'a language switch rebuilds it');
 // the format note names no option words (no Reel / IG, JJ 2026-11-05)
 a.ok(!/Reel|“Full canvas”/.test(F.FORMAT_NOTE));
});

// QQ (review of #172 at 663bdf8e): times are not aspect ratios. Only 9:16 16:9 1:1 4:5 5:4 count (with : ： or 比), and never as
// part of a longer number or time. The same 27 cases as #172, read through shapes() now that 9:16 / 1:1 / 4:5 are the assistant's.
test('a time is not an aspect ratio: only 9:16 16:9 1:1 4:5 5:4 count, never inside a longer number or time',()=>{
 for(const t of ['把 4:16 到 5:30 剪掉','从 05:16 开始','删掉 11:16 那句','19:16','9:160','1:1:1','剪掉 01:16','保留 2:16 到 3:45','1:10 那里','16:90','14:50 之后'])
  {a.deepEqual(L.shapes(t),[],t);a.deepEqual(L.unsupported(t),[],t);}
 for(const [t,r] of [['做个 9:16 的','9:16'],['16:9 横版','16:9'],['改成 1:1','1:1'],['4:5 发小红书','4:5'],['5:4','5:4'],
                     ['9：16','9:16'],['16比9','16:9'],['1 : 1','1:1'],['4 比 5','4:5'],['(9:16)','9:16'],['ratio 5:4, please','5:4']])
  a.deepEqual(L.shapes(t),[r],t);
 const strings={limitReframeAspect:'aspect: {option}',limitReframeAny:'choose in {dropdown}'};
 const names={dropdown:'Export frame',option:'Vertical',options:{'9:16':'Vertical','16:9':'Landscape','1:1':'Square','4:5':'Portrait'}};
 for(const [t,o] of [['4:5 发小红书',''],['16比9','aspect: Landscape'],['5:4','choose in Export frame'],['从 05:16 开始改成 1:1',''],['把 4:16 到 5:30 剪掉，再改竖屏','']])
  a.equal(L.note(t,strings,names),o,t);
});

test('the manual way names what the drop-down shows: its label and the 16:9 option, read from it; 5:4, not in it, gets the label only',()=>{
 for(const lang of ['zh-CN','en']){
  const {sel,names}=dropdown(lang),T=k=>View.text[lang]['officialPane_'+k];
  a.equal(names.dropdown,View.text[lang]['own.ef-label']);a.equal(names.dropdown,sel.getAttribute('aria-label'));
  a.equal(names.options['16:9'],sel.optionText('2'),'the 16:9 option as rendered');
  const strings={limitReframeAspect:T('limitReframeAspect'),limitReframeAny:T('limitReframeAny')};
  a.equal(L.note('改成 16:9',strings,names),T('limitReframeAspect').replace('{dropdown}',names.dropdown).replace('{option}',names.options['16:9']));
  a.equal(L.note('改成 5:4',strings,names),T('limitReframeAny').replace('{dropdown}',names.dropdown));
  a.ok(!/\{\w+\}/.test(L.note('改成 16:9',strings,names)),'no placeholder left');
 }
});

// Deja (2026-11-06): 「改成 9:16」 gets the reframe proposal, asked first; 「把 4:16 到 5:30 剪掉」 is a cut, never a reframe.
test('「改成 9:16」: no host sentence, the reframe reply is accepted and asked first; 「把 4:16 到 5:30 剪掉」 does not touch reframe',()=>{
 const Policy=require('../agent-policy');
 a.equal(L.note('改成 9:16',{limitReframeAspect:'x',limitReframeAny:'y'}),'');
 const d={fps:30,width:1920,height:1080,media:[{id:'m',kind:'video',duration:60,width:1920,height:1080}],clips:[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:30,props:{}}]};
 const p=P.prepare({type:'reframe',aspect:'9:16'},{doc:d,context:ctx});
 a.equal(p.type,'reframe');a.equal(p.aspect,'9:16');a.equal(p.unchanged,false);
 for(const mode of ['manual','auto','yolo'])a.equal(Policy.decide({mode,capability:'reframe',language:'zh-CN'}).action,'ask',mode);
 const cut='把 4:16 到 5:30 剪掉';
 a.deepEqual(L.shapes(cut),[]);a.deepEqual(L.unsupported(cut),[]);a.equal(L.note(cut,{limitReframeAspect:'x',limitReframeAny:'y'}),'');
});

// JJ定稿 (2026-11-06, for #175 at ac2df195; posted by Deja on #175): the two sentences, word for word.
test('JJ定稿, word for word: limitReframeAspect and limitReframeAny in both languages',()=>{
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_limitReframeAspect,'改成「{option}」这一步，助手现在还做不了。可以自己改：在播放器上方的「{dropdown}」里选它，再导出。');
 a.equal(en.officialPane_limitReframeAspect,"The assistant can't change it to “{option}” yet. You can do it yourself: in the “{dropdown}” list above the player, choose it, then export.");
 a.equal(zh.officialPane_limitReframeAny,'这个画面比例，助手现在还做不了。可以自己改：在播放器上方的「{dropdown}」里选择需要的画面比例，再导出。');
 a.equal(en.officialPane_limitReframeAny,"The assistant can't make that aspect ratio yet. You can do it yourself: choose the aspect ratio you need in the “{dropdown}” list above the player, then export.");
 for(const t of [zh,en].flatMap(x=>[x.officialPane_limitReframeAspect,x.officialPane_limitReframeAny]))a.ok(!/9:16|16:9|Reel|我/.test(t),t);
});

// JJ asked (2026-11-06): with two or more shapes the assistant can't make, which {option}? None: never the first one alone —
// the sentence without an option (limitReframeAny). The same shape said twice (16:9 and 横屏) is one shape.
test('two or more shapes it can\'t make: limitReframeAny, never only the first; one shape said twice is one',()=>{
 for(const lang of ['zh-CN','en']){
  const {names}=dropdown(lang),T=k=>View.text[lang]['officialPane_'+k];
  const strings={limitReframeAspect:T('limitReframeAspect'),limitReframeAny:T('limitReframeAny')};
  const any=T('limitReframeAny').replace('{dropdown}',names.dropdown),one=T('limitReframeAspect').replace('{dropdown}',names.dropdown).replace('{option}',names.options['16:9']);
  for(const t of ['改成 16:9 或 5:4','5:4 和 16:9 各一版','横屏，或者 5:4'])a.equal(L.note(t,strings,names),any,lang+' '+t);
  for(const t of ['改成 16:9 横屏','16:9, landscape','16比9 和 16:9'])a.equal(L.note(t,strings,names),one,lang+' '+t);
 }
});
