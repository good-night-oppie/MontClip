'use strict';
// QQ's five on #169 (via Deja, 2026-11-05): (1) only two more things, as numbers, with a longest length; (2) the review box
// lists them in plain numbers before every send; (3) a switch in 设置, on by default, and a reply that says it is off;
// (4) is #170; (5) the outgoing payload's fields are locked, and the review box's words name both.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const Facts=require('../agent-facts'),Cap=require('../capabilities'),V=require('../agent-conversation'),Format=require('../agent-format');
const View=require('../ui-preferences'),Store=require('../desktop/view-settings');

const doc=(secs,clips=1)=>({media:[{id:'m1',name:'我的直播.mp4',src:'/media/私密/我的直播.mp4',kind:'video',duration:secs*clips}],
 clips:Array.from({length:clips},(_,i)=>({id:'c'+i,kind:'video',mediaId:'m1',track:'V1',start:i*secs,in:i*secs,duration:secs,props:{}}))});
const sound=(secs,songs=null)=>({m1:{loudness:{step:0.5,values:Array.from({length:secs*2},(_,i)=>-60+(i%120)/2)},songs}});

test('(1) only singing [from, to] and whole-number loudness 0–100; the step for 2 h, 4 h and 8 h; longer is refused',()=>{
 const f=Facts.build(doc(600),{sound:sound(600,[{from:30,to:200,confidence:'estimated',marks:[]}])});
 a.deepEqual(f.singing,[{clipId:'c0',from:30,to:200}]);
 for(const e of f.loudness)for(const v of e.values)a.ok(Number.isInteger(v)&&v>=0&&v<=100,'a whole number 0–100: '+v);
 a.ok(f.loudness.every(e=>e.step>=1),'at most one a second: no waveform');
 const stepFor=(secs)=>Facts.build(doc(secs),{sound:sound(secs)}).loudness[0].step;
 a.equal(stepFor(2400),1);a.equal(stepFor(7200),3,'2 h: one every 3 s');a.equal(stepFor(14400),6,'4 h: one every 6 s');a.equal(stepFor(28800),12,'8 h: one every 12 s');
 a.throws(()=>Facts.build(doc(28801),{sound:sound(28801)}),/FACTS_LIMIT/,'over 8 h: refused, not cut down');
 a.throws(()=>Facts.build(doc(14401,2),{sound:sound(14401*2)}),/FACTS_LIMIT/,'two clips together over 8 h');
 a.equal(Cap.FACTS.loudnessSeconds,28800);
 const caps=read('capabilities.js');
 for(const s of ['40 min one a second, 2 h one every 3 s, 4 h one every 6 s, 8 h one every 12 s','no waveform can be rebuilt from them','loudnessSeconds — the longest the clips may be together (8 h); longer, the send is refused'])a.ok(caps.includes(s),s);
});

// (5) every key of what goes out, at every level: one more and this fails
const PAYLOAD=['gen','messages','projectId','requestId','revision','sequenceId','version'],MESSAGE=['content','role'],TAIL=['facts','references'];
const FACTS=['clips','highlights','loudness','singing'];
const ENTRY={clips:['clipId','from','kind','mediaDuration','start','to'],highlights:['clipId','from','score','to'],singing:['clipId','from','to'],loudness:['clipId','from','step','values']};
const BODY=['max_tokens','messages','model','stream'];
test('(5) the outgoing payload: exactly these fields, at every level; nothing else is sent',()=>{
 const d=doc(600),f=Facts.build(d,{highlights:[{from:100,to:130,score:0.5,text:'秘密'}],sound:sound(600,[{from:30,to:200,confidence:'likely',marks:[]}])});
 const state={current:()=>({id:'1',draft:'把她开口唱之前的安静部分剪掉',messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),getFacts:()=>f,id:()=>'r1'});
 const payload=conv.prepare(),keys=o=>Object.keys(o).sort();
 a.deepEqual(keys(payload),PAYLOAD);
 for(const m of payload.messages)a.deepEqual(keys(m),MESSAGE);
 const content=payload.messages.at(-1).content,tail=JSON.parse(content.slice(content.lastIndexOf('\n\n')+2));
 a.deepEqual(keys(tail),TAIL);
 a.deepEqual(keys(tail.facts),FACTS);
 for(const [k,list] of Object.entries(tail.facts))for(const e of list)a.deepEqual(keys(e),ENTRY[k],k);
 for(const e of tail.facts.loudness)a.ok(e.values.every(Number.isInteger));
 // what reaches the provider: the request body around them (the same builder the service uses)
 a.deepEqual(keys(Format.body('m',Format.withFormat(payload.messages))),BODY);
 const json=JSON.stringify(payload);
 for(const s of ['我的直播','/media/','秘密','confidence','marks','src','name'])a.ok(!json.includes(s),'not sent: '+s);
});

test('(2) the review box lists the sound in plain numbers: singing parts, how long together, how many loudness values',()=>{
 const f=Facts.build(doc(600),{sound:sound(600,[{from:30,to:200,confidence:'likely',marks:[]},{from:300,to:390,confidence:'likely',marks:[]}])});
 a.deepEqual(Facts.soundSummary(f),{parts:2,seconds:260,values:600,step:1});
 a.equal(Facts.soundSummary({clips:[]}),null);
 const fill=(l)=>View.text[l].officialPane_factsCounts.replace('{parts}','2').replace('{duration}',V.durationText(260)).replace('{values}','600').replace('{step}','1');
 a.equal(fill('zh-CN'),'这次附上：可能在唱歌的 2 段，一共 04:20；音量 600 个数，每 1 秒一个。');
 a.equal(fill('en'),'This time: 2 singing parts, 04:20 in total; 600 loudness numbers, one every 1 s.');
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/<p data-facts-counts>\{t\.factsCounts\.replace\('\{parts\}',String\(n\.parts\)\)\.replace\('\{duration\}',MontClipConversation\.durationText\(n\.seconds\)\|\|'0:00'\)\.replace\('\{values\}',String\(n\.values\)\)\.replace\('\{step\}',String\(n\.step\)\)\}<\/p>/);
 // shown before every send: the only way to send is the review box's own button, whatever was approved before
 a.equal((pane.match(/conversation\.confirm\(\)/g)||[]).length,1,'one send');
 a.match(pane,/const confirm=async\(\)=>\{dialog\.current\?\.close\(\);/,'it is the box\'s confirm');
 a.equal((pane.match(/onClick=\{confirm\}/g)||[]).length,1,'and only the box\'s button calls it');
 a.match(pane,/useLayoutEffect\(\(\)=>\{if\(review&&dialog\.current&&!dialog\.current\.open\)dialog\.current\.showModal\(\);/,'every prepared send opens the box');
 a.ok(!/assistant_request/.test(pane)&&!/approved|session.*approv/i.test(pane.slice(pane.indexOf('const showReview'),pane.indexOf('const confirm='))),'no approval skips it');
 // the review box's words name both things (JJ's line), and the counts line names them too
 for(const l of ['zh-CN','en']){
  const t=View.text[l];
  a.ok(/唱歌|singing/.test(t.officialPane_factsSound)&&/音量|loudness/.test(t.officialPane_factsSound),l);
  a.ok(/唱歌|singing/.test(t.officialPane_factsCounts)&&/音量|loudness/.test(t.officialPane_factsCounts),l);
 }
 a.match(read('ui-preferences.js'),/QQ's five on #169 \(Deja, 2026-11-05\), 待 JJ 定稿/);
 a.match(read('cindy-official.js'),/data-facts-counts/,'the bundle was rebuilt');
});

test('(3) 设置 › 「附上唱歌段和音量」: on by default, kept when off (browser and desktop), nothing read or sent when off',()=>{
 const mem={};const v=View.create({getItem:k=>mem[k]??null,setItem:(k,x)=>{mem[k]=x;}});
 a.equal(v.get().soundFacts,undefined,'on by default (no key)');
 v.set({soundFacts:false});a.equal(v.get().soundFacts,false);
 a.equal(View.create({getItem:k=>mem[k]??null,setItem(){}}).get().soundFacts,false,'kept');
 v.set({soundFacts:true});a.deepEqual(v.get(),{mode:'simple',language:'zh-CN'},'on again: the settings as everyone has them');
 a.throws(()=>v.set({soundFacts:'no'}));
 // the desktop's own store (view-settings.json) keeps it only as false
 const files={},io={readFileSync:f=>{if(!(f in files))throw Object.assign(Error(),{code:'ENOENT'});return files[f];},writeFileSync:(f,x)=>{files[f]=x;},renameSync:(a1,b)=>{files[b]=files[a1];delete files[a1];},unlinkSync(){}};
 const st=Store.createStore('/p',{io});
 a.equal(st.set({mode:'simple',language:'zh-CN',soundFacts:false}).ok,true);a.deepEqual(st.get().value,{mode:'simple',language:'zh-CN',soundFacts:false});
 a.equal(st.set({mode:'simple',language:'zh-CN',soundFacts:true}).ok,false,'true is not stored: absent is on');
 a.equal(st.set({mode:'simple',language:'zh-CN'}).ok,true);a.deepEqual(st.get().value,{mode:'simple',language:'zh-CN'});
 // the editor: the switch, and off means not read and not sent
 const html=read('index.html'),app=read('app.js');
 a.match(html,/<input type="checkbox" id="setSoundFactsOn">\s*<span>\s*<span class="settings-label" data-i18n="own\.sf-label">/);
 a.match(app,/if \(sf\) sf\.checked = soundFactsOn\(\);/);
 a.match(app,/mcView\.set\(\{ soundFacts: !!e\.target\.checked \}\);/);
 a.match(app,/if\(!soundFactsOn\(\)\)\{runtime\.soundFacts=null;return;\}/,'nothing is read');
 a.match(app,/sound:soundFactsOn\(\)&&s&&/,'nothing is sent');
 a.match(read('agent-ui/pane.tsx'),/\{review&&options\.soundFactsOff\?\.\(\)&&<p data-facts-off>\{t\.factsOff\}<\/p>\}/,'the review box says it is off');
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh['own.sf-label'],'附上唱歌段和音量');a.equal(en['own.sf-label'],'Attach singing parts and loudness');
 a.equal(zh.officialPane_factsOff,'这次没有附上唱歌段和音量：设置里关着。');
 a.match(read('ui-preferences.js'),/「附上唱歌段和音量」 in 设置 \(QQ's five on #169; Deja, 2026-11-05\)\. 待 JJ 定稿/);
});

test('(3) off, a message about the quiet part gets the editor\'s note above the reply: it can\'t be done, and how to turn it on',()=>{
 for(const t of ['把她开口唱之前的安静部分剪掉','剪掉静音','cut the quiet part before she starts singing','remove the silence'])a.ok(Facts.asksAboutSound(t),t);
 for(const t of ['剪到 1 分钟以内','保留第二句','keep the first 30 seconds'])a.ok(!Facts.asksAboutSound(t),t);
 const app=read('app.js');
 a.match(app,/soundOffNote:\(text\)=>soundFactsOn\(\)\|\|!MontClipFacts\.asksAboutSound\(text\)\?'':uiText\('own\.sf-off-note',\{settings:uiText\('term\.settings'\),switch:uiText\('own\.sf-label'\)\}\),/);
 const note=(l)=>View.t(l,'own.sf-off-note',{settings:View.text[l]['term.settings'],switch:View.text[l]['own.sf-label']});
 a.equal(note('zh-CN'),'「附上唱歌段和音量」现在关着，助手判断不了哪里安静、从哪里开始唱。要用的话，到〔设置〕里打开「附上唱歌段和音量」，再发一次。');
 a.equal(note('en'),"“Attach singing parts and loudness” is off, so the assistant can't tell where it is quiet or where the singing starts. To use it, turn on “Attach singing parts and loudness” in “Settings”, then send again.");
 a.ok(!/我/.test(note('zh-CN')));
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/const soundNote=m\.role==='assistant'\?options\.soundOffNote\?\.\(MontClipAgentPane\.displayMessage\(session\.messages\[i-1\]\?\.text\|\|''\)\.text\)\|\|'':'';/);
 a.match(pane,/<strong>\{m\.role==='user'\?t\.user:t\.assistant\}<\/strong>\{soundNote&&<p data-sound-off>\{soundNote\}<\/p>\}/);
 a.match(read('cindy-official.js'),/data-sound-off/);
});
