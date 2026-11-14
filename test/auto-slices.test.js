'use strict';
// P3 「✨ 自动出切片」 (Deja 2026-11-03; frozen design documents/2026-11-03-自动出切片-冻结设计/, v7 with v7.5 last): what the
// dialog shows, worked out from the found songs (songs.js), each recording's loudness and the highlight candidates
// (highlight-candidates.js). Pure: no page, no server. Every song card is 「估的」 at both ends (Deja: songs.js is not
// accurate enough to call anything 准); a highlight's ends follow its sentences or silences.
const {test}=require('node:test'),a=require('node:assert/strict');
const A=require('../shared/auto-slices');

const flat=(dur,db=-30)=>({step:0.5,values:new Array(Math.round(dur/0.5)).fill(db)});
function loud(dur,spans){const l=flat(dur);for(const [f,t,db] of spans)for(let i=Math.round(f/0.5);i<Math.round(t/0.5);i++)l.values[i]=db;return l;}
const song=(from,to)=>({from,to,confidence:'likely',marks:[]});
const moment=(from,to,score)=>({from,to,score,reasons:[{signal:'loudness',value:8,peak:12,baseline:-30,window:[from,to]}]});
// one 3-hour recording: three songs, three talk highlights (one inside a song)
const REC={mediaId:'m1',duration:10800,
 songs:[song(1000,1240),song(4000,4260),song(8000,8200)],
 loudness:loud(10800,[[1000,1240,-14],[4000,4260,-20],[4100,4145,-10],[8000,8200,-24],[6000,6030,-12]]),
 highlights:[moment(6000,6030,0.3),moment(1100,1130,0.4),moment(9000,9040,0.2),moment(9500,9520,0.05)]};

test('the choices: what the stream is mostly, how many at most, how long each',()=>{
 a.deepEqual(A.KINDS,['auto','sing','chat','game','watch']);a.deepEqual(A.LENS,['song','hook','short']);
 a.deepEqual(A.COUNTS,[3,5,8,12]);a.equal(A.DEFAULTS.count,5);a.equal(A.DEFAULTS.checked,3);a.equal(A.DEFAULTS.kind,'auto');a.equal(A.DEFAULTS.len,'song');
});
test('let it look (auto): songs and highlights together, best first; a highlight inside a song is left out; at most `count`; the best 3 ticked',()=>{
 const r=A.build({recordings:[REC]});
 a.equal(r.clips.length,5,'5 of the 6 left after the one inside a song');
 a.ok(!r.clips.some(c=>c.kind==='moment'&&c.s===1100),'the highlight inside the first song is left out');
 a.deepEqual(r.clips.map(c=>c.on),[true,true,true,false,false]);
 for(let i=1;i<r.clips.length;i++)a.ok(r.clips[i-1].score>=r.clips[i].score,'best first');
 a.equal(r.clips[0].kind,'song');a.equal(r.clips[0].s,1000,'the loudest song (+16 dB) first');
 a.equal(r.few,null);a.equal(r.found,5);
});
test('singing: songs only; chatting, games, watching together: highlights only',()=>{
 a.ok(A.build({recordings:[REC],kind:'sing'}).clips.every(c=>c.kind==='song'));
 for(const kind of ['chat','game','watch']){const r=A.build({recordings:[REC],kind});a.ok(r.clips.length&&r.clips.every(c=>c.kind==='moment'),kind);}
});
test('fewer good ones than asked: all of them, all ticked, and it says how many it found against the most asked',()=>{
 const r=A.build({recordings:[REC],kind:'sing',count:5});
 a.equal(r.clips.length,3);a.ok(r.clips.every(c=>c.on));a.deepEqual(r.few,{found:3,count:5});
});
test('each end starts at its found level (v8: songs with nothing guessed and highlights 比较可能); songs are numbered by their place in the recording',()=>{
 const r=A.build({recordings:[REC],kind:'auto',count:12});
 for(const c of r.clips)for(const w of ['s','e'])a.equal(A.edgeLevel(c,w),'likely',c.id+w);
 a.deepEqual(r.clips.filter(c=>c.kind==='song').map(c=>[c.s,c.no]).sort((x,y)=>x[0]-y[0]),[[1000,1],[4000,2],[8000,3]]);
});
test('only the best part (hook) and 30 s – 1 min (short): a song becomes its loudest 45 s, inside the song',()=>{
 for(const len of ['hook','short']){
  const r=A.build({recordings:[REC],kind:'sing',len}),s=r.clips.find(c=>c.no===2);
  a.equal(s.e-s.s,45,len);a.ok(s.s>=4000&&s.e<=4260);a.ok(s.s<=4100&&s.e>=4145,'over the loud part 4100–4145');
  a.equal(A.edgeLevel(s,'s'),'estimated','the best part of a song is picked, so its ends are 估的');
 }
 a.equal(A.build({recordings:[REC],kind:'sing',len:'song'}).clips.find(c=>c.no===2).e,4260);
});
test('a song card gives why: it sings throughout, and it is louder than usual when it is',()=>{
 const c=A.build({recordings:[REC],kind:'sing'}).clips.find(x=>x.no===1);
 a.equal(c.reasons[0].signal,'singing');
 const l=c.reasons.find(r=>r.signal==='loudness');a.ok(l&&l.value===16,'16 dB above the usual level');
});
test('times: h:mm:ss over an hour, m:ss under; nudging an end keeps it inside the recording and 5 s long at least',()=>{
 a.equal(A.hms(4324),'1:12:04');a.equal(A.hms(75),'1:15');a.equal(A.hms(0),'0:00');
 const c={s:100,e:160,s0:100,e0:160};
 a.deepEqual(A.nudge(c,'s',-5,300),{...c,s:95});
 a.equal(A.nudge(c,'s',100,300).s,155,'at least 5 s');a.equal(A.nudge(c,'e',-100,300).e,105);
 a.equal(A.nudge(c,'s',-500,300).s,0);a.equal(A.nudge(c,'e',500,300).e,300);
});
test('the whole-stream overview: the sound as an area, a numbered box per card (ticked or not), clicks find the card',()=>{
 const r=A.build({recordings:[REC]}),o=A.overview(REC,r.clips,1);
 a.ok(o.area.length>=100&&o.area.length<=201);a.ok(o.area.every(([x,y])=>x>=0&&x<=1000&&y>=0&&y<=100));
 a.equal(o.boxes.length,r.clips.length);
 const b=o.boxes[0];a.equal(b.no,1);a.equal(b.id,r.clips[0].id);a.ok(Math.abs(b.x-r.clips[0].s/10800*1000)<0.1);a.equal(b.on,true);
 a.ok(o.ticks.length>=6,'a tick every half hour');
 a.deepEqual(A.overview({...REC,loudness:null},r.clips,1).area,[],'no sound read: no area');
});
test('the bottom bar adds up the ticked ones; file names are numbered in the review order',()=>{
 const r=A.build({recordings:[REC]});
 const t=A.totals(r.clips);a.equal(t.n,3);a.equal(t.seconds,r.clips.filter(c=>c.on).reduce((x,c)=>x+c.e-c.s,0));
 a.deepEqual(A.numbered(['晴天','1:31:40 那段','第 9 首歌']),['01 晴天','02 1：31：40 那段','03 第 9 首歌'],'colons cannot be in a Windows file name');
});
test('a recording with nothing found, or no sound read: nothing to show, no crash',()=>{
 const r=A.build({recordings:[{mediaId:'m2',duration:600,songs:[],loudness:null,highlights:[]}]});
 a.deepEqual(r.clips,[]);a.deepEqual(r.few,{found:0,count:5});
 a.deepEqual(A.build({recordings:[]}).clips,[]);
});
// Deja 2026-11-03 (over the frozen design): until songs.js reaches the gate on the acceptance set, a song card is a part
// that may be singing — named by its time, never 「第 n 首歌」 — with one of three tags.
test('the naming gate: precision@15 ≥ 0.6 and recall@10 ≥ 0.6; below it a song card is named by its time',()=>{
 a.deepEqual({...A.SONG_GATE},{precision15:0.6,recall10:0.6});a.ok(Object.isFrozen(A.SONG_GATE));
 a.ok(A.SONG_MEASURED.precision15<0.6||A.SONG_MEASURED.recall10<0.6,'not reached yet');
 a.equal(A.songsTrusted(),false);
 a.equal(A.songsTrusted({precision15:0.6,recall10:0.6}),true);a.equal(A.songsTrusted({precision15:0.9,recall10:0.59}),false);
 const s=A.build({recordings:[REC],kind:'sing'}).clips[0];
 a.deepEqual(A.title(s),{key:'as-moment-name',vars:{time:A.hms(s.at)}});
 a.deepEqual(A.title(s,{trusted:true}),{key:'as-song-name',vars:{no:s.no,time:A.hms(s.at)}});
 const m=A.build({recordings:[REC],kind:'chat'}).clips[0];a.deepEqual(A.title(m),{key:'as-moment-name',vars:{time:A.hms(m.at)}});
});
test('each start and each end has its level (v8): estimated (估的) where songs.js marked it, likely (比较可能) otherwise, adjusted (你调过) while it is moved',()=>{
 const rec={...REC,songs:[{from:1000,to:1240,confidence:'estimated',marks:[{at:'end',t:1240,why:'split'}]},song(4000,4260)]};
 const r=A.build({recordings:[rec],kind:'sing',count:5});
 const est=r.clips.find(c=>c.s===1000),lik=r.clips.find(c=>c.s===4000);
 // v8 (frozen, JJ-approved): the level is per end — the start and the end each carry one
 a.equal(A.edgeLevel(est,'s'),'likely','nothing was guessed at its start');a.equal(A.edgeLevel(est,'e'),'estimated','its end was split');
 a.equal(A.edgeLevel(lik,'s'),'likely');a.equal(A.edgeLevel(lik,'e'),'likely');
 const moved=A.nudge(lik,'s',-1,10800);a.equal(A.edgeLevel(moved,'s'),'adjusted');a.equal(A.edgeLevel(moved,'e'),'likely');
 a.equal(A.edgeLevel(A.nudge(moved,'s',1,10800),'s'),'likely','moved back where it was: its own level again');
 a.equal(A.edgeLevel(A.nudge(est,'e',2,10800),'e'),'adjusted');
 const m=A.build({recordings:[REC],kind:'chat'}).clips[0];a.equal(A.edgeLevel(m,'s'),'likely');a.equal(A.edgeLevel(A.nudge(m,'e',5,10800),'e'),'adjusted');
});
