/* Model output is data, never an edit/tool program. Two shapes:
   keep_sentences — only quoted whole sentences (the user's own references);
   keep_ranges    — source-second ranges of a media clip, one file or one slice per range.
   Every key and value is checked here; the cut itself is the existing range engine. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../shared/captions'),require('../shared/range-plan'),require('./agent-events'));else root.MontClipProposal=factory(root.MontClipCaptions,root.MontClipRangePlan,root.MontClipEvents);})(typeof self!=='undefined'?self:this,function(C,R,Events){
'use strict';
const MAX_RANGES=100,MIN_RANGE=0.5,MAX_JSON=32768,MAX_LABEL=80,MODES=['one_file','per_range'];
const fail=code=>{throw Error(code);};
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
function exact(o,keys,optional=[]){if(!plain(o))fail('PROPOSAL_INVALID');const k=Object.keys(o);if(!keys.every(x=>k.includes(x))||!k.every(x=>keys.includes(x)||optional.includes(x)))fail('PROPOSAL_INVALID');}
function identity(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);}
function checkContext(context){if(!context||typeof context.projectId!=='string'||!context.projectId||typeof context.sequenceId!=='string'||!context.sequenceId||!Number.isInteger(context.generation)||context.generation<0||!(typeof context.revision==='string'||Number.isFinite(context.revision)))fail('PROPOSAL_CONTEXT_INVALID');}
function noOverlap(keep){for(let i=0;i<keep.length;i++)for(let j=0;j<i;j++)if(Math.min(keep[i].to,keep[j].to)>Math.max(keep[i].from,keep[j].from))fail('PROPOSAL_OVERLAP');}
function result(response,doc,context,keep,extra){
 const plan=R.create(doc,keep); // existing lock/ramp/provenance/timing checks; no mutation
 const p={type:response.type,outputMode:'one_file',labels:keep.map(()=>null),...extra,context:JSON.stringify(context),signature:JSON.stringify(doc),keep,duration:plan.duration,tracks:[...new Set(doc.clips.map(c=>c.track))]};
 p.unchanged=unchanged(doc,p);
 return p;
}
/* A proposal that would leave the timeline playing exactly as it does (JJ via Deja, 2026-11-05): one video, its ranges
   one after another with no gap between them, from the timeline's start to its end — 「保留 1 段」 that is the whole edit,
   or an edit already shorter than the length asked for. Decided here, from the numbers, not by the model: the pane then
   shows no 〔查看剪辑建议〕 and says so. per_range is never unchanged: it adds a file per range to the export queue. */
function unchanged(doc,p){
 if(p.outputMode!=='one_file'||!p.keep.length)return false;
 const tol=R.boundaryTolerance(doc.fps),end=Math.max(0,...doc.clips.map(c=>c.start+c.duration));
 if(p.keep[0].from>tol||p.keep.at(-1).to<end-tol)return false;
 // Half-frame rounding applies to the whole edit, not independently to every gap.
 if(Math.abs(end-p.duration)>tol)return false;
 return p.keep.every((r,i)=>i===0||Math.abs(r.from-p.keep[i-1].to)<=tol);
}
function sentences(response,{doc,context,references}){
 exact(response,['type','ranges']);
 if(!Array.isArray(response.ranges)||!response.ranges.length||response.ranges.length>MAX_RANGES)fail('PROPOSAL_INVALID');
 const used=new Set(),keep=response.ranges.map(r=>{
  exact(r,['clipId','sourceCaptionId','from','to']);
  if(!identity(r.clipId)||!identity(r.sourceCaptionId)||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.from<0||r.to<=r.from||used.has(r.clipId))fail('PROPOSAL_INVALID');
  used.add(r.clipId);
  const c=doc.clips.find(c=>c.id===r.clipId),quoted=references.find(q=>q.clipId===r.clipId&&q.sourceCaptionId===r.sourceCaptionId&&q.start===r.from&&q.end===r.to);
  if(!C.isCaption(c)||c.disabled||(doc.disabledTracks||[]).includes(c.track)||!quoted||quoted.text!==c.props.text||r.from!==c.start||r.to!==c.start+c.duration||(c.props.captionSource?.sourceCaptionId||c.id)!==r.sourceCaptionId)fail('PROPOSAL_SOURCE_CHANGED');
  return {from:r.from,to:r.to};
 });
 noOverlap(keep);
 if(JSON.stringify(response).length>MAX_JSON)fail('PROPOSAL_TOO_LARGE');
 return result(response,doc,context,keep,{sentences:response.ranges.map(r=>({clipId:r.clipId,sourceCaptionId:r.sourceCaptionId,from:r.from,to:r.to}))});
}
/** A media clip the user can see and hear: not a caption/title, enabled, on an enabled track, with a known media length. */
function mediaClip(doc,id){
 const c=doc.clips.find(c=>c.id===id);
 if(!c||C.isCaption(c)||!['video','audio'].includes(c.kind)||c.disabled||(doc.disabledTracks||[]).includes(c.track))return null;
 const m=(doc.media||[]).find(m=>m.id===c.mediaId);
 return m&&Number.isFinite(m.duration)&&m.duration>0?{clip:c,media:m}:null;
}
function label(v){
 if(v===undefined)return null;
 if(typeof v!=='string'||!v.trim()||v.length>MAX_LABEL||/[\p{Cc}]/u.test(v))fail('PROPOSAL_INVALID');
 return v;
}
function ranges(response,{doc}){
 if(!plain(response))fail('PROPOSAL_INVALID');
 if(JSON.stringify(response).length>MAX_JSON)fail('PROPOSAL_TOO_LARGE');
 exact(response,['type','output_mode','ranges']);
 if(!MODES.includes(response.output_mode)||!Array.isArray(response.ranges)||!response.ranges.length||response.ranges.length>MAX_RANGES)fail('PROPOSAL_INVALID');
 const parsed=response.ranges.map(r=>{
  exact(r,['clipId','from','to'],['label']);
  if(!identity(r.clipId)||typeof r.from!=='number'||typeof r.to!=='number'||!Number.isFinite(r.from)||!Number.isFinite(r.to))fail('PROPOSAL_INVALID');
  return {clipId:r.clipId,from:r.from,to:r.to,label:label(r.label)};
 });
 const keep=parsed.map(r=>{
  const found=mediaClip(doc,r.clipId);if(!found)fail('PROPOSAL_CLIP_MISSING');
  const {clip,media}=found;
  if(r.from<0||r.to<=r.from||r.to>media.duration)fail('PROPOSAL_OUT_OF_RANGE');
  if(r.to-r.from<MIN_RANGE)fail('PROPOSAL_TOO_SHORT');
  if(clip.keyframes?.speed?.length)fail('PROPOSAL_SPEED_RAMP');
  const speed=Number.isFinite(clip.props?.speed)&&clip.props.speed>0?clip.props.speed:1,inPoint=clip.in||0,eps=1e-6;
  if(r.from<inPoint-eps||r.to>inPoint+clip.duration*speed+eps)fail('PROPOSAL_OUT_OF_CLIP');
  const t=x=>Math.round((clip.start+(x-inPoint)/speed)*1e6)/1e6;
  return {from:t(r.from),to:t(r.to)};
 });
 noOverlap(keep);
 return result(response,doc,null,keep,{outputMode:response.output_mode,labels:parsed.map(r=>r.label),source:parsed.map(r=>({clipId:r.clipId,from:r.from,to:r.to}))});
}
/* reframe (Deja, 2026-11-05): {"type":"reframe","aspect":"9:16"|"1:1"|"4:5"} and nothing else — a copy of the open sequence
   on that shape whose shots follow the subject (app.js runAgentReframe). Only the shapes in ASPECTS; any other key, or
   another value, is refused. A sequence already of that shape is refused too (PROPOSAL_UNCHANGED): nothing to make. */
const ASPECTS=Object.freeze({'9:16':[9,16],'1:1':[1,1],'4:5':[4,5]});
function reframe(response,{doc,context}){
 exact(response,['type','aspect']);
 if(typeof response.aspect!=='string'||!Object.hasOwn(ASPECTS,response.aspect))fail('PROPOSAL_INVALID');
 const [w,h]=ASPECTS[response.aspect];
 if(!(doc.width>0&&doc.height>0))fail('PROPOSAL_INVALID');
 if(doc.width*h===doc.height*w)fail('PROPOSAL_UNCHANGED');
 return {type:'reframe',aspect:response.aspect,outputMode:null,keep:[],labels:[],context:JSON.stringify(context),signature:JSON.stringify(doc),unchanged:false};
}
function prepare(response,{doc,context,references=[]}){
 checkContext(context);
 const type=plain(response)?response.type:null;
 const p=type==='keep_sentences'?sentences(response,{doc,context,references}):type==='keep_ranges'?ranges(response,{doc}):type==='reframe'?reframe(response,{doc,context}):fail('PROPOSAL_INVALID');
 p.context=JSON.stringify(context);return p;
}
function current(p,doc,context){return !!p&&p.context===JSON.stringify(context)&&p.signature===JSON.stringify(doc);}
/** File names for per-range slices: "<label>-01", the project name (else 切片) when a range has no usable label. */
function sliceNames(labels,projectName,safe){
 const fallback=safe(String(projectName||''),'切片');
 return labels.map((l,i)=>safe(typeof l==='string'?l:'',fallback)+'-'+String(i+1).padStart(2,'0'));
}
/* Editor events (owner, 2026-11-03: every step is an event; the AI stops to ask where the host says so, every step can be
   undone, a run can go all the way on its own). The event log itself comes in the next PR; a checked proposal already
   has the shape {id, runId, step, capability, args, actor, risk, state, revisionBefore, revisionAfter, at}.
   args holds the checked values only, never the model's reply. Events are not changed in place. */
const {STATES,transition}=Events; // one definition: agent-events.js
const CAPABILITIES=['keep_sentences','keep_ranges','reframe'];
function shell(m,capability,state,args){return {id:String(m.id),runId:String(m.runId),step:m.step,capability,args,actor:m.actor||'ai',risk:'edit',state,revisionBefore:m.revision??null,revisionAfter:null,at:m.at};}
function event(p,m){
 const args=p.type==='reframe'?{aspect:p.aspect}:p.type==='keep_ranges'
  ?{output_mode:p.outputMode,ranges:p.source.map((r,i)=>p.labels[i]==null?{...r}:{...r,label:p.labels[i]})}
  :{ranges:p.sentences.map(r=>({...r}))};
 return shell(m,p.type,'has_result',args);
}
function failedEvent(error,m){
 const code=error&&/^PROPOSAL_[A-Z_]+$/.test(error.message)?error.message:'PROPOSAL_INVALID';
 return shell(m,CAPABILITIES.includes(m.capability)?m.capability:'unknown','failed',{error:code});
}
return {prepare,current,sliceNames,event,failedEvent,transition,STATES,MAX_RANGES,MIN_RANGE,ASPECTS};
});
