'use strict';
// Fixed destinations chosen by the user. Model output cannot select a host or tool.
const ENDPOINTS=Object.freeze({openai:'https://api.openai.com/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions',openrouter:'https://openrouter.ai/api/v1/chat/completions',
 // Meta Model API (Muse Spark, public preview, US): OpenAI-compatible Chat Completions at https://api.meta.ai/v1 +
 // /chat/completions, a Bearer key made at dev.meta.ai/api-keys. Checked 2026-11-04 against dev.meta.ai/resources/blog/
 // build-with-muse-spark, docs.litellm.ai/docs/providers/meta and promptfoo.dev/docs/providers/meta.
 meta:'https://api.meta.ai/v1/chat/completions'});
const Format=require('../agent-format');
// Who may be chosen. The owner (2026-11-02, relayed by Deja): OpenRouter with DeepSeek's Flash model is the
// default and listed first; DeepSeek and OpenAI follow. (Until then OpenRouter was for tests only, #26; the
// test switch below remains but no longer changes the list.) The page cannot change the list.
// Meta (Muse Spark) is listed second (the owner, 2026-11-04, for the Meta AI developer hackathon); the default stays.
const PUBLIC_PROVIDERS=Object.freeze(['openrouter','meta','deepseek','openai']),TEST_PROVIDERS=Object.freeze([]);
// The default service and model, in one line (Deja, 2026-11-02: OpenRouter or DeepSeek direct is still the owner's
// call). The OpenRouter id is the one Rea's catalogue lists for DeepSeek V4.1 Flash (openrouter-flash-catalogue.json,
// sha256 c477d643…, from openrouter.ai/api/v1/models on 2026-11-02); not a "~…-latest" alias, which can move to
// another model without a MontClip release. DeepSeek direct would be {provider:'deepseek',model:<its Flash id>}.
const DEFAULT_SERVICE=Object.freeze({provider:'openrouter',model:'deepseek/deepseek-v4.1-flash-1017'});
// The model filled in when Meta is chosen: muse-spark-1.1, the id Meta's own sample uses (promptfoo's default as well).
const META_MODEL='muse-spark-1.1';
const DEFAULT_PROVIDER=DEFAULT_SERVICE.provider,DEFAULT_MODELS=Object.freeze({[DEFAULT_SERVICE.provider]:DEFAULT_SERVICE.model,meta:META_MODEL});
const ALL_PROVIDERS=Object.freeze([...PUBLIC_PROVIDERS,...TEST_PROVIDERS]);
const testProvidersEnabled=({isPackaged,argv=[],env={}})=>!isPackaged||argv.includes('--montclip-test-providers')||env.MONTCLIP_TEST_PROVIDERS==='1';
// Provider failures the pane explains in plain words (anything else is REQUEST_FAILED).
const KNOWN=new Set(['AUTH','MODEL_INVALID','RATE_LIMIT','UPSTREAM','NETWORK','PROVIDER_HTTP','RESPONSE_LIMIT','INVALID_RESPONSE']);
const fail=code=>({ok:false,code});
// A reply larger than this is refused (RESPONSE_LIMIT) without reading the rest.
const RESPONSE_LIMIT_BYTES=131072;
function validPayload(p){return p&&Object.keys(p).sort().join(',')==='gen,messages,projectId,requestId,revision,sequenceId,version'&&p.version===1&&/^[a-zA-Z0-9_-]{1,80}$/.test(p.requestId)&&typeof p.projectId==='string'&&p.projectId.length>0&&p.projectId.length<=256&&(p.sequenceId===null||typeof p.sequenceId==='string'&&p.sequenceId.length<=256)&&Number.isSafeInteger(p.revision)&&p.revision>=0&&Number.isSafeInteger(p.gen)&&p.gen>=0&&Array.isArray(p.messages)&&p.messages.length>0&&p.messages.length<=100&&p.messages.every(m=>m&&Object.keys(m).sort().join(',')==='content,role'&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=16000)&&p.messages.at(-1).role==='user'&&JSON.stringify(p).length<=131072;}
// A 400 or 404 whose error says the model name is wrong (OpenRouter: "… is not a valid model ID", others:
// "model not found" / "Model Not Exist" / "The model `x` does not exist"). Only the first 16 KiB of the error body is read.
const ERROR_READ_BYTES=16384;
async function namesBadModel(response){
 let size=0;const chunks=[];
 try{for await(const part of response.body){chunks.push(part);size+=part.length;if(size>=ERROR_READ_BYTES){try{await response.body.cancel?.();}catch{}break;}}}catch{return false;}
 return /invalid model|not a valid model|unknown model|model[ _-]?not[ _-]?(found|exist)|model\b[^.\n]{0,120}\b(does not exist|not found|is not supported)/i.test(Buffer.concat(chunks).subarray(0,ERROR_READ_BYTES).toString('utf8'));
}
async function httpsRequest(config,payload,signal,{fetch:get=fetch,providers=PUBLIC_PROVIDERS}={}){
 if(!providers.includes(config.provider))throw Error('PROVIDER_UNAVAILABLE');
 let response;
 try{response=await get(ENDPOINTS[config.provider],{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body:JSON.stringify(Format.body(config.model,payload.messages))});}
 catch(e){if(signal.aborted)throw e;throw Error('NETWORK');}
 if((response.status===400||response.status===404)&&await namesBadModel(response))throw Error('MODEL_INVALID');
 if(!response.ok)throw Error(response.status===401||response.status===403?'AUTH':response.status===429?'RATE_LIMIT':response.status>=500?'UPSTREAM':'PROVIDER_HTTP');
 let size=0;const chunks=[];for await(const part of response.body){size+=part.length;if(size>RESPONSE_LIMIT_BYTES){try{await response.body.cancel?.();}catch{}throw Error('RESPONSE_LIMIT');}chunks.push(part);}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')),text=data.choices?.[0]?.message?.content;
 if(typeof text!=='string'||text.length>16000||!text.trim())throw Error('INVALID_RESPONSE');return{text};
}
function createService({read,write,backup,erase,seal,unseal,providers=PUBLIC_PROVIDERS,request=(c,p,signal)=>httpsRequest(c,p,signal,{providers}),timeoutMs=60000}){
 let config=null,bad=false,original;const jobs=new Map();
 try{const raw=read();original=raw;if(raw){if(raw.length>40000)throw Error();const v=JSON.parse(raw);if(!v||Object.keys(v).sort().join(',')!=='model,provider,secret,version'||v.version!==1||!Object.hasOwn(ENDPOINTS,v.provider)||typeof v.model!=='string'||!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(v.model)||typeof v.secret!=='string'||!v.secret||v.secret.length>32768)throw Error();config=providers.includes(v.provider)?v:null;}}catch{bad=true;}
 return {
 get(){return{ok:!bad,configured:!!config,provider:config?.provider||DEFAULT_PROVIDER,model:config?.model||'',providers:[...providers],recommended:DEFAULT_PROVIDER,defaultModels:{...DEFAULT_MODELS},code:bad?'CONFIG_READ_FAILED':null};},
 reset(){if(!bad)return fail('RESET_NOT_REQUIRED');try{if(typeof original!=='string'||typeof backup!=='function')throw Error();backup(original);bad=false;config=null;original=undefined;return{...this.get(),code:'CONFIG_BACKED_UP'};}catch{return fail('CONFIG_BACKUP_FAILED');}},
 // Deja 2026-11-02: removes the saved key and connection settings. A running request is cancelled first.
 // Only once the connection file is confirmed gone does the state read "not configured"; a failure is reported as one.
 deleteConnection(){for(const job of jobs.values())if(job.running){job.cancelled=true;job.controller.abort();}
 try{if(typeof erase!=='function')throw Error();erase();}catch(e){if(e&&e.mainGone===true){config=null;bad=false;original=undefined;}return{ok:false,code:'CONFIG_DELETE_FAILED',configured:!!config};}
 config=null;bad=false;original=undefined;return{...this.get(),code:'CONNECTION_DELETED'};},
 configure(v){if(bad)return fail('CONFIG_READ_FAILED');if(!v||Object.keys(v).sort().join(',')!=='apiKey,model,provider'||!Object.hasOwn(ENDPOINTS,v.provider)||!providers.includes(v.provider)||typeof v.model!=='string'||!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(v.model)||typeof v.apiKey!=='string'||v.apiKey.length>4096||/[\r\n]/.test(v.apiKey))return fail('CONFIG_INVALID');
 try{const secret=v.apiKey?seal(v.apiKey):config?.provider===v.provider?config.secret:null;if(!secret)return fail('KEY_REQUIRED');const next={version:1,provider:v.provider,model:v.model,secret};write(JSON.stringify(next));config=next;return this.get();}catch{return fail('CONFIG_WRITE_FAILED');}},
 async send(payload){if(!validPayload(payload))return fail('PAYLOAD_INVALID');if(!config)return fail('UNCONFIGURED');if(jobs.has(payload.requestId))return fail('DUPLICATE');if(jobs.size>=2000)return fail('REQUEST_CAPACITY');if([...jobs.values()].some(j=>j.running))return fail('BUSY');
 const controller=new AbortController(),job={running:true,cancelled:false,timedOut:false,controller};jobs.set(payload.requestId,job);const timer=setTimeout(()=>{job.timedOut=true;controller.abort();},timeoutMs);
 try{const key=unseal(config.secret);if(!key)throw Error();// the fixed format note goes first; the page's own messages follow unchanged
 const outgoing={...JSON.parse(JSON.stringify(payload)),messages:Format.withFormat(JSON.parse(JSON.stringify(payload.messages)))};
 const result=await request({...config,key},outgoing,controller.signal);if(job.timedOut)return fail('TIMEOUT');if(job.cancelled)return fail('CANCELLED');if(typeof result.text!=='string'||!result.text.trim()||result.text.length>16000)return fail('INVALID_RESPONSE');return {ok:true,text:result.text,requestId:payload.requestId};}catch(e){return fail(job.timedOut?'TIMEOUT':job.cancelled?'CANCELLED':KNOWN.has(e&&e.message)?e.message:'REQUEST_FAILED');}finally{clearTimeout(timer);job.running=false;job.controller=null;}},
 // the main process's own read-back (desktop/agent-seed.js): the file on disk holds this provider, model and key, sealed. Not an
 // IPC operation: the page's list of operations is fixed in main.js.
 matches(v){try{const raw=read();if(!raw)return false;const c=JSON.parse(raw);return c.version===1&&c.provider===v.provider&&c.model===v.model&&typeof c.secret==='string'&&unseal(c.secret)===v.apiKey;}catch{return false;}},
 cancel(id){const job=jobs.get(id);if(!job)return fail('UNKNOWN_REQUEST');if(!job.running)return{ok:true,code:'COMPLETED'};job.cancelled=true;job.controller.abort();return{ok:true,code:'CANCELLED'};},
 dispose(){for(const job of jobs.values())if(job.running){job.cancelled=true;job.controller.abort();}}
 };
}
function createDiskService(root,safeStorage,fs=require('node:fs'),{providers=PUBLIC_PROVIDERS}={}){const path=require('node:path'),{randomUUID}=require('node:crypto');const file=path.join(root,'agent-connection-v1.json');return createService({providers,
 backup(expected){if(fs.readFileSync(file,'utf8')!==expected)throw Error('CHANGED');const dir=fs.mkdtempSync(path.join(root,'agent-connection-backup-'));fs.renameSync(file,path.join(dir,'agent-connection-v1.json'));},
 // The connection file, then any temporary left by a write and any backup made by reset (each can hold a sealed
 // key); nothing else in the profile is touched. Each removal is a single unlink, and the result is checked afterwards.
 erase(){const base=path.basename(file),gone=p=>{try{fs.unlinkSync(p);}catch(e){if(e.code!=='ENOENT')throw e;}};
 gone(file);if(fs.existsSync(file))throw Error('STILL_THERE');
 try{for(const name of fs.readdirSync(root)){const p=path.join(root,name);
 if(name.startsWith(base+'.')&&name.endsWith('.tmp'))gone(p);
 else if(name.startsWith('agent-connection-backup-')){gone(path.join(p,base));fs.rmdirSync(p);}}
 if(fs.readdirSync(root).some(name=>name.startsWith(base)||name.startsWith('agent-connection-backup-')))throw Error('STILL_THERE');}
 catch{throw Object.assign(Error('PARTIAL'),{mainGone:true});}},
 read(){try{return fs.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}},
 write(raw){const tmp=file+'.'+randomUUID()+'.tmp';let owned=false;try{fs.writeFileSync(tmp,raw,{flag:'wx',mode:0o600});owned=true;fs.renameSync(tmp,file);owned=false;}finally{if(owned)try{fs.unlinkSync(tmp);}catch{}}},
 seal(key){if(!safeStorage.isEncryptionAvailable())throw Error();return safeStorage.encryptString(key).toString('base64');},unseal(secret){return safeStorage.decryptString(Buffer.from(secret,'base64'));}
 });}
module.exports={createService,createDiskService,validPayload,httpsRequest,ENDPOINTS,RESPONSE_LIMIT_BYTES,PUBLIC_PROVIDERS,TEST_PROVIDERS,ALL_PROVIDERS,DEFAULT_SERVICE,DEFAULT_PROVIDER,DEFAULT_MODELS,testProvidersEnabled};
