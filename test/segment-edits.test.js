'use strict';
// Two edits of the 「自动出切片」 cards (the owner: 「卡片加『这段不是唱歌』、弹窗加『补一段』」; Deja, 2026-11-03), base
// capabilities in the table, both undoable, each an event, callable by the AI too:
//   set_segment_kind — a card's kind: song (唱歌) / moment (普通高光) / other (其他)
//   add_segment      — a new card from IN–OUT, with its kind
// Each gives the cards after it, the event's args, how to undo it, and the correction it teaches (corrections.js).
const {test}=require('node:test'),a=require('node:assert/strict');
const E=require('../segment-edits'),Cap=require('../capabilities');

const cards=()=>[{id:'m1_s1',mediaId:'m1',kind:'song',no:1,s:100,e:220,at:100},{id:'m1_m50',mediaId:'m1',kind:'moment',no:null,s:50,e:80,at:50}];

test('both are undoable capabilities in the table, with a plain sentence each',()=>{
 for(const n of ['set_segment_kind','add_segment']){const c=Cap.get(n);a.ok(c,n);a.equal(c.risk,'undoable');a.equal(c.source,'host');
  a.ok(c.summary['zh-CN']&&c.summary.en);a.equal(c.schema.type,'object');}
 a.deepEqual(Cap.get('set_segment_kind').schema.required,['id','kind']);
 a.deepEqual(Cap.get('set_segment_kind').schema.properties.kind.enum,['song','moment','other']);
});

test('set_segment_kind: the card’s kind changes, nothing else; undone, the cards are as they were',()=>{
 const before=cards(),r=E.setKind(before,{id:'m1_s1',kind:'other'});
 a.equal(r.ok,true);
 a.deepEqual(r.cards.map(c=>c.kind),['other','moment']);a.equal(r.cards[0].s,100);
 a.deepEqual(r.event,{capability:'set_segment_kind',args:{id:'m1_s1',kind:'other'}});
 a.deepEqual(r.correction,{type:'kind',from:'song',to:'other'});
 a.deepEqual(E.undo(r.cards,r.undo),before);
 a.deepEqual(before,cards(),'the input is not changed');
 a.equal(E.setKind(before,{id:'nope',kind:'song'}).code,'SEGMENT_UNKNOWN');
 a.equal(E.setKind(before,{id:'m1_s1',kind:'唱歌'}).code,'SEGMENT_INVALID');
 a.equal(E.setKind(before,{id:'m1_s1',kind:'song'}).code,'SEGMENT_SAME','no change, no event');
});

test('add_segment: a card from IN–OUT inside the recording, after the others (their order untouched); undone, it is gone',()=>{
 const before=cards(),r=E.add(before,{mediaId:'m1',from:300,to:345.5,kind:'song'},{duration:{m1:3600}});
 a.equal(r.ok,true);
 const c=r.cards.find(x=>x.id===r.id);
 a.deepEqual({kind:c.kind,s:c.s,e:c.e,mediaId:c.mediaId,added:c.added},{kind:'song',s:300,e:345.5,mediaId:'m1',added:true});
 a.deepEqual(r.cards.map(x=>x.s),[100,50,300],'the cards are best first, not by time: the new one goes last');
 a.deepEqual(r.event,{capability:'add_segment',args:{mediaId:'m1',from:300,to:345.5,kind:'song'}});
 a.deepEqual(r.correction,{type:'add',kind:'song'});
 a.deepEqual(E.undo(r.cards,r.undo),before);
 for(const bad of [{mediaId:'m1',from:300,to:302,kind:'song'},{mediaId:'m1',from:3590,to:3700,kind:'song'},{mediaId:'m1',from:-1,to:30,kind:'song'},
  {mediaId:'m2',from:0,to:30,kind:'song'},{mediaId:'m1',from:0,to:30,kind:'x'}])
  a.equal(E.add(before,bad,{duration:{m1:3600}}).ok,false,JSON.stringify(bad));
 a.equal(E.add(before,{mediaId:'m1',from:300,to:302,kind:'song'},{duration:{m1:3600}}).code,'SEGMENT_TOO_SHORT');
});
