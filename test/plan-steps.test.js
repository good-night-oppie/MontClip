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

// names come from the page (auto-slices.js title(): 「第 n 首歌」 only once songs.js passes Deja's gate, else 「{time} 那段」)
const name=(n,p)=>'n'+n+'@'+p.from;
test('songs found in a recording become ranges of its clip on the timeline, one per song, named by the page',()=>{
 const r=S.rangesFromSongs([{mediaId:'m1',songs:[{from:280,to:430},{from:60,to:200}]}],clips,{name});
 a.deepEqual(r,[{clipId:'v1',from:60,to:200,label:'n1@60'},{clipId:'v1',from:280,to:430,label:'n2@280'}]);
 a.throws(()=>S.rangesFromSongs([],clips),/NAME/,'no name of its own: never 「第 N 首」 behind the gate’s back');
 // the part of a recording the timeline shows: a song outside it is left out, one across its edge is cut to it
 const m2=S.rangesFromSongs([{mediaId:'m2',songs:[{from:0,to:50},{from:80,to:150},{from:250,to:400}]}],clips,{name});
 a.deepEqual(m2,[{clipId:'v2',from:100,to:150,label:'n1@100'},{clipId:'v2',from:250,to:300,label:'n2@250'}]);
 a.deepEqual(S.rangesFromSongs([{mediaId:'nope',songs:[{from:1,to:9}]}],clips,{name}),[],'a recording not on the timeline');
 a.deepEqual(S.rangesFromSongs([{mediaId:'m1',songs:[{from:10,to:10.2}]}],clips,{name}),[],'shorter than half a second');
 // a clip with a speed ramp doesn't show the file at one speed: its recording is left out
 const ramp=[{id:'r',kind:'video',mediaId:'m1',start:0,in:0,duration:600,props:{},keyframes:{speed:[{t:0,v:1},{t:5,v:2}]}}];
 a.deepEqual(S.rangesFromSongs([{mediaId:'m1',songs:[{from:60,to:200}]}],ramp,{name}),[]);
});

test('highlights: the best ones by score, in time order, named by the page',()=>{
 const cards=[{mediaId:'m1',cards:[{from:10,to:40,score:0.5},{from:100,to:130,score:0.9},{from:300,to:320,score:0.7}]}];
 a.deepEqual(S.rangesFromHighlights(cards,clips,{count:2,name}),[{clipId:'v1',from:100,to:130,label:'n1@100'},{clipId:'v1',from:300,to:320,label:'n2@300'}]);
 a.equal(S.rangesFromHighlights(cards,clips,{name}).length,3,'every card without a count');
 a.equal(S.rangesFromHighlights(cards,clips,{count:0,name}).length,0);
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
 a.deepEqual([...S.DOABLE].sort(),['export_files','find_highlights','find_songs','keep_ranges','keep_sentences']);
 a.deepEqual([...S.FINDS].sort(),['find_highlights','find_songs'],'finding changes nothing in the project');
 // every step is in the capability table, so the main process decides it like any other
 const Cap=require('../capabilities');for(const n of S.DOABLE)a.ok(Cap.get(n),n);
});

// Deja (2026-11-03): the streamer's own waiting exports wait while the plan's render — same order, none lost, put back
// however the export ends (done, failed, stopped, or an error)
const queue=()=>[{id:'s1',status:'pending'},{id:'p1',status:'pending'},{id:'s2',status:'done'},{id:'s3',status:'pending'},{id:'p2',status:'pending'},{id:'s4',status:'failed'}];
const view=(q)=>q.map(x=>x.id+':'+x.status).join(' ');
test('the streamer’s waiting exports are held while the plan’s render, in place, then put back — the order and every item kept',async()=>{
 const q=queue(),same=[...q];
 let seen;
 const r=await S.withQueueHeld(q,['p1','p2'],async()=>{seen=view(q);for(const x of q)if(x.status==='pending')x.status='done';return 'ran';});
 a.equal(r,'ran');
 a.equal(seen,'s1:held p1:pending s2:done s3:held p2:pending s4:failed','only the streamer’s waiting ones are held; the queue renders only pending');
 a.equal(view(q),'s1:pending p1:done s2:done s3:pending p2:done s4:failed','put back: still waiting, never rendered');
 a.equal(q.length,6);q.forEach((x,i)=>a.equal(x,same[i],'the same items, in the same order'));
});
test('put back when the plan’s export fails, is stopped, or throws',async()=>{
 for(const end of ['failed','cancelled']){
  const q=queue();await S.withQueueHeld(q,['p1','p2'],async()=>{for(const x of q)if(x.status==='pending')x.status=end;});
  a.equal(view(q),`s1:pending p1:${end} s2:done s3:pending p2:${end} s4:failed`,end);
 }
 const q=queue();
 await a.rejects(S.withQueueHeld(q,['p1'],async()=>{throw Error('boom');}),/boom/);
 a.equal(view(q),'s1:pending p1:pending s2:done s3:pending p2:pending s4:failed','an error puts them back too');
});
test('what the streamer does meanwhile wins: an item removed stays removed, one changed keeps its change',async()=>{
 const q=queue();
 await S.withQueueHeld(q,['p1'],async()=>{q.splice(q.findIndex(x=>x.id==='s3'),1);q.find(x=>x.id==='s1').status='cancelled';});
 a.equal(view(q),'s1:cancelled p1:pending s2:done p2:pending s4:failed');
});
