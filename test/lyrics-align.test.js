'use strict';
// P6a (Deja / the owner, 2026-11-03; ADR 本机能力边界 补记「用歌词校准听写字幕」): the streamer pastes the lyrics; the transcript's
// words are aligned to them character by character (edit distance), on this computer, nothing sent. The times stay the
// transcript's; only the wrong characters become the lyrics' ones; one lyric line is one caption. A line that aligns poorly
// is marked 「可能不对」 and is not changed unless the streamer picks it.
const {test}=require('node:test'),a=require('node:assert/strict');
const L=require('../lyrics-align');

// a synthetic transcript: each character a word, 0.3 s apart (as the local engine gives Chinese)
const words=(text,t0=10,step=0.3)=>[...text].map((w,i)=>({w,s:+(t0+i*step).toFixed(3),e:+(t0+i*step+0.25).toFixed(3)}));

test('lyrics: one line each, empty lines, LRC time tags and lines with nothing to sing dropped',()=>{
 a.deepEqual(L.lines('[00:12.30]天空好想下雨\n\n  我好想住你隔壁  \r\n[间奏]\n…\n'),['天空好想下雨','我好想住你隔壁','[间奏]']);
 a.deepEqual(L.lines(''),[]);
 a.equal(L.lines('a\n'.repeat(L.MAX_LINES+5)).length,L.MAX_LINES,'capped');
});

test('a clean match: each line gets the times of its own characters, score 1',()=>{
 const r=L.align(words('天空好想下雨我好想住你隔壁'),'天空好想下雨\n我好想住你隔壁');
 a.equal(r.ok,true);a.equal(r.lines.length,2);
 const [x,y]=r.lines;
 a.equal(x.text,'天空好想下雨');a.equal(x.original,'天空好想下雨');a.equal(x.score,1);a.equal(x.sure,true);
 a.equal(x.start,10);a.equal(x.end,+(10+5*0.3+0.25).toFixed(3));
 a.equal(y.start,+(10+6*0.3).toFixed(3));a.equal(y.text,'我好想住你隔壁');
});

test('wrong characters become the lyrics’ ones; the times stay the transcript’s',()=>{
 // 听写把「隔壁」听成「个笔」，把「下雨」听成「夏雨」
 const r=L.align(words('天空好想夏雨我好想住你个笔'),'天空好想下雨\n我好想住你隔壁');
 a.equal(r.lines[0].original,'天空好想夏雨');a.equal(r.lines[0].text,'天空好想下雨');
 a.equal(r.lines[1].original,'我好想住你个笔');a.equal(r.lines[1].text,'我好想住你隔壁');
 a.ok(r.lines[1].score<1&&r.lines[1].score>=0.7);a.equal(r.lines[1].sure,true);
 a.equal(r.lines[1].start,+(10+6*0.3).toFixed(3),'the transcript’s time');
});

test('a line the transcript barely matches is 「可能不对」; a line with nothing sung under it has no time',()=>{
 const r=L.align(words('天空好想下雨'),'天空好想下雨\n完全不一样的一句歌词在这里');
 a.equal(r.lines[0].sure,true);
 a.equal(r.lines[1].sure,false);a.equal(r.lines[1].start,null);a.equal(r.lines[1].end,null);
 const low=L.align(words('天空好想下雨我说了别的话呀'),'天空好想下雨\n我好想住你隔壁');
 a.equal(low.lines[1].sure,false,'below the bar');a.ok(low.lines[1].score<L.MIN_SCORE);
});

test('extra words in the transcript (talking between lines) go with the line before, and show in its original',()=>{
 const r=L.align(words('天空好想下雨谢谢我好想住你隔壁'),'天空好想下雨\n我好想住你隔壁');
 a.equal(r.lines[0].original,'天空好想下雨谢谢');a.equal(r.lines[1].original,'我好想住你隔壁');
 a.equal(r.lines[1].score,1);
});

test('English lyrics: letters compared without case or punctuation; a caption keeps the line as written',()=>{
 const ws=[['Never',0,0.4],['gonna',0.5,0.9],['give',1,1.3],['you',1.4,1.6],['up',1.7,2]].map(([w,s,e])=>({w,s,e}));
 const r=L.align(ws,"Never gonna give you up!");
 a.equal(r.lines[0].text,'Never gonna give you up!');a.equal(r.lines[0].original,'Never gonna give you up');a.equal(r.lines[0].score,1);
 a.deepEqual(r.lines[0].words.map(w=>[w.s,w.e]),[[0,0.4],[0.5,0.9],[1,1.3],[1.4,1.6],[1.7,2]],'each word’s time from its letters');
});

test('nothing to align, or too much, is refused, never guessed',()=>{
 a.equal(L.align([],'天空').code,'NO_WORDS');
 a.equal(L.align(words('天空'),'').code,'NO_LYRICS');
 a.equal(L.align(words('天空'),'。。。').code,'NO_LYRICS');
 a.equal(L.align(words('天'.repeat(L.MAX_CHARS+1)),'天空').code,'TOO_LONG');
 a.equal(L.align(words('天空'),'天'.repeat(L.MAX_CHARS+1)).code,'TOO_LONG');
});

test('pure: the input is not changed',()=>{
 const ws=words('天空好想夏雨'),copy=JSON.stringify(ws);L.align(ws,'天空好想下雨');a.equal(JSON.stringify(ws),copy);
});
