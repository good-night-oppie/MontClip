'use strict';
// Fixed destinations chosen by the user. Model output cannot select a host or tool.
const ENDPOINTS=Object.freeze({openai:'https://api.openai.com/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',openrouter:'https://openrouter.ai/api/v1/chat/completions'});
const Format=require('../agent-format');
// Provider failures the pane explains in plain words (anything else is REQUEST_FAILED).
const KNOWN=new Set(['AUTH','RATE_LIMIT','UPSTREAM','NETWORK','PROVIDER_HTTP','RESPONSE_LIMIT','INVALID_RESPONSE']);
const fail=code=>({ok:false,code});
function validPayload(p){return p&&Object.keys(p).sort().join(',')==='gen,messages,projectId,requestId,revision,sequenceId,version'&&p.version===1&&/^[a-zA-Z0-9_-]{1,80}$/.test(p.requestId)&&typeof p.projectId==='string'&&p.projectId.length>0&&p.projectId.length<=256&&(p.sequenceId===null||typeof p.sequenceId==='string'&&p.sequenceId.length<=256)&&Number.isSafeInteger(p.revision)&&p.revision>=0&&Number.isSafeInteger(p.gen)&&p.gen>=0&&Array.isArray(p.messages)&&p.messages.length>0&&p.messages.length<=100&&p.messages.every(m=>m&&Object.keys(m).sort().join(',')==='content,role'&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=16000)&&p.messages.at(-1).role==='user'&&JSON.stringify(p).length<=131072;}
async function httpsRequest(config,payload,signal,{fetch:get=fetch}={}){
 let response;
 try{response=await get(ENDPOINTS[config.provider],{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body:JSON.stringify({model:config.model,messages:payload.messages,stream:false,max_tokens:2048})});}
 catch(e){if(signal.aborted)throw e;throw Error('NETWORK');}
 if(!response.ok)throw Error(response.status===401||response.status===403?'AUTH':response.status===429?'RATE_LIMIT':response.status>=500?'UPSTREAM':'PROVIDER_HTTP');
 let size=0;const chunks=[];for await(const part of response.body){size+=part.length;if(size>131072){await response.body.cancel().catch(()=>{});throw Error('RESPONSE_LIMIT');}chunks.push(part);}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),text=data.choices?.[0]?.message?.content;
 if(typeof text!=='string'||text.length>16000||!text.trim())throw Error('INVALID_RESPONSE');return{text};
}
function createService({read,write,backup,seal,unseal,request=httpsRequest,timeoutMs=60000}){
 let config=null,bad=false,original;const jobs=new Map();
 try{const raw=read();original=raw;if(raw){if(raw.length>40000)throw Error();const v=JSON.parse(raw);if(!v||Object.keys(v).sort().join(',')!=='model,provider,secret,version'||v.version!==1||!Object.hasOwn(ENDPOINTS,v.provider)||typeof v.model!=='string'||!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(v.model)||typeof v.secret!=='string'||!v.secret||v.secret.length>32768)throw Error();config=v;}}catch{bad=true;}
 return {
 get(){return{ok:!bad,configured:!!config,provider:config?.provider||'openai',model:config?.model||'',code:bad?'CONFIG_READ_FAILED':null};},
 reset(){if(!bad)return fail('RESET_NOT_REQUIRED');try{if(typeof original!=='string'||typeof backup!=='function')throw Error();backup(original);bad=false;config=null;original=undefined;return{...this.get(),code:'CONFIG_BACKED_UP'};}catch{return fail('CONFIG_BACKUP_FAILED');}},
 configure(v){if(bad)return fail('CONFIG_READ_FAILED');if(!v||Object.keys(v).sort().join(',')!=='apiKey,model,provider'||!Object.hasOwn(ENDPOINTS,v.provider)||typeof v.model!=='string'||!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(v.model)||typeof v.apiKey!=='string'||v.apiKey.length>4096||/[\r\n]/.test(v.apiKey))return fail('CONFIG_INVALID');
 try{const secret=v.apiKey?seal(v.apiKey):config?.provider===v.provider?config.secret:null;if(!secret)return fail('KEY_REQUIRED');const next={version:1,provider:v.provider,model:v.model,secret};write(JSON.stringify(next));config=next;return this.get();}catch{return fail('CONFIG_WRITE_FAILED');}},
 async send(payload){if(!validPayload(payload))return fail('PAYLOAD_INVALID');if(!config)return fail('UNCONFIGURED');if(jobs.has(payload.requestId))return fail('DUPLICATE');if(jobs.size>=2000)return fail('REQUEST_CAPACITY');if([...jobs.values()].some(j=>j.running))return fail('BUSY');
 const controller=new AbortController(),job={running:true,cancelled:false,timedOut:false,controller};jobs.set(payload.requestId,job);const timer=setTimeout(()=>{job.timedOut=true;controller.abort();},timeoutMs);
 try{const key=unseal(config.secret);if(!key)throw Error();// the fixed format note goes first; the page's own messages follow unchanged
 const outgoing={...JSON.parse(JSON.stringify(payload)),messages:Format.withFormat(JSON.parse(JSON.stringify(payload.messages)))};
 const result=await request({...config,key},outgoing,controller.signal);if(job.timedOut)return fail('TIMEOUT');if(job.cancelled)return fail('CANCELLED');if(typeof result.text!=='string'||!result.text.trim()||result.text.length>16000)return fail('INVALID_RESPONSE');return {ok:true,text:result.text,requestId:payload.requestId};}catch(e){return fail(job.timedOut?'TIMEOUT':job.cancelled?'CANCELLED':KNOWN.has(e&&e.message)?e.message:'REQUEST_FAILED');}finally{clearTimeout(timer);job.running=false;job.controller=null;}},
 cancel(id){const job=jobs.get(id);if(!job)return fail('UNKNOWN_REQUEST');if(!job.running)return{ok:true,code:'COMPLETED'};job.cancelled=true;job.controller.abort();return{ok:true,code:'CANCELLED'};},
 dispose(){for(const job of jobs.values())if(job.running){job.cancelled=true;job.controller.abort();}}
 };
}
function createDiskService(root,safeStorage,fs=require('node:fs')){const path=require('node:path'),{randomUUID}=require('node:crypto');const file=path.join(root,'agent-connection-v1.json');return createService({
 backup(expected){if(fs.readFileSync(file,'utf8')!==expected)throw Error('CHANGED');const dir=fs.mkdtempSync(path.join(root,'agent-connection-backup-'));fs.renameSync(file,path.join(dir,'agent-connection-v1.json'));},
 read(){try{return fs.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}},
 write(raw){const tmp=file+'.'+randomUUID()+'.tmp';let owned=false;try{fs.writeFileSync(tmp,raw,{flag:'wx',mode:0o600});owned=true;fs.renameSync(tmp,file);owned=false;}finally{if(owned)try{fs.unlinkSync(tmp);}catch{}}},
 seal(key){if(!safeStorage.isEncryptionAvailable())throw Error();return safeStorage.encryptString(key).toString('base64');},unseal(secret){return safeStorage.decryptString(Buffer.from(secret,'base64'));}
 });}
module.exports={createService,createDiskService,validPayload,httpsRequest,ENDPOINTS};
