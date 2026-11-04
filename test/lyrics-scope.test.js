'use strict';
// QQ's request-changes on #85 and Deja's semantics (2026-11-03): the captions picked are the ones changed; the ones not
// picked do not change by a single character.
//  1. words come only from the picked captions; with none picked, from every unlocked caption in IN–OUT;
//  2. each new caption lies inside one picked caption; a lyric line that falls anywhere else is dropped (counted, said
//     under the comparison: 「有 {n} 行歌词对应的是你没选的字幕，没改」);
//  3. lines that align poorly are still 「可能不对」 and unticked;
//  4. apply replaces the picked captions only (the page: one undo step, selection cleared of the removed ids —
//     desktop/lyrics-smoke.cjs).
// The scene QQ found: A 0.00–1.80 「天空好想下雨」 picked, B 2.50–4.00 「谢谢老板」 not, C 4.50–6.60 「我好想住你隔壁」 picked,
// lyrics with all three lines. Before: words from A to C, A and C removed, a new 2.50–3.70 「谢谢老板」 on top of B.
const {test}=require('node:test'),a=require('node:assert/strict');
const L=require('../lyrics-align');

const said=(text,t0,step=0.3)=>[...text].map((w,i)=>({w,s:+(t0+i*step).toFixed(3),e:+(t0+i*step+0.25).toFixed(3)}));
const WORDS=[...said('天空好想下雨',0),...said('谢谢老板',2.5),...said('我好想住你隔壁',4.5)];
const A={id:'A',start:0,end:1.8},B={id:'B',start:2.5,end:4},C={id:'C',start:4.5,end:6.6};
const LYRICS='天空好想下雨\n谢谢老板\n我好想住你隔壁';
const inside=(q,c)=>q.start>=c.start-1e-6&&q.end<=c.end+1e-6;
const overlaps=(q,c)=>q.start<c.end&&q.end>c.start;
const run=(scope,picked)=>{const r=L.align(scope.words,LYRICS);return {r,p:L.plan(r,picked??r.lines.map((l,i)=>l.sure?i:-1).filter(i=>i>=0),scope.caps)};};

test('picked one after another (A, B, C): every line becomes a caption inside its own one; all three replaced',()=>{
 const s=L.scope({captions:[A,B,C],selected:['A','B','C'],words:WORDS});
 a.deepEqual(s.caps.map(c=>c.id),['A','B','C']);a.equal(s.words.length,WORDS.length);
 const {p}=run(s);
 a.deepEqual(p.cues.map(q=>q.text),['天空好想下雨','谢谢老板','我好想住你隔壁']);
 a.deepEqual(p.cues.map(q=>q.capId),['A','B','C']);
 for(const q of p.cues)a.ok(inside(q,[A,B,C].find(c=>c.id===q.capId)),q.text);
 a.deepEqual(p.replace,['A','B','C']);a.deepEqual(p.outside,[]);a.deepEqual(p.held,[]);
});

test('picked apart (A and C, not B): B’s words are not used, nothing is made over B, only A and C replaced',()=>{
 const s=L.scope({captions:[A,B,C],selected:['C','A'],words:WORDS});
 a.deepEqual(s.caps.map(c=>c.id),['A','C'],'in time order');
 a.ok(s.words.every(w=>!overlaps(w,B)),'words only from the picked captions');
 a.equal(s.words.length,13);
 const {r,p}=run(s);
 a.equal(r.lines[1].text,'谢谢老板');a.equal(r.lines[1].start,null,'nothing heard for it in A or C');
 a.deepEqual(p.cues.map(q=>q.text),['天空好想下雨','我好想住你隔壁'],'no new 「谢谢老板」');
 for(const q of p.cues)a.ok(!overlaps(q,B),'nothing over B: '+q.text);
 a.ok(inside(p.cues[0],A)&&inside(p.cues[1],C));
 a.deepEqual(p.replace,['A','C'],'B is not replaced');
 a.deepEqual(p.outside,[1],'the 「谢谢老板」 line answers to the caption not picked: counted, not made');
 // ticking it by hand changes nothing: a line outside the picked captions is never made
 a.deepEqual(L.plan(r,[0,1,2],s.caps).cues.map(q=>q.text),['天空好想下雨','我好想住你隔壁']);
 // and with B’s words wrongly in the alignment (the old range), its line still lands outside A and C: dropped, counted
 const old=L.plan(L.align(WORDS,LYRICS),[0,1,2],s.caps);
 a.deepEqual(old.cues.map(q=>q.text),['天空好想下雨','我好想住你隔壁']);a.deepEqual(old.outside,[1]);
 for(const q of old.cues)a.ok(!overlaps(q,B));
});

test('IN–OUT, nothing picked: every unlocked caption in the range; a locked one is left out, like one not picked',()=>{
 const all=L.scope({captions:[A,B,C],selected:[],inPoint:0,outPoint:7,words:WORDS});
 a.deepEqual(all.caps.map(c=>c.id),['A','B','C']);
 a.deepEqual(run(all).p.replace,['A','B','C']);
 const locked=L.scope({captions:[A,{...B,locked:true},C],selected:[],inPoint:0,outPoint:7,words:WORDS});
 a.deepEqual(locked.caps.map(c=>c.id),['A','C']);
 const {p}=run(locked);
 a.deepEqual(p.replace,['A','C']);a.deepEqual(p.outside,[1]);for(const q of p.cues)a.ok(!overlaps(q,B));
 // a caption whose middle is outside IN–OUT is not in it
 a.deepEqual(L.scope({captions:[A,B,C],selected:[],inPoint:2,outPoint:7,words:WORDS}).caps.map(c=>c.id),['B','C']);
 // nothing picked and no IN–OUT: nothing to work on
 a.equal(L.scope({captions:[A,B,C],selected:[],words:WORDS}),null);
 a.equal(L.scope({captions:[A,B,C],selected:[],inPoint:5,outPoint:5,words:WORDS}),null);
});

test('「可能不对」 lines stay unticked; picking only some keeps the others as heard, still each inside its caption',()=>{
 const ws=[...said('天空好想夏雨',0),...said('我说了别的话呀',4.5)];
 const s=L.scope({captions:[A,C],selected:['A','C'],words:ws});
 const r=L.align(s.words,'天空好想下雨\n我好想住你隔壁');
 a.equal(r.lines[1].sure,false);
 const p=L.plan(r,[0],s.caps);
 a.deepEqual(p.cues.map(q=>[q.text,q.capId]),[['天空好想下雨','A'],['我说了别的话呀','C']]);
});

test('a picked caption that would lose words to a dropped line is left as it was, and so are the lines in it',()=>{
 // one lyric line only: C’s singing goes with it as heard talking, so the line as heard runs from A into C
 const s=L.scope({captions:[A,C],selected:['A','C'],words:[...said('天空好想下雨',0),...said('我好想住你隔壁',4.5)]});
 const r=L.align(s.words,'天空好想下雨');
 const unpicked=L.plan(r,[],s.caps);
 a.deepEqual(unpicked.cues,[]);a.deepEqual(unpicked.outside,[0]);
 a.deepEqual(unpicked.replace,[],'A and C keep their words: neither is replaced');a.deepEqual(unpicked.held,['A','C']);
 // picked, the line is the lyrics with its own characters’ times: inside A, so A is replaced; C has nothing of its own
 const picked=L.plan(r,[0],s.caps);
 a.deepEqual(picked.cues.map(q=>[q.text,q.capId]),[['天空好想下雨','A']]);a.deepEqual(picked.replace,['A']);a.deepEqual(picked.held,[]);
});

test('pure: scope and plan change nothing they are given',()=>{
 const caps=[A,B,C],copy=JSON.stringify([caps,WORDS]);
 const s=L.scope({captions:caps,selected:['A','C'],words:WORDS});L.plan(L.align(s.words,LYRICS),[0,1,2],s.caps);
 a.equal(JSON.stringify([caps,WORDS]),copy);
});
