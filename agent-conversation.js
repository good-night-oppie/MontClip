(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipConversation=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function createConversation({state,getContext,service,id=()=>crypto.randomUUID()}){
 let review=null,pending=null,result=null;const signature=()=>JSON.stringify({context:getContext(),session:state.current()});
 return {
 prepare(){const context=getContext(),s=state.current();if(!context.projectId||!s.draft.trim()||s.messages.length>98)throw Error('CONTEXT_REQUIRED');for(const r of s.references)if(r.projectId!==context.projectId||r.sequenceId!==context.sequenceId||r.revision!==context.revision||r.gen!==context.gen)throw Error('STALE');
 const content=s.draft+(s.references.length?'\n\n'+JSON.stringify({references:s.references}):'');if(content.length>16000)throw Error('TEXT_LIMIT');
 const payload={version:1,requestId:id(),projectId:context.projectId,sequenceId:context.sequenceId??null,revision:context.revision,gen:context.gen,messages:s.messages.map(m=>({role:m.role,content:m.text})).concat({role:'user',content})};if(JSON.stringify(payload).length>131072)throw Error('HISTORY_LIMIT');review={payload,signature:signature(),session:s};return JSON.parse(JSON.stringify(payload));},
 dismiss(){review=null;},
 async confirm(){if(!review||pending||review.signature!==signature())return{ok:false,code:'STALE'};const r=review;review=null;pending=r;try{const response=await service?.send(r.payload)||{ok:false,code:'UNCONFIGURED'};if(pending!==r||r.signature!==signature())return{ok:false,code:'STALE'};if(!response.ok)return response;state.complete(r.session,r.payload.messages.at(-1).content,response.text);result={text:response.text,context:getContext(),references:r.session.references};return response;}catch{return{ok:false,code:'REQUEST_FAILED'};}finally{if(pending===r)pending=null;}},
 async cancel(){review=null;const p=pending;pending=null;if(p)try{return await service.cancel(p.payload.requestId);}catch{return{ok:false,code:'CANCEL_UNKNOWN'};}return{ok:true,code:'NOT_SENT'};},
 flush(){return pending?false:state.flush();},result(){return result;},busy(){return !!pending;},
 sync(){if(pending&&pending.signature!==signature())void this.cancel();if(review&&review.signature!==signature())review=null;}
 };
}
return{createConversation};});
