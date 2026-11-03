(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipConversation=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function createConversation({state,getContext,service,getFacts=()=>null,id=()=>crypto.randomUUID()}){
 let review=null,pending=null,result=null;const signature=()=>JSON.stringify({context:getContext(),session:state.current()});
 return {
 prepare(){const context=getContext(),s=state.current();if(!context.projectId||!s.draft.trim()||s.messages.length>98)throw Error('CONTEXT_REQUIRED');for(const r of s.references)if(r.projectId!==context.projectId||r.sequenceId!==context.sequenceId||r.revision!==context.revision||r.gen!==context.gen)throw Error('STALE');
 const facts=getFacts(),content=s.draft+(s.references.length||facts?'\n\n'+JSON.stringify(facts?{references:s.references,facts}:{references:s.references}):'');if(content.length>16000)throw Error('TEXT_LIMIT');
 const payload={version:1,requestId:id(),projectId:context.projectId,sequenceId:context.sequenceId??null,revision:context.revision,gen:context.gen,messages:s.messages.map(m=>({role:m.role,content:m.text})).concat({role:'user',content})};if(JSON.stringify(payload).length>131072)throw Error('HISTORY_LIMIT');review={payload,signature:signature(),session:s};return JSON.parse(JSON.stringify(payload));},
 dismiss(){review=null;},
 reask(){if(!result||pending)throw Error('NO_REPLY');const text=result.input;state.newSession();state.draft(text);review=null;return text;},
 async confirm(){if(!review||pending||review.signature!==signature())return{ok:false,code:'STALE'};const r=review;review=null;pending=r;try{const response=await service?.send(r.payload)||{ok:false,code:'UNCONFIGURED'};if(pending!==r||r.signature!==signature())return{ok:false,code:'STALE'};if(!response.ok)return response;state.complete(r.session,r.payload.messages.at(-1).content,response.text);result={text:response.text,input:r.session.draft,sessionId:r.session.id,context:getContext(),references:r.session.references};return response;}catch{return{ok:false,code:'REQUEST_FAILED'};}finally{if(pending===r)pending=null;}},
 async cancel(){review=null;const p=pending;pending=null;if(p)try{return await service.cancel(p.payload.requestId);}catch{return{ok:false,code:'CANCEL_UNKNOWN'};}return{ok:true,code:'NOT_SENT'};},
 flush(){return pending?false:state.flush();},result(){return result;},busy(){return !!pending;},
 sync(){if(pending&&pending.signature!==signature())void this.cancel();if(review&&review.signature!==signature())review=null;}
 };
}
/** A reply that is exactly one JSON object, optionally inside a ``` / ```json fence. → object | null */
function parseProposal(text){
 if(typeof text!=='string'||text.length>16000)return null;
 const m=/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text),body=(m?m[1]:text).trim();
 if(!body.startsWith('{'))return null;
 try{const v=JSON.parse(body);return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}
}
function proposalSummary(text,references){
 try{const p=parseProposal(text);if(!p)return null;
 if(p.type==='keep_ranges'){const keys=Object.keys(p).sort().join(',');if(keys!=='output_mode,ranges,type'||!['one_file','per_range'].includes(p.output_mode)||!Array.isArray(p.ranges)||!p.ranges.length||p.ranges.length>100)return null;
  let duration=0;for(const r of p.ranges){const k=r&&typeof r==='object'?Object.keys(r).sort().join(','):'';if(k!=='clipId,from,to'&&k!=='clipId,from,label,to'||typeof r.from!=='number'||typeof r.to!=='number'||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.from<0||r.to-r.from<0.5)return null;duration+=r.to-r.from;}
  return{count:p.ranges.length,duration,mode:p.output_mode};}
 if(Object.keys(p).sort().join(',')!=='ranges,type'||p.type!=='keep_sentences'||!Array.isArray(p.ranges)||!p.ranges.length||p.ranges.length>100)return null;
 let duration=0;for(let i=0;i<p.ranges.length;i++){const r=p.ranges[i];if(!r||Object.keys(r).sort().join(',')!=='clipId,from,sourceCaptionId,to'||!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.from<0||r.to<=r.from||!references.some(q=>q.type==='caption'&&q.clipId===r.clipId&&q.sourceCaptionId===r.sourceCaptionId&&q.start===r.from&&q.end===r.to))return null;for(let j=0;j<i;j++)if(Math.min(r.to,p.ranges[j].to)>Math.max(r.from,p.ranges[j].from))return null;duration+=r.to-r.from;}return{count:p.ranges.length,duration};}catch{return null;}
}
function clock(seconds){if(!Number.isFinite(seconds)||seconds<0)return '';const n=Math.floor(seconds),h=Math.floor(n/3600),m=Math.floor(n/60)%60,sec=n%60;return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function durationText(seconds){return Number.isFinite(seconds)&&seconds>0?clock(Math.max(1,Math.round(seconds))):'';}
function referenceText(r,labels,projectName){if(r.type==='project')return labels.project+' · '+projectName;return (r.type==='caption'?labels.caption:labels.range)+' · '+clock(r.start)+'–'+clock(r.end)+(r.type==='caption'?' · '+r.text:'');}
return{createConversation,referenceText,proposalSummary,durationText,parseProposal};});
