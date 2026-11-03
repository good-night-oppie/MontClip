'use strict';
// The streamer's corrections, kept on this computer to make the next search closer (the owner: 「主播的修改记在本机用来让下次
// 更准（不外发）」; Deja, 2026-11-03, ADR 补记 fb2e6964…). What is kept: a card's kind changed, a part added, how far its start
// and end were moved, a card taken out — with the recording's length and a few numbers about the sound. Never the
// recording, its sound, any subtitle text or a file name. Never sent anywhere (test/corrections-private.test.js).
// Fixed rules only (no model is trained), each a habit — the same kind, the same direction, HABIT_MIN of the last
// HABIT_WINDOW:
//   shift — a kind's start (or end) moved the same way: moved by the mean of those moves, at most ±MAX_SHIFT s;
//   bar   — 「不是唱歌」 raises the singing bar, 「是唱歌」 lowers it (songs.js PAUSE), at most half its first value either way.
// Every card says which rule touched it. Off (or nothing kept) gives exactly what the search gave.
const {test}=require('node:test'),a=require('node:assert/strict');
const C=require('../corrections'),Songs=require('../songs');

const loud=(values,step=0.5)=>({step,values});
const talk=Array.from({length:120},(_,i)=>i%4===0?-60:-25),sing=Array.from({length:120},()=>-20);
const card=(o)=>({id:'m1_s1',mediaId:'m1',kind:'song',no:1,s:100,e:220,at:100,...o});
const trim=(kind,startShift,endShift)=>C.record({type:'trim',kind,startShift,endShift,duration:3600});
const kind=(from,to,pause)=>C.record({type:'kind',from,to,duration:3600,features:{len:120,level:-25,pause}});

test('the numbers are constants: ±5 s at most, a habit is 4 of the last 5',()=>{
 a.equal(C.MAX_SHIFT,5);a.equal(C.HABIT_WINDOW,5);a.equal(C.HABIT_MIN,4);
 a.equal(C.BAR_BASE,Songs.DEFAULTS.PAUSE,'the bar starts where songs.js has it');
 a.deepEqual(C.BAR_RANGE,[C.BAR_BASE/2,C.BAR_BASE*1.5],'half its first value either way');
});

test('a record holds numbers and its kinds only — anything else (a file name, a path, text, another key) is refused',()=>{
 const r=C.record({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:0.25}});
 a.deepEqual(Object.keys(r).sort(),['at','duration','features','from','to','type','v']);
 for(const bad of [
  {type:'kind',from:'song',to:'other',duration:3600,name:'我的直播.mp4'},
  {type:'kind',from:'song',to:'唱歌',duration:3600},
  {type:'add',kind:'song',duration:3600,features:{len:10,title:'天空好想下雨'}},
  {type:'trim',kind:'song',startShift:'-3',endShift:2,duration:3600},
  {type:'remove',kind:'moment',duration:'C:/录像/a.flv'},
  {type:'rename',kind:'song',duration:10},
 ])a.throws(()=>C.record(bad),/CORRECTION_INVALID/,JSON.stringify(bad));
});

test('the sound of a part, in numbers: length, usual level, how often it pauses',()=>{
 const f=C.features({s:0,e:60},loud(talk));
 a.deepEqual(Object.keys(f).sort(),['len','level','pause']);a.ok(f.pause>0.2,'talk pauses');
 a.equal(C.features({s:0,e:60},loud(sing)).pause,0);a.equal(C.features({s:0,e:60},null),null);
});

test('a shift is a habit: the same kind and the same direction, 4 of the last 5; then the mean of those, at most ±5 s',()=>{
 const r=C.rules([trim('song',-4,3),trim('song',-6,5),trim('song',-5,-1),trim('song',-3,4),trim('song',2,0)]);
 a.deepEqual(r.shift.song.start,{by:-4.5,of:4});
 a.equal(r.shift.song.end,undefined,'the ends went up 3 times of 5: no habit');
 a.equal(C.rules([trim('song',-4,1),trim('song',-6,1),trim('song',-5,1)]).shift.song,undefined,'3 are not 4');
 a.deepEqual(C.rules([trim('song',-4,1),trim('song',-6,1),trim('song',-5,1),trim('song',-2,1)]).shift.song.start,{by:-4.25,of:4},'4 of the last 4');
 // only the last 5 count: an old habit that stopped is gone
 const old=[...[-4,-4,-4,-4,-4].map(s=>trim('song',s,0)),...[3,-3,3,-3,1].map(s=>trim('song',s,0))];
 a.equal(C.rules(old).shift.song,undefined);
 a.deepEqual(C.rules([-30,-40,-50,-20,-10].map(s=>trim('song',s,0))).shift.song.start,{by:-5,of:5},'capped at 5 s');
 a.equal(C.rules([-4,-4,-4,-4].map(s=>trim('moment',s,0))).shift.song,undefined,'per kind');
});

// 互动 (ADR 39a05471): its own habits, like every kind; no rule finds it, only the streamer's moves shift it
test('互动 has its own start and end habits, and never moves the singing bar',()=>{
 a.deepEqual([...C.KINDS],['song','interaction','moment','other']);
 const r=C.rules([[-3,4],[-2,5],[-4,3],[-3,4]].map(([s,e])=>trim('interaction',s,e)));
 a.deepEqual(r.shift.interaction,{start:{by:-3,of:4},end:{by:4,of:4}});a.equal(r.shift.song,undefined,'per kind');a.equal(r.bar,undefined);
 const [x]=C.apply([card({id:'i',kind:'interaction',s:600,e:660})],r,{duration:{m1:3600}});
 a.deepEqual([x.s,x.e,x.rules],[597,664,['shift-start:interaction','shift-end:interaction']]);
 // a song made 互动 is 「不是唱歌」; 互动 ↔ 普通高光 is not about singing
 a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('song','interaction',p))).bar.dir,'up');
 a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('moment','interaction',p))).bar,undefined);
});
test('the singing bar moves both ways, only on a habit, at most half its first value',()=>{
 const down=C.rules([0.05,0.08,0.06,0.07].map(p=>kind('song','other',p)));
 a.equal(down.bar.dir,'up','「不是唱歌」 4 of 5: the bar goes up (stricter)');a.ok(down.bar.PAUSE<C.BAR_BASE&&down.bar.PAUSE>=C.BAR_RANGE[0]);
 const up=C.rules([0.15,0.2,0.16,0.18].map(p=>kind('moment','song',p)));
 a.equal(up.bar.dir,'down','「是唱歌」 4 of 5: the bar goes down');a.ok(up.bar.PAUSE>C.BAR_BASE&&up.bar.PAUSE<=C.BAR_RANGE[1]);
 a.equal(C.rules([0.01,0.01,0.01,0.01].map(p=>kind('song','other',p))).bar.PAUSE,C.BAR_RANGE[0],'never past half');
 a.equal(C.rules([0.9,0.9,0.9,0.9].map(p=>kind('other','song',p))).bar.PAUSE,C.BAR_RANGE[1]);
 a.equal(C.rules([kind('song','other',0.05),kind('other','song',0.2),kind('song','other',0.05),kind('other','song',0.2),kind('song','other',0.05)]).bar,undefined,'mixed: no habit');
 // the search with the bar: songs.js options; none without a rule
 a.deepEqual(C.songOptions(down),{PAUSE:down.bar.PAUSE});a.deepEqual(C.songOptions(C.rules([])),{});a.deepEqual(C.songOptions(null),{});
});

test('applied: each card moved by its kind’s habit, inside the recording, and says which rule touched it',()=>{
 const rules=C.rules([-4,-6,-5,-3].map(s=>trim('song',s,0)));
 const [x,y]=C.apply([card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80})],rules,{duration:{m1:3600}});
 a.equal(x.s,95.5);a.equal(x.e,220);a.deepEqual(x.rules,['shift-start:song']);
 a.deepEqual(y.rules,[],'no rule for moments');
 a.equal(C.apply([card({s:2,e:300})],rules,{duration:{m1:3600}})[0].s,0,'kept inside the recording');
 const bar=C.rules([0.05,0.08,0.06,0.07].map(p=>kind('song','other',p)));
 a.deepEqual(C.apply([card({}),card({id:'m',kind:'moment'})],bar,{})[0].rules,['song-bar']);
});

test('off, or nothing kept: exactly what the search gave',()=>{
 const cards=[card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80,reasons:[{signal:'loudness',value:6}]})],copy=JSON.stringify(cards);
 a.equal(JSON.stringify(C.apply(cards,null,{duration:{m1:3600}})),copy,'off');
 a.equal(JSON.stringify(C.apply(cards,C.rules([]),{duration:{m1:3600}})),copy,'nothing kept');
 a.equal(JSON.stringify(cards),copy,'the input is not changed');
 const rms=[...Array(300).fill(-60),...Array(400).fill(-20),...Array(300).fill(-60)];
 a.deepEqual(Songs.find(rms,{step:0.5,complete:true,...C.songOptions(null)}),Songs.find(rms,{step:0.5,complete:true}),'the search unchanged');
});

test('nothing here is for sending: no summary for the assistant',()=>{
 a.equal(C.summary,undefined);
});
