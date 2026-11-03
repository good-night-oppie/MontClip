'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {valid,MAX}=require('../agent-session-schema');
const digest=s=>createHash('sha256').update(s).digest('hex');
function createStore(root,{io=fs}={}){
 const file=path.join(root,'agent-sessions-v1.json');
 function get(){try{const raw=io.readFileSync(file,'utf8');if(raw.length>MAX)throw Error();const value=JSON.parse(raw);if(!valid(value))throw Error();return {ok:true,token:digest(raw),value};}catch(e){return e.code==='ENOENT'?{ok:true,token:'missing',value:{version:1,scopes:[]}}:{ok:false,code:'SESSION_READ_FAILED'};}}
 function set(request){
  if(!request||Object.keys(request).length!==2||typeof request.expected!=='string'||!valid(request.value))return {ok:false,code:'SESSION_INVALID'};
  const current=get();if(!current.ok)return current;
  const raw=JSON.stringify(request.value);
  // A lost acknowledgement can be retried without replacing a newer, different snapshot.
  if(JSON.stringify(current.value)===raw)return {ok:true,token:current.token};
  if(request.expected!==current.token)return {ok:false,code:'SESSION_CONFLICT'};
  const tmp=file+'.'+randomUUID()+'.tmp';let fd,owned=false;
  try{fd=io.openSync(tmp,'wx');owned=true;io.writeFileSync(fd,raw);io.closeSync(fd);fd=undefined;io.renameSync(tmp,file);owned=false;return {ok:true,token:digest(raw)};}
  catch{return {ok:false,code:'SESSION_WRITE_FAILED'};}
  finally{if(fd!==undefined)try{io.closeSync(fd);}catch{}if(owned)try{io.unlinkSync(tmp);}catch{}}
 }
 return {get,set};
}
module.exports={createStore};
