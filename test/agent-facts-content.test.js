'use strict';
// The review box says the timeline facts hold no file names and no subtitle text (JJ, final, 2026-11-03, on #87). This
// locks it: the facts are numbers, short clip ids and the clip's kind, whatever the project holds.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const Facts=require('../app/agent-facts'),View=require('../shared/ui-preferences');

// a project full of what must never be sent: file names, paths, subtitle and danmaku text, clip names
const SECRETS=['我的直播 11月2日.mp4','/media/私密/录像.mp4','C:\\Users\\主播\\Videos\\a.flv','天空好想下雨','谢谢老板的火箭','开场白'];
const doc={
 media:[{id:'m1',name:SECRETS[0],src:SECRETS[1],kind:'video',duration:600,originalSrc:SECRETS[2]},{id:'m2',name:'b.wav',src:'/media/b.wav',kind:'audio',duration:120}],
 clips:[
  {id:'c_v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:10,duration:300,name:SECRETS[5],props:{volume:0}},
  {id:'c_a2',kind:'audio',mediaId:'m2',track:'A2',start:300,in:0,duration:100,props:{}},
  {id:'cap1',kind:'text',mediaId:null,track:'V2',start:1,in:0,duration:3,props:{text:SECRETS[3],caption:true}},
  // a clip whose id is not a short id (a path): it is left out rather than sent
  {id:'C:/Users/主播/a.mp4',kind:'audio',mediaId:'m2',track:'A3',start:500,in:0,duration:10,props:{}},
 ],
 danmaku:[{t:5,text:SECRETS[4]}],
};
const SHORT_ID=/^[A-Za-z0-9_-]{1,128}$/;
const KEYS=new Set(['clips','highlights','clipId','kind','mediaDuration','from','to','start','score']);

test('the facts are numbers, short clip ids and video/audio — no src, file name, path or subtitle text',()=>{
 const f=Facts.build(doc,{highlights:[{from:20,to:40,score:0.8,reasons:[SECRETS[3]],text:SECRETS[3]}]});
 const json=JSON.stringify(f);
 for(const s of SECRETS)a.ok(!json.includes(s),'leaked: '+s);
 a.ok(!/\/media\/|[\\/]|\.(mp4|flv|wav|mov|mkv)\b|"src"|"name"|"text"|"path"/i.test(json),json);
 const walk=(v,key)=>{
  if(Array.isArray(v))return v.forEach(x=>walk(x,key));
  if(v&&typeof v==='object'){for(const [k,x] of Object.entries(v)){a.ok(KEYS.has(k),'key '+k);walk(x,k);}return;}
  if(key==='clipId')return a.match(v,SHORT_ID,'clipId '+v);
  if(key==='kind')return a.ok(v==='video'||v==='audio','kind '+v);
  if(key==='score'&&v===null)return;
  a.ok(typeof v==='number'&&Number.isFinite(v),key+' '+JSON.stringify(v));
 };
 walk(f,'');
 a.deepEqual(f.clips.map(c=>c.clipId),['c_v1','c_a2'],'the clip with a path for an id is left out');
 a.equal(f.highlights.length,1);
});

// JJ's final words (2026-11-03), as written: the fold's title, and above the facts once opened, what they hold
test('the review box: the fold says what is sent, opens to the explanation and then the facts as sent',()=>{
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/<details data-facts-note><summary>\{t\.factsTitle\}<\/summary><p data-facts-explain>\{t\.factsExplain\}<\/p><pre data-facts-raw>\{JSON\.stringify\(MontClipAgentPane\.messageFacts\(review\?\.messages\?\.at\(-1\)\?\.content\|\|''\),null,2\)\}<\/pre><\/details>/);
 a.ok(!pane.includes('t.factsNote'));
 a.match(read('app/cindy-official.js'),/data-facts-explain/,'the bundle was rebuilt');
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_factsTitle,'还会附上时间线的数字 · 点开看原文');
 a.equal(en.officialPane_factsTitle,'Timeline numbers are also sent · click to see them');
 a.equal(zh.officialPane_factsExplain,'每段录像有多长、每个片段用到哪一部分，以及已经找到的高光候选的起止和分数。不含文件名、字幕文字、画面和声音。下面就是原样发出去的内容：');
 a.equal(en.officialPane_factsExplain,'How long each recording is, which part each clip uses, and the start, end and score of the highlight candidates already found. No file names, subtitle text, pictures or sound. This is exactly what is sent:');
 a.equal(zh.officialPane_factsNote,undefined);a.equal(en.officialPane_factsNote,undefined);
});

// Deja (on #87): a clip left out for its id must not vanish silently — the review box says how many, in JJ's words
// (「有 {n} 个片段的编号不认识，没有附上」, wording for JJ to settle). Two kinds of id that are not short ids:
const shot=(id,start)=>({id,kind:'audio',mediaId:'m2',track:'A1',start,in:0,duration:10,props:{}});
const withIds=ids=>({media:[{id:'m2',name:'b.wav',src:'/media/b.wav',kind:'audio',duration:120}],clips:[shot('c_ok',0),...ids.map((id,i)=>shot(id,20+i*20))]});
const omittedShown=n=>{
 const pane=read('agent-ui/pane.tsx'),line=pane.indexOf('<p data-facts-omitted>');
 a.ok(line>0,'the line is in the review box');
 a.ok(line>pane.indexOf('</details>',pane.indexOf('<details data-facts-note>')),'outside the fold: seen without opening it');
 // one clip: its own sentence (factsOmittedOne), as the strings with -one do elsewhere
 a.match(pane,/\{factsOmitted>0&&<p data-facts-omitted>\{factsOmitted===1\?t\.factsOmittedOne:t\.factsOmitted\.replace\('\{n\}',String\(factsOmitted\)\)\}<\/p>\}/);
 a.match(pane,/setFactsOmitted\(options\.getFactsOmitted\?\.\(\)\|\|0\)/,'counted when the box opens');
 a.ok(read('app/app.js').includes('getFactsOmitted:()=>MontClipFacts.omitted(projectJSON(),{selected:selectedClips().map(c=>c.id)}),'));
 a.match(read('app/cindy-official.js'),/data-facts-omitted/,'the bundle was rebuilt');
 a.equal(View.text['zh-CN'].officialPane_factsOmitted.replace('{n}',String(n)),`有 ${n} 个片段这次没附上时间信息，AI 看不到它们在哪。不影响发送。`);
 a.equal(View.text.en.officialPane_factsOmitted.replace('{n}',String(n)),`Timing for ${n} clips wasn't included, so the AI won't see where they are. Sending still works.`);
};
test('an id that is a path or a web address: not in the facts, and the box says how many were left out',()=>{
 const bad=['C:/Users/主播/Videos/a.flv','D:\录像\b.mp4','/media/私密/c.mp4','../media/d.mp4','https://example.com/v/e.mp4','file:///C:/f.mov'];
 const d=withIds(bad),json=JSON.stringify(Facts.build(d,{highlights:[{from:20,to:25,score:0.5}]}));
 for(const s of bad)a.ok(!json.includes(s)&&!json.includes(JSON.stringify(s).slice(1,-1)),'leaked: '+s);
 a.ok(!/https?:|file:|[\/]/.test(json),json);
 a.deepEqual(JSON.parse(json).clips.map(c=>c.clipId),['c_ok']);
 a.equal(JSON.parse(json).highlights,undefined,'a highlight inside a left-out clip is not placed on it');
 a.equal(Facts.omitted(d),bad.length);
 omittedShown(bad.length);
});
test('an id with Chinese in it: not in the facts, and the box says how many were left out',()=>{
 const bad=['片段一','clip_一','高光-03','c１'];
 const d=withIds(bad),json=JSON.stringify(Facts.build(d));
 for(const s of bad)a.ok(!json.includes(s),'leaked: '+s);
 a.ok(!/[^\x00-\x7f]/.test(json),json);
 a.equal(Facts.omitted(d),bad.length);
 omittedShown(bad.length);
});
test('nothing left out: no count; only clips that would have been sent count (captions, disabled, ramps do not)',()=>{
 a.equal(Facts.omitted(withIds([])),0);
 const d=withIds(['片段一']);d.clips.push({...shot('片段二',200),disabled:true},{id:'字幕',kind:'text',mediaId:null,track:'V2',start:0,in:0,duration:3,props:{text:'x',caption:true}});
 a.equal(Facts.omitted(d),1);
});
test('the facts and the proposals check ids by the same rule',()=>{
 a.equal(Facts.SHORT_ID.source,'^[A-Za-z0-9_-]{1,128}$');
 a.match(read('shared/capabilities.js'),/clipId: \{ type: "string", pattern: "\^\[A-Za-z0-9_-\]\{1,128\}\$" \}/);
 a.ok(read('app/chat-proposal.js').includes('/'+Facts.SHORT_ID.source+'/.test(v)'),'chat-proposal.js identity()');
});

// JJ's final words (2026-11-03), as written; n = 1 in English says "it" (Deja's change for agreement). No 「编号」 / "IDs":
// the streamer does not know clips have ids
test('the left-out line in JJ\'s final words: one clip and several, in Chinese and English, never 编号 / IDs',()=>{
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_factsOmittedOne,'有 1 个片段这次没附上时间信息，AI 看不到它在哪。不影响发送。');
 a.equal(zh.officialPane_factsOmitted,'有 {n} 个片段这次没附上时间信息，AI 看不到它们在哪。不影响发送。');
 a.equal(en.officialPane_factsOmittedOne,"Timing for 1 clip wasn't included, so the AI won't see where it is. Sending still works.");
 a.equal(en.officialPane_factsOmitted,"Timing for {n} clips wasn't included, so the AI won't see where they are. Sending still works.");
 for(const s of [zh.officialPane_factsOmittedOne,zh.officialPane_factsOmitted,en.officialPane_factsOmittedOne,en.officialPane_factsOmitted])a.ok(!/编号|IDs?\b/.test(s),s);
});

// The 「AI 数据说明」 says what is sent is "你选中的片段的时间、长度这类数字" (JJ v5; QQ via Deja, 2026-11-04): only the
// selected clips go out, their highlights with them, and nothing about the timeline when nothing is selected.
test('only the selected clips: the others, their highlights and their left-out count stay home; none selected, none sent',()=>{
 const hl=[{from:20,to:40,score:0.8},{from:320,to:330,score:0.5}];
 const one=Facts.build(doc,{selected:['c_a2'],highlights:hl});
 a.deepEqual(one.clips.map(c=>c.clipId),['c_a2']);a.deepEqual(one.highlights.map(h=>h.clipId),['c_a2'],'only the highlight inside it');
 a.deepEqual(Facts.build(doc,{selected:[],highlights:hl}),{clips:[]},'nothing selected: no clip, no highlight');
 a.deepEqual(Facts.build(doc,{selected:['cap1']}),{clips:[]},'a selected caption is not a shot, and its text never goes');
 a.equal(Facts.omitted(doc,{selected:['c_v1']}),0);a.equal(Facts.omitted(doc,{selected:['C:/Users/主播/a.mp4']}),1);
 // the editor asks for the selected clips, for the facts and for the left-out count
 const app=read('app/app.js');
 a.ok(app.includes('getFacts:()=>{const doc=projectJSON(),h=runtime.highlightFacts,s=runtime.soundFacts;return MontClipFacts.build(doc,{selected:selectedClips().map(c=>c.id),'));
 a.ok(app.includes('getFactsOmitted:()=>MontClipFacts.omitted(projectJSON(),{selected:selectedClips().map(c=>c.id)}),'));
});
