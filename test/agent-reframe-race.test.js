'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../reframe'),Seq=require('../sequences');
function harness(){
 const project={width:1920,height:1080,fps:30,media:[{id:'m',src:'/media/synthetic.mp4',width:1920,height:1080}],clips:[{id:'c',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:2,props:{}}]};
 let release,reading;const waiting=new Promise(r=>reading=r),gate=new Promise(r=>release=r),calls={sample:0,undo:0};
 const ctx={project,Reframe:R,SeqLib:Seq,state:{lockedTracks:new Set()},runtime:{projectGen:1,undo:[],seqUndo:new Map()},reframeRun:{},agentReframeRun:{},
  clipSpeed:c=>Number(c.speed)||1,projectFps:()=>project.fps,seqRoot:()=>project,getMedia:id=>project.media.find(m=>m.id===id),getClip:id=>project.clips.find(c=>c.id===id),
  pictureSize:async()=>({width:1920,height:1080}),sampleClipFrames:async()=>{calls.sample++;reading();await gate;},
  projectJSON:()=>JSON.parse(JSON.stringify(project)),projectJSONHere:()=>JSON.parse(JSON.stringify(project)),
  openSequenceName:()=>Seq.find(project,Seq.activeId(project)).name,openSequence:id=>{Seq.open(project,id);return true;},
  pushUndo:s=>{calls.undo++;ctx.runtime.undo.push(s);},uiText:()=>'',agentReframeProgress(){},agentReframeDone(){},scheduleSave(){},renderInspector(){},syncCompCrumb(){},toast(){},shownName:s=>s,DEFAULT_PROPS:{}};
 const src=fs.readFileSync(require.resolve('../app.js'),'utf8');
 vm.runInNewContext(src.slice(src.indexOf('async function runAgentReframe('),src.indexOf('/** A reframe reply:')),ctx);
 return {ctx,project,calls,waiting,release,run:()=>ctx.runAgentReframe('9:16')};
}
test('adding a clip during frame reading invalidates the plan before copying the timeline',async()=>{
 const h=harness(),pending=h.run();await Promise.race([h.waiting,pending.then(r=>{throw Error('Reframe returned before frame reading: '+JSON.stringify(r));})]);
 h.project.clips.push({...h.project.clips[0],id:'new',start:2});h.release();
 a.equal((await pending).code,'CHANGED');a.equal(h.project.sequences,undefined);a.equal(h.calls.undo,0);
});
test('64 sequences are refused before reading footage, with a distinct reason',async()=>{
 const h=harness();h.project.sequences=Array.from({length:64},(_,i)=>({id:i?'s'+i:'main',name:'Sequence '+i}));h.project.sequence='main';h.release();
 a.equal((await h.run()).code,'SEQUENCE_LIMIT');a.equal(h.calls.sample,0);a.equal(h.calls.undo,0);a.equal(h.project.sequences.length,64);
});
test('cancel while reading leaves the project and undo history alone',async()=>{
 const h=harness(),before=JSON.stringify(h.project),pending=h.run();await Promise.race([h.waiting,pending.then(r=>{throw Error('Reframe returned before frame reading: '+JSON.stringify(r));})]);h.ctx.agentReframeRun.cancel=true;h.release();
 a.equal((await pending).code,'CANCELLED');a.equal(JSON.stringify(h.project),before);a.equal(h.calls.undo,0);
});
test('a newer saved revision while reading refuses the stale reframe',async()=>{
 const h=harness(),pending=h.run();await Promise.race([h.waiting,pending.then(r=>{throw Error('Reframe returned before frame reading: '+JSON.stringify(r));})]);h.project.revision=2;h.release();
 a.equal((await pending).code,'CHANGED');a.equal(h.project.sequences,undefined);a.equal(h.calls.undo,0);
});
test('a successful reframe creates one undo that returns to the original sequence',async()=>{
 const h=harness(),before=JSON.stringify(h.project);h.release();const result=await h.run();
 a.equal(result.ok,true);a.equal(h.calls.undo,1);a.equal(Seq.activeId(h.project),result.sequence);
 const snap=h.ctx.runtime.undo.pop();a.equal(h.ctx.undoAgentReframe(snap,h.ctx.agentReframeBackOf(snap)),true);
 a.equal(Seq.activeId(h.project),'main');a.deepEqual(h.project.clips,JSON.parse(before).clips);a.equal(Seq.entries(h.project).length,1);
});
