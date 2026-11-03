'use strict';
// P1 (Deja, 2026-11-03): every step is an editor event — the streamer's, the AI's or a recipe's — in one log kept in the
// project (summaries only). The host sets the risk from the capability table; whatever the event claims is ignored.
// Undo goes by event; a whole run can be undone at once when nothing else came after it.
const {test}=require('node:test'),a=require('node:assert/strict');
const E=require('../agent-events'),P=require('../chat-proposal');
const KEYS=['actor','args','at','capability','id','revisionAfter','revisionBefore','risk','runId','state','step'];
const ev=(o={})=>({id:'e1',runId:'r1',step:1,capability:'keep_ranges',args:{output_mode:'one_file',ranges:[{clipId:'v',from:1,to:3}]},actor:'ai',risk:'read',state:'has_result',revisionBefore:3,revisionAfter:null,at:'t1',...o});

test('the log takes events of the agreed shape and sets the risk from the table',()=>{
 const log=E.createLog();const e=log.append(ev());
 a.deepEqual(Object.keys(e).sort(),KEYS);a.equal(e.risk,'undoable','keep_ranges is undoable, whatever the event said');
 a.throws(()=>log.append(ev({id:'e2',actor:'hacker'})),/EVENT_INVALID/);
 a.throws(()=>log.append(ev({id:'e3',capability:'rm_rf'})),/EVENT_BLOCKED/);
 a.throws(()=>log.append(ev({id:'e1'})),/EVENT_DUPLICATE/);
 a.throws(()=>log.append({...ev({id:'e4'}),extra:1}),/EVENT_INVALID/);
 a.equal(log.append(ev({id:'e5',actor:'streamer',capability:'manual_edit',args:{label:'trim'},state:'applied'})).risk,'undoable');
});
test('#71 uses the same states and transition (one definition)',()=>{
 a.equal(P.STATES,E.STATES);a.equal(P.transition,E.transition);
});
test('applied events settle their revision when the save writes it',()=>{
 const log=E.createLog();log.append(ev({id:'m1',actor:'streamer',capability:'manual_edit',args:{},state:'applied'}));
 log.settle(4);a.equal(log.get('m1').revisionAfter,4);
 log.settle(5);a.equal(log.get('m1').revisionAfter,4,'set once');
});
test('a run is undone as a whole only while its applied events are the newest undo entries',()=>{
 const log=E.createLog();
 for(const [id,step] of [['a1',1],['a2',2],['a3',3]])log.move(log.append(ev({id,step})).id,'applied',{revision:3+step});
 a.deepEqual(log.undoPlan('r1',['a1','a2','a3']),{ok:true,events:['a3','a2','a1']});
 a.deepEqual(log.undoPlan('r1',['m9','a1','a2','a3']),{ok:true,events:['a3','a2','a1']},'older entries below the run do not matter');
 for(const stack of [['a1','m9','a2','a3'],['a1','a2','a3','m9']]){const p=log.undoPlan('r1',stack);a.equal(p.ok,false,stack.join());a.equal(p.code,'RUN_INTERLEAVED');}
 for(const id of ['a3','a2','a1'])log.move(id,'undone');
 a.deepEqual(log.list().filter(e=>e.runId==='r1').map(e=>e.state),['undone','undone','undone']);
});
test('stored in the project as summaries: bounded count, bounded args, no media',()=>{
 const log=E.createLog();
 for(let i=0;i<E.MAX_EVENTS+20;i++)log.append(ev({id:'x'+i,args:{note:'y'.repeat(i===3?E.MAX_ARGS+10:5)}}));
 const saved=log.toJSON();a.equal(saved.version,1);a.equal(saved.events.length,E.MAX_EVENTS);
 a.ok(saved.events.every(e=>JSON.stringify(e.args).length<=E.MAX_ARGS+64));
 const back=E.createLog(saved);a.equal(back.list().length,E.MAX_EVENTS);
 a.equal(E.createLog({version:1,events:[{bad:1}]}).list().length,0,'a damaged log is dropped, not trusted');
});
