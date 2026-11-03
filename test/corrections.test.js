'use strict';
// The streamer's corrections, kept on this computer to make the next search closer (the owner: 「主播的修改记在本机用来让下次
// 更准（不外发）」; Deja, 2026-11-03). What is kept: a card's kind changed, a part added, how far its start and end were moved,
// a card taken out — with the recording's length and a few numbers about the sound. Never the recording, its sound, any
// subtitle text or a file name. Used by fixed rules only (no model is trained): the mean start / end shift per kind, at most
// ±10 s; and the sound of parts marked 「不是唱歌」 raising the bar for 「唱歌」. Every card says which rule moved it. Off
// (or nothing kept) gives exactly the cards the search gave.
const {test}=require('node:test'),a=require('node:assert/strict');
const C=require('../corrections');

const loud=(values,step=0.5)=>({step,values});
// a talk-like stretch (pauses) and a held one (singing), 0.5 s bins in dB
const talk=Array.from({length:120},(_,i)=>i%4===0?-60:-25),sing=Array.from({length:120},()=>-20);
const card=(o)=>({id:'m1_s1',mediaId:'m1',kind:'song',no:1,s:100,e:220,at:100,...o});

test('a record holds numbers and its kinds only — anything else (a file name, a path, text, another key) is refused',()=>{
 const r=C.record({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:0.25}});
 a.deepEqual(Object.keys(r).sort(),['at','duration','features','from','to','type','v']);
 a.equal(typeof r.at,'number');
 for(const bad of [
  {type:'kind',from:'song',to:'other',duration:3600,name:'我的直播.mp4'},
  {type:'kind',from:'song',to:'唱歌',duration:3600},
  {type:'add',kind:'song',duration:3600,features:{len:10,title:'天空好想下雨'}},
  {type:'trim',kind:'song',startShift:'-3',endShift:2,duration:3600},
  {type:'remove',kind:'moment',duration:'C:/录像/a.flv'},
  {type:'rename',kind:'song',duration:10},
 ])a.throws(()=>C.record(bad),/CORRECTION_INVALID/,JSON.stringify(bad));
 // every string left in a record is one of its fixed words
 for(const x of [C.record({type:'add',kind:'moment',duration:600,features:{len:30,level:-30,pause:0.1}}),
  C.record({type:'trim',kind:'song',startShift:-4.5,endShift:6,duration:600}),C.record({type:'remove',kind:'song',duration:600})]){
  const strings=JSON.stringify(x).match(/"[^"]*"/g).filter((s,i,all)=>!/^"(v|at|type|kind|from|to|duration|features|len|level|pause|startShift|endShift)"$/.test(s));
  for(const s of strings)a.ok(['"kind"','"add"','"trim"','"remove"','"song"','"moment"','"other"'].includes(s),s);
 }
});

test('the sound of a part, in numbers: length, usual level, how often it pauses',()=>{
 const f=C.features({s:0,e:60},loud(talk));
 a.deepEqual(Object.keys(f).sort(),['len','level','pause']);
 a.equal(f.len,60);a.ok(f.pause>0.2,'talk pauses');
 const g=C.features({s:0,e:60},loud(sing));a.equal(g.pause,0);a.equal(g.level,-20);
 a.equal(C.features({s:0,e:60},null),null,'no sound read: no features');
});

const trims=(kind,starts,ends)=>starts.map((s,i)=>C.record({type:'trim',kind,startShift:s,endShift:ends[i],duration:3600}));
test('the mean start / end shift per kind, from at least three of that kind, and never more than ±10 s',()=>{
 const rules=C.rules([...trims('song',[-4,-6,-5],[3,5,4]),...trims('moment',[2,2],[1,1])]);
 a.deepEqual(rules.shift.song,{start:-5,end:4,n:3});
 a.equal(rules.shift.moment,undefined,'two moments are too few');
 const far=C.rules(trims('song',[-30,-40,-50],[25,60,90]));
 a.deepEqual(far.shift.song,{start:-10,end:10,n:3},'capped at ±10 s');
 a.equal(C.MAX_SHIFT,10);
});

test('parts marked 「不是唱歌」 raise the bar for 「唱歌」: a song that pauses as much as they did is not called a song',()=>{
 const notSong=[0.3,0.25,0.4].map(p=>C.record({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:p}}));
 const rules=C.rules(notSong);
 a.deepEqual(rules.songBar,{pause:0.25,n:3});
 const out=C.apply([card({id:'held'}),card({id:'talky',s:300,e:420})],rules,{loudness:{m1:loud([...Array(600).fill(-20),...talk,...talk,...Array(400).fill(-20)])},duration:{m1:3600}});
 a.equal(out.find(c=>c.id==='held').kind,'song');
 const t=out.find(c=>c.id==='talky');a.equal(t.kind,'moment');a.deepEqual(t.rules,['song-bar']);
 a.equal(C.rules(notSong.slice(0,2)).songBar,undefined,'two are too few');
});

test('applied: each card moved by its kind’s shift, inside the recording, and says which rule moved it',()=>{
 const rules=C.rules(trims('song',[-4,-6,-5],[3,5,4]));
 const [x,y]=C.apply([card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80})],rules,{duration:{m1:3600}});
 a.equal(x.s,95);a.equal(x.e,224);a.deepEqual(x.rules,['shift-start:song','shift-end:song']);
 a.equal(y.s,50);a.deepEqual(y.rules,[],'no rule for moments');
 const [z]=C.apply([card({s:2,e:3598})],rules,{duration:{m1:3600}});
 a.equal(z.s,0);a.equal(z.e,3600,'kept inside the recording');
});

test('off, or nothing kept: exactly the cards the search gave',()=>{
 const cards=[card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80,reasons:[{signal:'loudness',value:6}]})],copy=JSON.stringify(cards);
 a.equal(JSON.stringify(C.apply(cards,null,{duration:{m1:3600}})),copy,'off');
 a.equal(JSON.stringify(C.apply(cards,C.rules([]),{duration:{m1:3600}})),copy,'nothing kept');
 a.equal(JSON.stringify(cards),copy,'the input is not changed');
});

test('a summary for the assistant is numbers only (sent only when the streamer opens it and agrees — not wired yet)',()=>{
 const s=C.summary([...trims('song',[-4,-6,-5],[3,5,4]),C.record({type:'remove',kind:'moment',duration:600})]);
 a.deepEqual(s,{count:4,byType:{kind:0,add:0,trim:3,remove:1},shift:{song:{start:-5,end:4,n:3}},songBar:null});
});
