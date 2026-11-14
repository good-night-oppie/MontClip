'use strict';
// keep_ranges (Deja, 2026-11-03): the assistant may propose ranges by source seconds, not only quoted sentences.
// Model output is data: every field is checked and nothing in it is run. Synthetic documents only; no network.
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../captions'),P=require('../app/chat-proposal'),R=require('../range-plan'),V=require('../app/agent-conversation'),F=require('../agent-format'),Facts=require('../app/agent-facts');

// One 600 s recording; the timeline shows source 100–400 s from timeline 0, with its sound on A1 and a caption on V2.
function fixture(){
 const doc={revision:1,fps:30,width:1280,height:720,media:[{id:'m',name:'主播 录像.mp4',src:'/media/主播 录像.mp4',kind:'video',duration:600}],
  clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:100,duration:300,props:{volume:0},linkGroup:'g'},
   {id:'a',kind:'audio',mediaId:'m',track:'A1',start:0,in:100,duration:300,linkGroup:'g'},
   ...C.parse('1\n00:00:10,000 --> 00:00:12,000\n秘密的字幕原文\n').map((c,i)=>C.clip(c,{id:'c'+i,track:'V2'}))]};
 const context={projectId:'p',sequenceId:'main',generation:1,revision:1};
 const response={type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'v',from:250,to:280,label:'第二首'},{clipId:'v',from:110,to:130,label:'第一首'}]};
 return {doc,context,references:[],response};
}
const reject=(change,code)=>{const h=fixture();change(h);const before=JSON.stringify(h.doc);assert.throws(()=>P.prepare(h.response,h),e=>!code||e.message===code,code);assert.equal(JSON.stringify(h.doc),before,'a refused proposal changes nothing');};

test('valid ranges map source seconds to the timeline, keep the requested order and do not touch the project',()=>{
 const h=fixture(),before=JSON.stringify(h.doc),p=P.prepare(h.response,h);
 assert.equal(JSON.stringify(h.doc),before);
 assert.equal(p.type,'keep_ranges');assert.equal(p.outputMode,'one_file');
 assert.deepEqual(p.keep,[{from:150,to:180},{from:10,to:30}],'source 250–280 is timeline 150–180 (in = 100)');
 assert.deepEqual(p.labels,['第二首','第一首']);
 assert.equal(p.duration,50);assert.equal(P.current(p,h.doc,h.context),true);
 h.doc.clips[0].start=1;assert.equal(P.current(p,h.doc,h.context),false,'any edit makes it stale');
});
test('applying is the existing range plan (one new document); undoing is the old document',()=>{
 const h=fixture(),before=JSON.stringify(h.doc),p=P.prepare(h.response,h),plan=R.create(h.doc,p.keep);
 const video=plan.project.clips.filter(c=>c.kind==='video');
 assert.deepEqual(video.map(c=>[c.start,c.in,c.duration]),[[0,250,30],[30,110,20]]);
 assert.equal(plan.project.clips.filter(c=>c.kind==='audio').length,2,'the sound comes along');
 assert.deepEqual(plan.segments.map(s=>[s.output.start,s.output.end]),[[0,30],[30,50]]);
 assert.equal(JSON.stringify(h.doc),before,'the snapshot taken before applying is what undo restores');
});
test('speed: a clip played at 2× maps source seconds through its speed',()=>{
 const h=fixture();for(const c of h.doc.clips.slice(0,2)){c.props={...c.props,speed:2};c.duration=150;}
 h.response.ranges=[{clipId:'v',from:200,to:240}];
 assert.deepEqual(P.prepare(h.response,h).keep,[{from:50,to:70}]);
});
test('per_range is accepted; output_mode must be one of the two',()=>{
 const h=fixture();h.response.output_mode='per_range';assert.equal(P.prepare(h.response,h).outputMode,'per_range');
 reject(h=>h.response.output_mode='every_file','PROPOSAL_INVALID');
 reject(h=>delete h.response.output_mode,'PROPOSAL_INVALID');
});
test('out of bounds: negative, past the recording, from ≥ to, outside what the clip shows',()=>{
 reject(h=>h.response.ranges[0].from=-1,'PROPOSAL_OUT_OF_RANGE');
 reject(h=>h.response.ranges[0].to=601,'PROPOSAL_OUT_OF_RANGE');
 reject(h=>{h.response.ranges[0].from=280;h.response.ranges[0].to=280;},'PROPOSAL_OUT_OF_RANGE');
 reject(h=>{h.response.ranges[0].from=450;h.response.ranges[0].to=500;},'PROPOSAL_OUT_OF_CLIP');
 reject(h=>{h.response.ranges[0].from=90;h.response.ranges[0].to=120;},'PROPOSAL_OUT_OF_CLIP');
});
test('overlap, too short, too many, too large are refused',()=>{
 reject(h=>h.response.ranges[1]={clipId:'v',from:270,to:300},'PROPOSAL_OVERLAP');
 reject(h=>h.response.ranges[0].to=250.4,'PROPOSAL_TOO_SHORT');
 reject(h=>h.response.ranges=Array.from({length:101},(_,i)=>({clipId:'v',from:100+i*2,to:101+i*2})),'PROPOSAL_INVALID');
 reject(h=>h.response.ranges[0].label='长'.repeat(40000),'PROPOSAL_TOO_LARGE');
});
test('the clip must exist, carry media, be enabled and not be a caption',()=>{
 reject(h=>h.response.ranges[0].clipId='nope','PROPOSAL_CLIP_MISSING');
 reject(h=>h.doc.clips[0].disabled=true,'PROPOSAL_CLIP_MISSING');
 reject(h=>h.doc.disabledTracks=['V1'],'PROPOSAL_CLIP_MISSING');
 reject(h=>{h.response.ranges=[{clipId:'c0',from:10,to:12}];},'PROPOSAL_CLIP_MISSING');
 reject(h=>h.doc.media[0].duration=undefined,'PROPOSAL_CLIP_MISSING');
});
test('model output is data only: extra keys, wrong types, odd labels and identities are refused, never run',()=>{
 for(const change of [h=>h.response.run='rm -rf',h=>h.response.ranges[0].tool='MCP',h=>h.response.ranges[0].from='250',h=>h.response.ranges[0].to=Infinity,
  h=>h.response.ranges[0].clipId='../v',h=>h.response.ranges[0].label=7,h=>h.response.ranges[0].label='a\u0000b',h=>h.response.ranges[0].label='',
  h=>h.response.ranges[0].label='x'.repeat(81),h=>h.response.ranges='v',h=>h.response.ranges=[],h=>h.response.type='keep_everything',h=>h.response.ranges[0]=null])
  reject(change,'PROPOSAL_INVALID');
 reject(h=>h.response.ranges[0]=JSON.parse('{"clipId":"v","from":250,"to":280,"__proto__":{"polluted":1}}'),'PROPOSAL_INVALID');assert.equal(({}).polluted,undefined);
});
test('locks and speed ramps keep the range engine refusal',()=>{
 reject(h=>h.doc.lockedTracks=['A1']);reject(h=>h.doc.clips[0].keyframes={speed:[{t:0,v:1},{t:1,v:2}]});
});
test('keep_sentences is unchanged',()=>{
 const h=fixture(),cap=h.doc.clips[2];h.references=[{clipId:'c0',sourceCaptionId:'c0',text:cap.props.text,start:cap.start,end:cap.start+cap.duration}];
 const p=P.prepare({type:'keep_sentences',ranges:[{clipId:'c0',sourceCaptionId:'c0',from:10,to:12}]},h);
 assert.deepEqual(p.keep,[{from:10,to:12}]);assert.equal(p.type,'keep_sentences');assert.equal(p.outputMode,'one_file');
});
test('the card summary reads keep_ranges without the project (count, length, mode); malformed → no card',()=>{
 const text=JSON.stringify(fixture().response);
 assert.deepEqual(V.proposalSummary(text,[]),{count:2,duration:50,mode:'one_file'});
 assert.equal(V.proposalSummary(JSON.stringify({...fixture().response,output_mode:'per_range'}),[]).mode,'per_range');
 assert.equal(V.proposalSummary(JSON.stringify({...fixture().response,ranges:[{clipId:'v',from:2,to:1}]}),[]),null);
 assert.equal(V.proposalSummary(JSON.stringify({...fixture().response,extra:1}),[]),null);
});
test('slice file names: label and number through fileSafeName, a fallback without a label',()=>{
 const D=require('../delivery');
 assert.deepEqual(P.sliceNames(['第一首','a/b:c',undefined],'直播 回放',D.fileSafeName),['第一首-01','a-b：c-02','直播 回放-03']);
 assert.deepEqual(P.sliceNames(['‮',null],'',D.fileSafeName),['切片-01','切片-02']);
});
test('the format note explains keep_ranges and output_mode, with no numbers a model could copy',()=>{
 for(const word of ['keep_ranges','output_mode','one_file','per_range','facts','label'])assert.ok(F.FORMAT_NOTE.includes(word),word);
 assert.ok(F.FORMAT_NOTE.includes('keep_sentences'));
 assert.ok(!/"(from|to)"\s*:\s*\d/.test(F.FORMAT_NOTE));
});
test('facts for the assistant are numbers and ids only: no names, paths, caption text, pictures or sound',()=>{
 const h=fixture(),f=Facts.build(h.doc,{highlights:[{from:20,to:40,score:0.734,text:'秘密的字幕原文',reasons:[{signal:'loud'}]}]});
 assert.deepEqual(f.clips,[{clipId:'v',kind:'video',mediaDuration:600,from:100,to:400,start:0}],'one entry per shot; linked sound is not repeated');
 assert.deepEqual(f.highlights,[{clipId:'v',from:120,to:140,score:0.73}],'timeline 20–40 is source 120–140 of v');
 assert.equal(f.songs,undefined,'no song sections in this project, so none are sent');
 const s=JSON.stringify(f);for(const leak of ['主播','录像','/media','秘密','loud','字幕'])assert.ok(!s.includes(leak),leak);
 assert.ok(s.length<6000);
});
test('the conversation adds the facts to the request next to the references, and history shows only the text',()=>{
 const state={current:()=>({id:'1',draft:'剪成 30 秒',messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),getFacts:()=>Facts.build(fixture().doc,{}),id:()=>'r1'});
 const payload=conv.prepare(),content=payload.messages.at(-1).content;
 assert.ok(content.startsWith('剪成 30 秒\n\n'));
 const tail=JSON.parse(content.slice(content.indexOf('\n\n')+2));assert.deepEqual(Object.keys(tail),['references','facts']);assert.equal(tail.facts.clips[0].clipId,'v');
 const shown=require('../app/agent-pane').displayMessage(content);assert.equal(shown.text,'剪成 30 秒');assert.deepEqual(shown.references,[]);
});
test('mock model reply → card → plan: the whole path with a substitute reply (not a real model result)',async()=>{
 const h=fixture();h.response.output_mode='per_range';
 const reply={ok:true,text:'```json\n'+JSON.stringify(h.response)+'\n```',source:'mock'};
 const state={current:()=>({id:'1',draft:'一首歌一个切片',messages:[],references:[]}),complete(){}};
 const conv=V.createConversation({state,getContext:()=>({projectId:'p',sequenceId:'main',revision:1,gen:0}),service:{send:async()=>reply},getFacts:()=>Facts.build(h.doc,{}),id:()=>'r1'});
 conv.prepare();const r=await conv.confirm();assert.equal(r.source,'mock');
 assert.deepEqual(V.proposalSummary(conv.result().text,[]),{count:2,duration:50,mode:'per_range'});
 const p=P.prepare(V.parseProposal(conv.result().text),h),plan=R.create(h.doc,p.keep);
 assert.deepEqual(plan.segments.map(s=>[s.output.start,s.output.end]),[[0,30],[30,50]]);
});
