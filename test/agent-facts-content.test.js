'use strict';
// The review box says the timeline facts hold no file names and no subtitle text (JJ, final, 2026-11-03, on #87). This
// locks it: the facts are numbers, short clip ids and the clip's kind, whatever the project holds.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const Facts=require('../agent-facts'),View=require('../ui-preferences');

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
 a.match(read('cindy-official.js'),/data-facts-explain/,'the bundle was rebuilt');
 const zh=View.text['zh-CN'],en=View.text.en;
 a.equal(zh.officialPane_factsTitle,'还会附上时间线的数字 · 点开看原文');
 a.equal(en.officialPane_factsTitle,'Timeline numbers are also sent · click to see them');
 a.equal(zh.officialPane_factsExplain,'每段录像有多长、每个片段用到哪一部分，以及已经找到的高光候选的起止和分数。不含文件名、字幕文字、画面和声音。下面就是原样发出去的内容：');
 a.equal(en.officialPane_factsExplain,'How long each recording is, which part each clip uses, and the start, end and score of the highlight candidates already found. No file names, subtitle text, pictures or sound. This is exactly what is sent:');
 a.equal(zh.officialPane_factsNote,undefined);a.equal(en.officialPane_factsNote,undefined);
});
