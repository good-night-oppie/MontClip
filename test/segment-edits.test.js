'use strict';
// Two edits of the 「自动出切片」 cards (the owner: 「卡片加『这段不是唱歌』、弹窗加『补一段』」; Deja, 2026-11-03), base
// capabilities in the table, both undoable, each an event, callable by the AI too:
//   set_segment_kind — a card's kind: song (唱歌) / moment (普通高光) / other (其他)
//   add_segment      — a new card from IN–OUT, with its kind
// Each gives the cards after it, the event's args, how to undo it, and the correction it teaches (corrections.js).
const {test}=require('node:test'),a=require('node:assert/strict');
const E=require('../app/segment-edits'),Cap=require('../shared/capabilities');

const cards=()=>[{id:'m1_s1',mediaId:'m1',kind:'song',no:1,s:100,e:220,at:100},{id:'m1_m50',mediaId:'m1',kind:'moment',no:null,s:50,e:80,at:50}];

test('both are undoable capabilities in the table, with a plain sentence each',()=>{
 for(const n of ['set_segment_kind','add_segment']){const c=Cap.get(n);a.ok(c,n);a.equal(c.risk,'undoable');a.equal(c.source,'host');
  a.ok(c.summary['zh-CN']&&c.summary.en);a.equal(c.schema.type,'object');}
 a.deepEqual(Cap.get('set_segment_kind').schema.required,['id','kind']);
 // 互动 right after 唱歌 (ADR 39a05471), then 聊天 and 整活 (Deja, from v12: 补一段 offers 唱歌、互动、聊天、整活、别的)
 a.deepEqual(Cap.get('set_segment_kind').schema.properties.kind.enum,['song','interaction','chat','stunt','moment','other']);
 a.deepEqual(Cap.get('add_segment').schema.properties.kind.enum,['song','interaction','chat','stunt','moment','other']);
 a.deepEqual([...E.KINDS],['song','interaction','chat','stunt','moment','other']);
 a.deepEqual([...E.ADD_ORDER],['song','interaction','chat','stunt','other'],'补一段 in v12 order');
 a.match(Cap.get('set_segment_kind').summary['zh-CN'],/唱歌、互动、聊天、整活、普通高光或其他/);
 a.match(Cap.get('set_segment_kind').summary.en,/singing, interaction, chat, stunt, highlight or other/);
});

test('set_segment_kind: the card’s kind changes, nothing else; undone, the cards are as they were',()=>{
 const before=cards(),r=E.setKind(before,{id:'m1_s1',kind:'other'});
 a.equal(r.ok,true);
 a.deepEqual(r.cards.map(c=>c.kind),['other','moment']);a.equal(r.cards[0].s,100);
 a.deepEqual(r.event,{capability:'set_segment_kind',args:{id:'m1_s1',kind:'other'}});
 a.deepEqual(r.correction,{type:'kind',from:'song',to:'other'});
 // made 唱歌: its start and end stay where they are (Deja)
 const s=E.setKind(before,{id:'m1_m50',kind:'song'});a.deepEqual([s.cards[1].s,s.cards[1].e,s.cards[1].kind],[50,80,'song']);
 a.deepEqual(E.undo(r.cards,r.undo),before);
 a.deepEqual(before,cards(),'the input is not changed');
 a.equal(E.setKind(before,{id:'nope',kind:'song'}).code,'SEGMENT_UNKNOWN');
 a.equal(E.setKind(before,{id:'m1_s1',kind:'唱歌'}).code,'SEGMENT_INVALID');
 a.equal(E.setKind(before,{id:'m1_s1',kind:'song'}).code,'SEGMENT_SAME','no change, no event');
 // 互动: a kind like the others; its start and end stay
 const i=E.setKind(before,{id:'m1_m50',kind:'interaction'});a.deepEqual([i.cards[1].kind,i.cards[1].s,i.cards[1].e],['interaction',50,80]);
 a.deepEqual(i.correction,{type:'kind',from:'moment',to:'interaction'});
 a.equal(E.add(before,{mediaId:'m1',from:400,to:430,kind:'interaction'},{duration:{m1:3600}}).ok,true);
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

// Deja (2026-11-03, from v12): 聊天 (chat) and 整活 (stunt) are kinds a card can be set to or added as
test('chat and stunt: a card set to them, a part added as them, each teaching its own correction',()=>{
 const before=cards();
 const c=E.setKind(before,{id:'m1_m50',kind:'chat'});a.equal(c.ok,true);a.deepEqual(c.correction,{type:'kind',from:'moment',to:'chat'});
 const s=E.add(before,{mediaId:'m1',from:400,to:430,kind:'stunt'},{duration:{m1:3600}});a.equal(s.ok,true);a.equal(s.cards.at(-1).kind,'stunt');a.deepEqual(s.correction,{type:'add',kind:'stunt'});
 a.equal(E.setKind(before,{id:'m1_m50',kind:'dance'}).code,'SEGMENT_INVALID');
});
