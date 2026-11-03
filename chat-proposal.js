/* Model output is data, never an edit/tool program. Only quoted whole sentences. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./captions'),require('./range-plan'));else root.MontClipProposal=factory(root.FableCutCaptions,root.FableCutRangePlan);})(typeof self!=='undefined'?self:this,function(C,R){
'use strict';
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==keys.slice().sort().join('|'))throw Error('PROPOSAL_INVALID');}
function identity(v){return typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);}
function prepare(response,{doc,context,references}){
 if(!context||typeof context.projectId!=='string'||!context.projectId||typeof context.sequenceId!=='string'||!context.sequenceId||!Number.isInteger(context.generation)||context.generation<0||!(typeof context.revision==='string'||Number.isFinite(context.revision)))throw Error('PROPOSAL_CONTEXT_INVALID');
 exact(response,['type','ranges']);
 if(response.type!=='keep_sentences'||!Array.isArray(response.ranges)||!response.ranges.length||response.ranges.length>100)throw Error('PROPOSAL_INVALID');
 const used=new Set(),keep=response.ranges.map(r=>{
  exact(r,['clipId','sourceCaptionId','from','to']);
  if(!identity(r.clipId)||!identity(r.sourceCaptionId)||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.from<0||r.to<=r.from||used.has(r.clipId))throw Error('PROPOSAL_INVALID');
  used.add(r.clipId);
  const c=doc.clips.find(c=>c.id===r.clipId),quoted=references.find(q=>q.clipId===r.clipId&&q.sourceCaptionId===r.sourceCaptionId&&q.start===r.from&&q.end===r.to);
  if(!C.isCaption(c)||c.disabled||(doc.disabledTracks||[]).includes(c.track)||!quoted||quoted.text!==c.props.text||r.from!==c.start||r.to!==c.start+c.duration||(c.props.captionSource?.sourceCaptionId||c.id)!==r.sourceCaptionId)throw Error('PROPOSAL_SOURCE_CHANGED');
  return {from:r.from,to:r.to};
 });
 for(let i=0;i<keep.length;i++)for(let j=0;j<i;j++)if(Math.min(keep[i].to,keep[j].to)>Math.max(keep[i].from,keep[j].from))throw Error('PROPOSAL_OVERLAP');
 if(JSON.stringify(response).length>32768)throw Error('PROPOSAL_TOO_LARGE');
 const plan=R.create(doc,keep); // existing lock/ramp/provenance/timing checks; no mutation
 return {context:JSON.stringify(context),signature:JSON.stringify(doc),keep,duration:plan.duration,tracks:[...new Set(doc.clips.map(c=>c.track))]};
}
function current(p,doc,context){return !!p&&p.context===JSON.stringify(context)&&p.signature===JSON.stringify(doc);}
return {prepare,current};
});
