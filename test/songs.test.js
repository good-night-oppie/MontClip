'use strict';
// P2 「找出每首歌」 (Deja, 2026-11-03): whole songs found from the sound alone. The prototype is Deja's songs.cjs (MIT):
// ffmpeg's astats + aspectralstats every 0.5 s; singing is told from talk by how often the sound pauses (not by spectral
// entropy); runs are merged across short gaps and long runs split at quiet gaps. Parameters from the prototype's grid2:
// PAUSE 0.12, PAUSE_DB 14, W 30, MERGE 8, SPLIT_MIN 150, MIN_SONG 90. Each song carries how sure it is: 「估的」 where a
// boundary or a join was guessed. Synthetic signals only: a held level is singing, a level with pauses is talk.
const {test}=require('node:test'),a=require('node:assert/strict');
const S=require('../songs');
const {track}=require('./songs-synth');

test('the parameters are the prototype grid2 result, entropy unused',()=>{
 for(const [k,v] of Object.entries({step:0.5,PAUSE:0.12,PAUSE_DB:14,W:30,MERGE:8,SPLIT_MIN:150,MIN_SONG:90}))a.equal(S.DEFAULTS[k],v,k);
 a.ok(!('ENT' in S.DEFAULTS),'spectral entropy is not used');
 a.ok(Object.isFrozen(S.DEFAULTS));
});
test('held singing between talk: each song found, start and end within ±2 s, sure',()=>{
 const {rms,songs}=track([['talk',60],['song',140],['talk',80],['song',150],['talk',50]]);
 const got=S.find(rms,{complete:true});
 a.equal(got.length,2,JSON.stringify(got));
 got.forEach((g,i)=>{
  a.ok(Math.abs(g.from-songs[i][0])<=2,`song ${i} starts at ${g.from}, expected ${songs[i][0]}`);
  a.ok(Math.abs(g.to-songs[i][1])<=2,`song ${i} ends at ${g.to}, expected ${songs[i][1]}`);
  a.equal(g.confidence,'sure');a.deepEqual(g.marks,[]);
  a.deepEqual(Object.keys(g).sort(),['confidence','from','marks','to']);
 });
});
test('talk alone, or singing shorter than MIN_SONG, is no song',()=>{
 a.deepEqual(S.find(track([['talk',600]]).rms,{complete:true}),[]);
 a.deepEqual(S.find(track([['talk',60],['song',70],['talk',60]]).rms,{complete:true}),[]);
 a.deepEqual(S.find([],{complete:true}),[]);
});
test('a quiet room is no song, however steady',()=>{
 const {rms}=track([['talk',60],['song',140],['talk',60]],{songDb:-52});
 a.deepEqual(S.find(rms,{complete:true}),[]);
});
test('two songs with only a short quiet gap: joined, then split at the gap — both sides of the split are 「估的」',()=>{
 const {rms}=track([['talk',40],['song',160],['quiet',3],['song',140],['talk',40]]);
 const got=S.find(rms,{complete:true});
 a.equal(got.length,2,JSON.stringify(got));
 a.ok(Math.abs(got[0].from-40)<=2&&Math.abs(got[0].to-200)<=2,JSON.stringify(got[0]));
 a.ok(Math.abs(got[1].from-203)<=2&&Math.abs(got[1].to-343)<=2,JSON.stringify(got[1]));
 a.equal(got[0].confidence,'estimated');a.deepEqual(got[0].marks.map(m=>[m.at,m.why]),[['end','split']]);
 a.equal(got[1].confidence,'estimated');a.deepEqual(got[1].marks.map(m=>[m.at,m.why]),[['start','split']]);
});
test('a song with a short break that is not split: one song, the break marked 「估的」 inside',()=>{
 const {rms}=track([['talk',40],['song',80],['dips',28],['song',60],['talk',40]]);
 const got=S.find(rms,{complete:true});
 a.equal(got.length,1,JSON.stringify(got));
 a.ok(Math.abs(got[0].from-40)<=2&&Math.abs(got[0].to-208)<=2,JSON.stringify(got[0]));
 a.equal(got[0].confidence,'estimated');
 const m=got[0].marks.find(x=>x.why==='merged');a.ok(m&&m.at==='inside'&&m.t>=120&&m.t<=148,JSON.stringify(got[0].marks));
});
test('a song cut off by the end of the recording, or by the part not read yet, is 「估的」 at that end',()=>{
 const {rms}=track([['talk',60],['song',140]]);
 const done=S.find(rms,{complete:true});a.equal(done.length,1);a.deepEqual(done[0].marks.map(m=>[m.at,m.why]),[['end','edge']]);
 const part=S.find(rms,{complete:false});a.deepEqual(part[0].marks.map(m=>[m.at,m.why]),[['end','unread']]);
 const {rms:r2}=track([['song',140],['talk',60]]);
 a.deepEqual(S.find(r2,{complete:true})[0].marks.map(m=>[m.at,m.why]),[['start','edge']]);
});
test('missing or silent values read as the floor; the result is the same every time',()=>{
 const {rms}=track([['talk',60],['song',140],['talk',60]]);
 const holes=rms.map((v,i)=>i%97===0&&v<-50?null:v);
 a.deepEqual(S.find(holes,{complete:true}),S.find(rms,{complete:true}));
 a.deepEqual(S.find(rms.map(v=>v<-50?-Infinity:v),{complete:true}),S.find(rms.map(v=>v<-50?-90:v),{complete:true}));
});
test('stored in the project: one entry per file, checked; bad entries refused, damaged ones dropped when saved',()=>{
 const song={from:60,to:200,confidence:'sure',marks:[]};
 const e=S.entry({key:'k1',complete:true,scanned:400,songs:[song,{from:280,to:430,confidence:'estimated',marks:[{at:'end',t:430,why:'edge'}]}]});
 a.deepEqual(Object.keys(e).sort(),['complete','key','scanned','songs','v']);a.equal(e.v,1);a.equal(e.songs.length,2);
 for(const bad of [{key:'k',complete:true,scanned:1,songs:[{...song,from:300}]},{key:'k',complete:true,scanned:1,songs:[{...song,confidence:'maybe'}]},
  {key:'k',complete:true,scanned:1,songs:[{...song,marks:[{at:'end',t:1,why:'guess'}]}]},{key:'k',complete:'yes',scanned:1,songs:[]},
  {key:'k',complete:true,scanned:1,songs:[{...song,extra:1}]},{key:'k',complete:true,scanned:1,songs:new Array(S.MAX_SONGS+1).fill(song)}])
  a.throws(()=>S.entry(bad),/SONGS_INVALID/,JSON.stringify(bad).slice(0,80));
 const kept=S.clean({m_a:e,m_gone:e,m_bad:{v:1,key:'k',songs:'x'}},[{id:'m_a'}]);
 a.deepEqual(Object.keys(kept),['m_a']);a.equal(S.clean({m_bad:{}},[{id:'m_bad'}]),null);
});
