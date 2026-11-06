'use strict';
// JJ定稿 (2026-11-05, via Deja): the words of the assistant's reframe, word for word; the sequence menu they name; and
// 「剪到 1 分钟以内，再改竖屏」 — the cut first, with JJ's sentence before it (the assistant's own words, so it may say 我).
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences'),V=require('../agent-conversation'),S=require('../desktop/agent-service'),F=require('../agent-format'),L=require('../agent-limits');
const zh=(k,v)=>View.t('zh-CN','own.'+k,v),en=(k,v)=>View.t('en','own.'+k,v);

test('JJ定稿, word for word: progress, 〔取消〕, changed, busy, failed, undo failed; the rest as drafted',()=>{
 a.equal(zh('rf-progress',{aspect:'9:16',n:2,of:5,pct:40}),'正在做 9:16 的版本：第 2/5 个镜头 · 40%');
 a.equal(en('rf-progress',{aspect:'9:16',n:2,of:5,pct:40}),'Making the 9:16 version: shot 2 of 5 · 40%');
 a.equal(zh('rf-cancel'),'取消');a.equal(en('rf-cancel'),'Cancel');
 a.equal(zh('rf-changed'),'做的过程中项目被改过，为了不出错，没有新建序列。可以再让助手做一次。');
 a.equal(en('rf-changed'),'The project changed while this was being made, so to be safe no sequence was made. Ask again.');
 a.equal(zh('rf-busy'),'现在有别的事在进行（导出，或者另一个改比例），等它做完再试。');
 a.equal(en('rf-busy'),"Something else is running (an export, or another reframe). Try again when it's done.");
 a.equal(zh('rf-failed'),'画面读不出来，所以没有新建序列。');
 a.equal(en('rf-failed'),"The footage couldn't be read, so no sequence was made.");
 a.equal(zh('rf-undo-failed',{name:'主序列'}),'回不到原来的序列了。可以从时间线左上角的序列菜单（▾）里打开「主序列」。');
 a.equal(en('rf-undo-failed',{name:'Main'}),"Couldn't go back to the original sequence. Open “Main” from the sequence menu (▾) at the top left of the timeline.");
 // as drafted (JJ: unchanged in both languages)
 a.equal(zh('ap-sum-reframe',{aspect:'9:16'}),'做一份 9:16 的新序列，画面跟着人走，做好后切换过去；原来的序列不动。要逐帧看画面，可能要等一会儿。');
 a.equal(zh('rf-done',{aspect:'9:16',name:'Main 9:16'}),'已做好 9:16 的新序列「Main 9:16」并切换过去。撤销一次就回到原来的序列。');
 a.equal(zh('rf-cancelled'),'已取消，没有新建序列，什么都没改。');
 a.equal(zh('rf-nothing'),'这里没有能改比例的镜头（只有字幕、画中画或手动摆过的片段），所以没有新建序列。');
 a.equal(zh('rf-same'),'这个序列已经是这个比例了，不用再做。');
 a.equal(zh('rf-undone',{aspect:'9:16',name:'主序列'}),'已撤销：删掉了 9:16 的新序列，回到「主序列」。');
 a.equal(View.text['zh-CN'].officialPane_proposalReframe,'已生成剪辑建议：做一份 {aspect} 的新序列，画面跟着人走，原来的序列不动。动手之前会先问你。');
 const src=read('ui-preferences.js');
 a.match(src,/runAgentReframe\)\. JJ定稿 \(2026-11-05\), except rf-failed-name \(待 JJ 定稿\)/);
 for(const k of Object.keys(View.text['zh-CN']).filter(k=>/^own\.rf-|^own\.ap-sum-reframe$|proposalReframe$/.test(k)))a.ok(!/我/.test(View.text['zh-CN'][k]),'no 我: '+k);
});

test('a file that couldn\'t be opened is named after rf-failed (the name the bin shows, no path; 待 JJ 定稿)',()=>{
 a.equal(zh('rf-failed-name',{name:'第一场.mp4'}),'打不开的素材是「第一场.mp4」。');
 a.equal(en('rf-failed-name',{name:'live.mp4'}),"The clip that couldn't be opened is “live.mp4”.");
 a.match(read('ui-preferences.js'),/no path\. 待 JJ 定稿\n\s*"rf-failed-name"/);
 const app=read('app.js'),run=app.slice(app.indexOf('async function runAgentReframe('),app.indexOf('function agentReframeBackOf('));
 a.match(run,/const c=take\[i\];reading=c;say\(i,0\);/,'the clip being read is known');
 a.match(run,/m\.name\.split\(\/\[\\\\\/\]\/\)\.pop\(\)\.trim\(\)/,'only the last part of the name: never a path');
 a.match(run,/return \{ok:false,code:'FAILED',\.\.\.\(failed&&failedName\(\)\?\{name:failedName\(\)\}:\{\}\)\};/);
 a.match(app,/\+\(r\.code==='FAILED'&&r\.name\?' '\+uiText\('own\.rf-failed-name',\{name:r\.name\}\):''\)/);
 a.match(app,/toast\(uiText\('own\.rf-undo-failed',\{name:shownName\(b\.backName\|\|''\)\}\)\);return false;\}/);
});

test('the sequence menu the words name: the first button at the top left of the timeline, ending in ▾',()=>{
 const html=read('index.html'),bar=html.slice(html.indexOf('<div class="timeline-toolbar">'));
 a.match(bar,/^<div class="timeline-toolbar">\s*<button type="button" class="btn tiny seq-btn" id="btnSequences" aria-haspopup="menu"/,'the first thing in the timeline toolbar');
 a.match(bar,/<span class="seq-name" data-i18n="term\.main">Main<\/span><span class="seq-count"><\/span> ▾<\/button>/,'it shows the sequence name, then ▾');
 a.ok(!/id="btnSequences"[^>]*data-more-rank/.test(html),'never folded into the narrow window\'s more menu');
});

const SENT_ZH='这次先帮你剪短。改竖屏要另做一份序列，剪好以后再跟我说「改成竖屏」就行。';
const SENT_EN='First I\'ll shorten it. Making it vertical creates a separate sequence, so once this is done, just say “make it vertical”.';
test('剪到 1 分钟以内，再改竖屏: the format note sent (substitute transport) asks for the cut first, with JJ\'s sentence before it',async()=>{
 const draft='剪到 1 分钟以内，发快手和 B 站竖屏',edit={type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'c',from:0,to:55}]};
 let sent=null;
 const service=S.createService({read:()=>JSON.stringify({version:1,provider:'openrouter',model:'m',secret:'sealed'}),write(){},seal:k=>k,unseal:()=>'k',providers:S.ALL_PROVIDERS,
  request:async(cfg,p)=>{sent=p;return {text:SENT_ZH+'\n\n'+JSON.stringify(edit)};}});
 const state={current:()=>({id:'1',draft,messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),service,id:()=>'r1'});
 conv.prepare();a.equal((await conv.confirm()).ok,true);
 const note=sent.messages[0].content;
 a.equal(sent.messages[0].role,'system');a.equal(note,F.FORMAT_NOTE);
 a.ok(note.includes('When one message asks both to cut and for another shape (for example to under a minute and vertical), reply with the cut\'s JSON first, and before it, then a blank line, put this sentence in the user\'s language'));
 a.ok(note.includes('in Chinese 「'+SENT_ZH+'」'),'JJ\'s sentence, word for word');
 a.ok(note.includes('in English “'+SENT_EN+'”'));
 a.ok(note.includes('This sentence is the only text allowed before a JSON reply.'));
 // the old 「改竖屏这一步我现在做不了」 example and its check are gone
 a.ok(!note.includes('改竖屏这一步我现在做不了'));a.deepEqual(L.unsupported('剪到 1 分钟以内，再改竖屏'),[],'vertical is the assistant\'s own: nothing reported (only 16:9 / 5:4 / 横屏 are, Deja 2026-11-06)');
 // such a reply is still the edit: the sentence is shown above its summary, never read for the edit
 const reply=conv.result().text;
 a.deepEqual(V.parseProposal(reply),edit);a.equal(V.proposalLead(reply),SENT_ZH);
 a.deepEqual(V.proposalSummary(reply,[]),{count:1,duration:55,mode:'one_file'});
 a.match(read('agent-ui/pane.tsx'),/lead=p\?MontClipConversation\.proposalLead\(text\):'';return p\?\(lead\?lead\+'\\n\\n':''\)\+\(p\.mode==='reframe'/);
 a.match(read('cindy-official.js'),/proposalLead/,'the bundle was rebuilt');
});

test('the sentence before a proposal is only a short paragraph: anything else is not a proposal',()=>{
 const j=JSON.stringify({type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'c',from:0,to:30}]}),fence='```';
 a.equal(V.proposalLead(j),'');a.ok(V.parseProposal(j));
 a.equal(V.proposalLead(SENT_EN+'\n\n'+fence+'json\n'+j+'\n'+fence),SENT_EN,'a fenced JSON after it');
 for(const bad of ['a {b}\n\n'+j,'x'.repeat(201)+'\n\n'+j,'one\n\ntwo\n\n'+j,'no blank line\n'+j,'`x`\n\n'+j,SENT_ZH+'\n\n'+j+'\nmore'])
  {a.equal(V.parseProposal(bad),null,JSON.stringify(bad).slice(0,40));a.equal(V.proposalLead(bad),'');}
});

test('JJ final sequence-limit wording renders the same limit as the guard',()=>{
 const vm=require('node:vm'),Seq=require('../sequences'),app=read('app.js');
 const start=app.indexOf("  if(!r.ok){if(ev)moveEvent(ev.id,r.code==='CANCELLED'");
 const branch=app.slice(start,app.indexOf('\n  const c=agentProjectContext();',start));
 for(const [lang,expected] of [
  ['zh-CN','这个工程已有 64 个序列，暂时不能再新建。请先删除一个不需要的序列，再试。'],
  ['en','This project already has 64 sequences. Remove an unneeded sequence, then try again.']]){
  for(const limit of [Seq.MAX,17]){
   let shown;
   vm.runInNewContext('(function(){'+branch+'})()',{
    r:{ok:false,code:'SEQUENCE_LIMIT'},ev:null,aspect:'9:16',SeqLib:{MAX:limit},
    uiText:(k,v)=>View.t(lang,k,v),toast:s=>shown=s
   });
   a.equal(shown,expected.replace('64',String(limit)));
  }
 }
});
