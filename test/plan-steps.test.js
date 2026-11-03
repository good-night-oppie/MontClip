'use strict';
// Deja (2026-11-03): 「找出每首歌」「找高光」「导出」 become steps a plan can really do, so 「把我唱歌的部分一首一个切片剪出来」
// runs from start to end: find the songs → keep them, one clip each → export through the system's Save window. A step can
// use what an earlier step found: {"$step": n} in its args stands for step n's ranges. Pure helpers here; the page runs
// the steps (app.js) and the main process still decides each one (agent-policy.js).
const {test}=require('node:test'),a=require('node:assert/strict');
const S=require('../plan-steps');

const clips=[
 {id:'v1',kind:'video',mediaId:'m1',track:'V1',start:0,in:0,duration:600,props:{volume:0}},
 {id:'a1',kind:'audio',mediaId:'m1',track:'A1',start:0,in:0,duration:600,props:{}},
 {id:'v2',kind:'video',mediaId:'m2',track:'V1',start:600,in:100,duration:200,props:{}},
];

test('songs found in a recording become ranges of its clip on the timeline, one per song, named 第 N 首',()=>{
 const r=S.rangesFromSongs([{mediaId:'m1',songs:[{from:60,to:200},{from:280,to:430}]}],clips);
 a.deepEqual(r,[{clipId:'v1',from:60,to:200,label:'第 1 首'},{clipId:'v1',from:280,to:430,label:'第 2 首'}]);
 // the part of a recording the timeline shows: a song outside it is left out, one across its edge is cut to it
 const m2=S.rangesFromSongs([{mediaId:'m2',songs:[{from:0,to:50},{from:80,to:150},{from:250,to:400}]}],clips);
 a.deepEqual(m2,[{clipId:'v2',from:100,to:150,label:'第 1 首'},{clipId:'v2',from:250,to:300,label:'第 2 首'}]);
 a.deepEqual(S.rangesFromSongs([{mediaId:'nope',songs:[{from:1,to:9}]}],clips),[],'a recording not on the timeline');
 a.deepEqual(S.rangesFromSongs([{mediaId:'m1',songs:[{from:10,to:10.2}]}],clips),[],'shorter than half a second');
});

test('highlights: the best ones by score, in time order, named 高光 N',()=>{
 const cards=[{mediaId:'m1',cards:[{from:10,to:40,score:0.5},{from:100,to:130,score:0.9},{from:300,to:320,score:0.7}]}];
 a.deepEqual(S.rangesFromHighlights(cards,clips,{count:2}),[{clipId:'v1',from:100,to:130,label:'高光 1'},{clipId:'v1',from:300,to:320,label:'高光 2'}]);
 a.equal(S.rangesFromHighlights(cards,clips,{}).length,3,'every card without a count');
 a.equal(S.rangesFromHighlights(cards,clips,{count:0}).length,0);
});

test('{"$step": n} stands for step n’s ranges — only an earlier step, only ranges; anything else refused',()=>{
 const outputs=[{ranges:[{clipId:'v1',from:1,to:5,label:'第 1 首'}]},null];
 a.deepEqual(S.resolve({output_mode:'per_range',ranges:{$step:1}},outputs,3),{output_mode:'per_range',ranges:[{clipId:'v1',from:1,to:5,label:'第 1 首'}]});
 for(const [args,at] of [[{ranges:{$step:2}},3],[{ranges:{$step:3}},3],[{ranges:{$step:4}},3],[{ranges:{$step:0}},3],[{ranges:{$step:'1'}},3],[{ranges:{$step:1,x:1}},3]])
  a.throws(()=>S.resolve(args,outputs,at),/STEP_REF/,JSON.stringify(args));
 a.throws(()=>S.resolve({ranges:{$step:1}},[{ranges:[]}],2),/STEP_EMPTY/,'an earlier step that found nothing');
 const plain={output_mode:'one_file',ranges:[{clipId:'v1',from:0,to:3}]};
 a.deepEqual(S.resolve(plain,[],1),plain,'args without references stay as they are');
 const copy=S.resolve(plain,[],1);copy.ranges[0].from=9;a.equal(plain.ranges[0].from,0,'a copy');
});

test('which steps the assistant can do, and which only read',()=>{
 a.deepEqual([...S.DOABLE].sort(),['fablecut_export','fablecut_highlights','fablecut_songs','keep_ranges','keep_sentences']);
 a.ok(S.FINDS.includes('fablecut_songs')&&S.FINDS.includes('fablecut_highlights'),'finding changes nothing in the project');
});
