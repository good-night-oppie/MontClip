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
 a.deepEqual(r.shift.song.start,{by:-4.5,of:4,n:5});
 a.equal(r.shift.song.end,undefined,'the ends went up 3 times of 5: no habit');
 a.equal(C.rules([trim('song',-4,1),trim('song',-6,1),trim('song',-5,1)]).shift.song,undefined,'3 are not 4');
 a.deepEqual(C.rules([trim('song',-4,1),trim('song',-6,1),trim('song',-5,1),trim('song',-2,1)]).shift.song.start,{by:-4.25,of:4,n:4},'4 of the last 4');
 // only the last 5 count: an old habit that stopped is gone
 const old=[...[-4,-4,-4,-4,-4].map(s=>trim('song',s,0)),...[3,-3,3,-3,1].map(s=>trim('song',s,0))];
 a.equal(C.rules(old).shift.song,undefined);
 a.deepEqual(C.rules([-30,-40,-50,-20,-10].map(s=>trim('song',s,0))).shift.song.start,{by:-5,of:5,n:5},'capped at 5 s');
 a.equal(C.rules([-4,-4,-4,-4].map(s=>trim('moment',s,0))).shift.song,undefined,'per kind');
});

// 互动 (ADR 39a05471): its own habits, like every kind; no rule finds it, only the streamer's moves shift it
test('互动 has its own start and end habits, and never moves the singing bar',()=>{
 a.deepEqual([...C.KINDS],['song','interaction','chat','stunt','moment','other']);
 const r=C.rules([[-3,4],[-2,5],[-4,3],[-3,4]].map(([s,e])=>trim('interaction',s,e)));
 a.deepEqual(r.shift.interaction,{start:{by:-3,of:4,n:4},end:{by:4,of:4,n:4}});a.equal(r.shift.song,undefined,'per kind');a.equal(r.bar,undefined);
 const [x]=C.apply([card({id:'i',kind:'interaction',s:600,e:660})],r,{duration:{m1:3600}});
 a.deepEqual([x.s,x.e,x.rules],[597,664,['shift-start:interaction','shift-end:interaction']]);
 // a song made 互动 is 「不是唱歌」; 互动 ↔ 普通高光 is not about singing
 a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('song','interaction',p)),{bar:true}).bar.dir,'up');
 a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('moment','interaction',p))).bar,undefined);
});
// Deja (2026-11-03, from the LOSO numbers): the bar is off by default — 0.19 of recall for 0.02 of precision is not worth it.
// Its code and tests stay (with {bar:true}); it is decided again once real corrections exist
test('the singing bar is off by default: no bar, the search keeps PAUSE 0.12',()=>{
 a.equal(C.BAR_ON,false);a.equal(Songs.DEFAULTS.PAUSE,0.12);
 const notSong=[0.05,0.08,0.06,0.07,0.05].map(p=>kind('song','other',p)),isSong=[0.15,0.2,0.16,0.18].map(p=>kind('moment','song',p));
 for(const recs of [notSong,isSong]){const r=C.rules(recs);a.equal(r.bar,undefined);a.deepEqual(C.songOptions(r),{},'PAUSE stays 0.12');a.ok(C.rules(recs,{bar:true}).bar,'on when asked');}
 const [x]=C.apply([card({})],C.rules(notSong),{});a.equal(x.rules,undefined,'no rule at all: the card as the search gave it');
});
test('the singing bar moves both ways, only on a habit, at most half its first value (with the bar on)',()=>{
 const down=C.rules([0.05,0.08,0.06,0.07].map(p=>kind('song','other',p)),{bar:true});
 a.equal(down.bar.dir,'up','「不是唱歌」 4 of 5: the bar goes up (stricter)');a.ok(down.bar.PAUSE<C.BAR_BASE&&down.bar.PAUSE>=C.BAR_RANGE[0]);
 const up=C.rules([0.15,0.2,0.16,0.18].map(p=>kind('moment','song',p)),{bar:true});
 a.equal(up.bar.dir,'down','「是唱歌」 4 of 5: the bar goes down');a.ok(up.bar.PAUSE>C.BAR_BASE&&up.bar.PAUSE<=C.BAR_RANGE[1]);
 a.equal(C.rules([0.01,0.01,0.01,0.01].map(p=>kind('song','other',p)),{bar:true}).bar.PAUSE,C.BAR_RANGE[0],'never past half');
 a.equal(C.rules([0.9,0.9,0.9,0.9].map(p=>kind('other','song',p)),{bar:true}).bar.PAUSE,C.BAR_RANGE[1]);
 a.equal(C.rules([kind('song','other',0.05),kind('other','song',0.2),kind('song','other',0.05),kind('other','song',0.2),kind('song','other',0.05)],{bar:true}).bar,undefined,'mixed: no habit');
 // the search with the bar: songs.js options; none without a rule
 a.deepEqual(C.songOptions(down),{PAUSE:down.bar.PAUSE});a.deepEqual(C.songOptions(C.rules([])),{});a.deepEqual(C.songOptions(null),{});
});

test('applied: each card moved by its kind’s habit, inside the recording, and says which rule touched it',()=>{
 const rules=C.rules([-4,-6,-5,-3].map(s=>trim('song',s,0)));
 const [x,y]=C.apply([card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80})],rules,{duration:{m1:3600}});
 a.equal(x.s,95.5);a.equal(x.e,220);a.deepEqual(x.rules,['shift-start:song']);
 a.deepEqual(y.rules,[],'no rule for moments');
 a.equal(C.apply([card({s:2,e:300})],rules,{duration:{m1:3600}})[0].s,0,'kept inside the recording');
 const bar=C.rules([0.05,0.08,0.06,0.07].map(p=>kind('song','other',p)),{bar:true});
 a.deepEqual(C.apply([card({}),card({id:'m',kind:'moment'})],bar,{})[0].rules,['song-bar']);
});

// v11 (交互说明 6e564931): a card moved by a habit keeps where it was, so 〔这次不用〕 puts that one back
test('a card moved by a habit keeps where it was; 〔这次不用〕 puts it back, without its rules',()=>{
 const rules=C.rules([-4,-6,-5,-3].map(s=>trim('song',s,0)));
 const [x,y]=C.apply([card({id:'a'}),card({id:'b',kind:'moment',s:50,e:80})],rules,{duration:{m1:3600}});
 a.deepEqual(x.was,{s:100,e:220});a.equal(y.was,undefined,'not moved, nothing kept');
 const back=C.revert(x);
 a.deepEqual([back.s,back.e,back.rules,back.was,back.notThisTime],[100,220,[],undefined,true]);
 a.deepEqual(C.revert(y),y,'a card not moved stays as it is');
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

// Deja (2026-11-03): 「不是唱歌」 counts with the bar off — the same recording searched again does not bring that part back
// as a song (a song card more than half inside a part marked 不是唱歌). The same recording is known by its length and a
// hash of its sound, never its path.
const K=(d,v)=>C.recordingKey(d,{step:0.5,values:v});
const sound=Array.from({length:7200},(_,i)=>-20-(i%37)/3);
test('a recording is known by its length and a hash of its sound: 16 hex digits, never a path',()=>{
 const k=K(3600,sound);a.match(k,/^[a-f0-9]{16}$/);a.equal(K(3600,sound.slice()),k,'the same recording, the same key');
 a.notEqual(K(3601,sound),k,'another length');const v=sound.slice();v[100]+=3;a.notEqual(K(3600,v),k,'another sound');
 a.equal(C.recordingKey(3600,null),null);a.equal(C.recordingKey(3600,{step:0.5,values:[]}),null);a.equal(C.recordingKey(NaN,{step:0.5,values:sound}),null);
});
test('a 不是唱歌 record may carry the recording key and the part, numbers only',()=>{
 const k=K(3600,sound),r=C.record({type:'kind',from:'song',to:'other',duration:3600,rec:k,s:100,e:220});
 a.deepEqual([r.rec,r.s,r.e],[k,100,220]);
 for(const bad of [{rec:'C:/录像/a.flv',s:100,e:220},{rec:k},{rec:k,s:100},{rec:k,s:220,e:100},{rec:k,s:100,e:4000},{rec:k.toUpperCase(),s:100,e:220},{s:100,e:220}])
  a.throws(()=>C.record({type:'kind',from:'song',to:'other',duration:3600,...bad}),/CORRECTION_INVALID/,JSON.stringify(bad));
});
// VV on 12f4f21 / Deja: 「不是唱歌」 means "this part is not a song", not "I don't want this part" — the same recording
// searched again shows it as the kind the streamer gave it, where they had it (its start and end), marked as their change
// (changedFrom, the rule not-song); only a part they also took out (不要这条) stays away
test('the same recording searched again: a part marked 不是唱歌 comes back as the kind it was given, where it was — one mark is enough, the bar off',()=>{
 const k=K(3600,sound),k2=K(1800,sound.slice(0,3600));
 const marked=C.record({type:'kind',from:'song',to:'interaction',duration:3600,rec:k,s:100,e:220});
 const r=C.rules([marked]);a.equal(r.bar,undefined);a.deepEqual(r.notSong,[{rec:k,s:100,e:220,to:'interaction'}]);
 const cards=[card({id:'a',s:110,e:230,reasons:[{kind:'song'}]}),card({id:'b',s:200,e:320}),card({id:'c',kind:'moment',s:100,e:220}),card({id:'d',mediaId:'m2',s:100,e:220}),card({id:'e',mediaId:'m3',s:100,e:220})];
 const out=C.apply(cards,r,{duration:{m1:3600,m2:1800,m3:3600},recKey:{m1:k,m2:k2}});
 a.deepEqual(out.map(c=>[c.id,c.kind,c.s,c.e]),[['a','interaction',100,220],['b','song',200,320],['c','moment',100,220],['d','song',100,220],['e','song',100,220]],
  'a: 110 of its 120 s marked — the streamer\'s kind, their start and end; b: 20 of 120 s, a song still; c: not a song; d: another recording; e: no key');
 a.equal(out[0].changedFrom,'song');a.deepEqual(out[0].rules,['not-song']);a.deepEqual(out[0].reasons,[],'not the singing reasons');
 a.equal(out[1].changedFrom,undefined);
 // two song cards inside one marked part: one card for the part
 a.deepEqual(C.apply([card({id:'p',s:100,e:160}),card({id:'q',s:160,e:220})],r,{recKey:{m1:k}}).map(c=>[c.id,c.kind,c.s,c.e]),[['p','interaction',100,220]]);
 // exactly half is not more than half
 a.deepEqual(C.apply([card({id:'h',s:160,e:280})],r,{recKey:{m1:k}}).map(c=>[c.id,c.kind]),[['h','song']]);
 // 「是唱歌」 marks nothing away
 const isSong=C.record({type:'kind',from:'other',to:'song',duration:3600,rec:k,s:100,e:220});
 a.deepEqual(C.rules([isSong]).notSong,undefined);
 // off, or the record undone (not kept): the cards as the search gave them
 a.equal(JSON.stringify(C.apply(cards,C.rules([]),{recKey:{m1:k}})),JSON.stringify(cards));
});

// Deja (2026-11-03, from v12): 聊天 and 整活 are kinds like 互动 — their own habits, no rule finds them, the bar untouched
test('chat and stunt: kept, their own habits per kind, never found by a rule, a song made chat or stunt is 不是唱歌',()=>{
 for(const k of ['chat','stunt']){
  a.equal(C.record({type:'add',kind:k,duration:600}).kind,k);a.equal(C.record({type:'kind',from:'moment',to:k,duration:600}).to,k);
  const r=C.rules([[-2,3],[-3,2],[-2,2],[-4,3]].map(([s,e])=>trim(k,s,e)));
  a.deepEqual(Object.keys(r.shift),[k],'only its own kind');a.equal(r.shift[k].start.of,4);
  const [x,y]=C.apply([card({id:'x',kind:k,s:600,e:660}),card({id:'y',kind:'moment',s:600,e:660})],r,{duration:{m1:3600}});
  a.deepEqual([x.kind,x.s,x.e],[k,597.25,662.5]);a.deepEqual([y.s,y.e,y.kind],[600,660,'moment'],'no rule turns a card into it');
  a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('song',k,p)),{bar:true}).bar.dir,'up','a song made '+k+' is 不是唱歌');
  a.equal(C.rules([0.05,0.06,0.07,0.05].map(p=>kind('moment',k,p)),{bar:true}).bar,undefined,'not about singing');
 }
});

// 不要这条 on that part as well: then it stays away. A taking-out record may say which recording and part, like a kind change
test('a part marked 不是唱歌 and taken out (不要这条) stays away when the same recording is searched again',()=>{
 const k=K(3600,sound);
 const rm=C.record({type:'remove',kind:'interaction',duration:3600,rec:k,s:100,e:220});a.deepEqual([rm.rec,rm.s,rm.e],[k,100,220]);
 for(const bad of [{rec:k},{rec:k,s:100},{rec:'C:/a.flv',s:100,e:220},{s:100,e:220}])a.throws(()=>C.record({type:'remove',kind:'moment',duration:3600,...bad}),/CORRECTION_INVALID/);
 const marked=C.record({type:'kind',from:'song',to:'moment',duration:3600,rec:k,s:100,e:220});
 const r=C.rules([marked,rm]);
 a.deepEqual(C.apply([card({id:'a',s:110,e:230}),card({id:'b',s:300,e:420})],r,{recKey:{m1:k}}).map(c=>[c.id,c.kind]),[['b','song']]);
 // taken out in another recording, or another part: the marked part still comes back as the streamer's kind
 const other=C.record({type:'remove',kind:'moment',duration:3600,rec:K(3601,sound),s:100,e:220}),elsewhere=C.record({type:'remove',kind:'moment',duration:3600,rec:k,s:500,e:620});
 for(const x of [other,elsewhere])a.deepEqual(C.apply([card({id:'a',s:110,e:230})],C.rules([marked,x]),{recKey:{m1:k}}).map(c=>[c.id,c.kind]),[['a','moment']]);
 // a plain taking-out (no kind change) changes nothing on the next search
 a.deepEqual(C.apply([card({id:'a',s:110,e:230})],C.rules([rm]),{recKey:{m1:k}}).map(c=>[c.id,c.kind]),[['a','song']]);
});

// VV on 12f4f21 / Deja: a card the streamer added (补一段) is back when the same recording is searched again — its kind,
// its start and end, 你补的; another recording does not get it. The record says which recording and part (numbers only);
// the name the streamer typed is text and is never kept in a record (the page holds it while it runs)
test('a part added with 补一段 comes back when the same recording is searched again, where it was, as its kind; never in another recording',()=>{
 const k=K(3600,sound),k2=K(1800,sound.slice(0,3600));
 const add=C.record({type:'add',kind:'stunt',duration:3600,rec:k,s:400,e:430,id:'00000000000000a1'});a.deepEqual([add.rec,add.s,add.e,add.id],[k,400,430,'00000000000000a1']);
 for(const bad of [{rec:k},{rec:k,s:400},{rec:'C:/a.flv',s:400,e:430},{s:400,e:430},{rec:k,s:400,e:430,name:'被骗去跳舞'},{rec:k,s:400,e:430,title:'x'}])
  a.throws(()=>C.record({type:'add',kind:'stunt',duration:3600,...bad}),/CORRECTION_INVALID/,JSON.stringify(bad));
 const r=C.rules([add]);a.deepEqual(r.added,[{rec:k,s:400,e:430,kind:'stunt',id:'00000000000000a1'}]);
 const found=[card({id:'m1_s1',s:100,e:220}),card({id:'m2_s1',mediaId:'m2',s:100,e:220})];
 const out=C.apply(found,r,{duration:{m1:3600,m2:1800},recKey:{m1:k,m2:k2}});
 a.deepEqual(out.map(c=>[c.mediaId,c.kind,c.s,c.e,!!c.added]),[['m1','song',100,220,false],['m2','song',100,220,false],['m1','stunt',400,430,true]]);
 const x=out[2];a.equal(x.keptId,'00000000000000a1');a.deepEqual(x.rules,['added']);a.ok(!out.slice(0,2).some(c=>c.id===x.id),'its own id');
 // another recording only: not there
 a.deepEqual(C.apply(found.slice(1),r,{recKey:{m2:k2}}).map(c=>c.mediaId),['m2']);
 // not moved by a habit of its kind: where the streamer put it
 const habit=[1,2,3,4,5].map(()=>trim('stunt',-4,0));
 a.deepEqual(C.apply([],C.rules([...habit,add]),{recKey:{m1:k}}).map(c=>[c.s,c.e]),[[400,430]]);
 // taken out afterwards (不要这条 on it): not back
 const rm=C.record({type:'remove',kind:'stunt',duration:3600,rec:k,s:400,e:430});
 a.deepEqual(C.apply([],C.rules([add,rm]),{recKey:{m1:k}}),[]);
 // a bigger card around it taken out — before it was added, or after — is another card: the added part still comes back
 // (the smoke caught this: a part marked 不是唱歌 and taken out, 280–431 s, held the part added at 400–430 s)
 const big=C.record({type:'remove',kind:'moment',duration:3600,rec:k,s:280,e:431});
 for(const recs of [[big,add],[add,big]])a.deepEqual(C.apply([],C.rules(recs),{recKey:{m1:k}}).map(c=>[c.s,c.e]),[[400,430]]);
 // taken out before it was added: still added
 a.deepEqual(C.apply([],C.rules([rm,add]),{recKey:{m1:k}}).map(c=>[c.s,c.e]),[[400,430]]);
 // an add without its recording (an older record): nothing comes back
 a.deepEqual(C.apply([],C.rules([C.record({type:'add',kind:'stunt',duration:3600})]),{recKey:{m1:k}}),[]);
});
