(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MontClipSessions=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX=524288;
const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const text=v=>typeof v==='string'&&v.length<=16000;
function reference(r,s){
 const fields=['projectId','sequenceId','revision','gen','type'];
 if(r?.type==='range')fields.push('start','end');
 else if(r?.type==='caption')fields.push('clipId','sourceCaptionId','text','start','end');
 else if(r?.type!=='project')return false;
 if(!keys(r,fields)||r.projectId!==s.projectId||r.sequenceId!==s.sequenceId||!Number.isSafeInteger(r.revision)||r.revision<0||!(r.gen===null||Number.isSafeInteger(r.gen)&&r.gen>=0))return false;
 if(r.type!=='project'&&(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start))return false;
 return r.type!=='caption'||id(r.clipId)&&(r.sourceCaptionId===null||id(r.sourceCaptionId))&&text(r.text);
}
function valid(v){
 try{if(!keys(v,['version','scopes'])||v.version!==1||!Array.isArray(v.scopes)||v.scopes.length>50||JSON.stringify(v).length>MAX)return false;
 let count=0;const seen=new Set(),ids=new Set();
 for(const s of v.scopes){if(!keys(s,['projectId','sequenceId','active','sessions'])||!id(s.projectId)||!(s.sequenceId===null||id(s.sequenceId))||!Array.isArray(s.sessions)||!s.sessions.length)return false;
 const key=JSON.stringify([s.projectId,s.sequenceId]);if(seen.has(key))return false;seen.add(key);
 for(const item of s.sessions){if(++count>50||!keys(item,['id','draft','messages','references'])||!/^\d{1,9}$/.test(item.id)||ids.has(item.id)||!text(item.draft)||!Array.isArray(item.messages)||item.messages.length>100||!Array.isArray(item.references)||item.references.length>20)return false;ids.add(item.id);
 if(!item.messages.every(m=>keys(m,['role','text'])&&['user','assistant'].includes(m.role)&&text(m.text))||!item.references.every(r=>reference(r,s)))return false;
 }if(!s.sessions.some(i=>i.id===s.active))return false;
 }return true;}catch{return false;}
}
return {valid,MAX};});
