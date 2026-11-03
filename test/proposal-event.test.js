'use strict';
// Owner (2026-11-03): every step is an editor event, so the AI can stop and ask, every step can be undone, and a run can
// go all the way on its own. The event model is the next PR (after #71); Deja asked #71's checked proposal and its card to
// produce that event shape already: {id, runId, step, capability, args, actor, risk, state, revisionBefore, revisionAfter, at}.
// Only checked values go into args; the model's reply text never does.
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../captions'),P=require('../chat-proposal');
const KEYS=['actor','args','at','capability','id','revisionAfter','revisionBefore','risk','runId','state','step'];
function fixture(){
 const doc={revision:7,fps:30,media:[{id:'m',duration:600}],clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:100,duration:300}]};
 return {doc,context:{projectId:'p',sequenceId:'main',generation:1,revision:7},references:[],
  response:{type:'keep_ranges',output_mode:'per_range',ranges:[{clipId:'v',from:250,to:280,label:'第二首'},{clipId:'v',from:110,to:130}]}};
}
const meta={id:'e1',runId:'r1',step:1,at:'2026-11-03T10:00:00.000Z'};

test('a checked proposal becomes an event with a result to preview: exact keys, checked args only',()=>{
 const h=fixture(),e=P.event(P.prepare(h.response,h),{...meta,revision:7});
 assert.deepEqual(Object.keys(e).sort(),KEYS);
 assert.equal(e.capability,'keep_ranges');assert.equal(e.actor,'ai');assert.equal(e.risk,'edit');assert.equal(e.state,'has_result');
 assert.equal(e.revisionBefore,7);assert.equal(e.revisionAfter,null);
 assert.deepEqual(e.args,{output_mode:'per_range',ranges:[{clipId:'v',from:250,to:280,label:'第二首'},{clipId:'v',from:110,to:130}]});
});
test('keep_sentences becomes the same shape',()=>{
 const h=fixture(),cap=C.clip(C.parse('1\n00:00:10,000 --> 00:00:12,000\n句子\n')[0],{id:'c0',track:'V2'});h.doc.clips.push(cap);
 h.references=[{clipId:'c0',sourceCaptionId:'c0',text:cap.props.text,start:10,end:12}];
 const e=P.event(P.prepare({type:'keep_sentences',ranges:[{clipId:'c0',sourceCaptionId:'c0',from:10,to:12}]},h),{...meta,revision:7});
 assert.equal(e.capability,'keep_sentences');assert.deepEqual(e.args,{ranges:[{clipId:'c0',sourceCaptionId:'c0',from:10,to:12}]});
});
test('a refused reply is a failed event that carries the reason, never the reply',()=>{
 const h=fixture();h.response.ranges[0].to=999;let err;try{P.prepare(h.response,h);}catch(e){err=e;}
 const e=P.failedEvent(err,{...meta,revision:7,capability:'keep_ranges'});
 assert.deepEqual(Object.keys(e).sort(),KEYS);assert.equal(e.state,'failed');assert.deepEqual(e.args,{error:'PROPOSAL_OUT_OF_RANGE'});
 assert.equal(P.failedEvent(Error('anything else'),{...meta,revision:7,capability:'x y'}).capability,'unknown','capability names are checked too');
});
test('the states move only forward: result → applied (with revisionAfter) → undone, or result → rejected',()=>{
 const h=fixture(),e=P.event(P.prepare(h.response,h),{...meta,revision:7});
 const applied=P.transition(e,'applied',{revision:8,at:'t2'});
 assert.equal(applied.state,'applied');assert.equal(applied.revisionAfter,8);assert.equal(e.state,'has_result','events are not changed in place');
 assert.equal(P.transition(applied,'undone',{at:'t3'}).state,'undone');
 assert.equal(P.transition(e,'rejected',{at:'t2'}).state,'rejected');
 assert.throws(()=>P.transition(e,'applied',{at:'t2'}),/EVENT_REVISION/,'applying needs the revision it produced');
 for(const [from,to] of [[e,'undone'],[applied,'rejected'],[P.transition(e,'rejected',{}),'applied']])assert.throws(()=>P.transition(from,to,{revision:9}),/EVENT_STATE/);
 assert.deepEqual(P.STATES,['planned','awaiting_confirmation','running','has_result','applied','rejected','undone','failed']);
});
test('the page keeps one event per reviewed proposal and moves it on apply, cancel and undo',()=>{
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
 for(const s of ["MontClipProposal.event(","MontClipProposal.failedEvent(","transition(","'applied'","'rejected'","'undone'"])assert.ok(app.includes(s),s);
});
