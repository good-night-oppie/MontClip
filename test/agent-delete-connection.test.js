/* Deja (2026-11-02): once configured, the AI connection could not be removed from the interface — saving with
   an empty key kept the old key, and "reset" only appeared when the settings could not be read. "Delete this
   connection" removes the saved key and connection settings in the main process, cancels a running request,
   and returns to "not configured"; a failure says so and pretends nothing. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createService,createDiskService}=require('../desktop/agent-service');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const payload={version:1,requestId:'r1',projectId:'p',sequenceId:'s',revision:1,gen:1,messages:[{role:'user',content:'hello'}]};
const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('encrypted:'+s),decryptString:b=>b.toString().replace(/^encrypted:/,'')};
const KEY='synthetic-key-for-delete-test';
function profile(){return fs.mkdtempSync(path.join(os.tmpdir(),'montclip-delete-connection-'));}
// every file under the profile, with its bytes
function contents(dir){const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...contents(p));else out.push([path.relative(dir,p),fs.readFileSync(p,'utf8')]);}return out;}

test('after deleting, the connection file and the key are gone from the profile, and the state is "not configured"',()=>{
 const root=profile();
 try{
  const s=createDiskService(root,safe);
  assert.equal(s.configure({provider:'openai',model:'m',apiKey:KEY}).ok,true);
  assert.ok(fs.existsSync(path.join(root,'agent-connection-v1.json')));
  const r=s.deleteConnection();
  assert.equal(r.ok,true);assert.equal(r.configured,false);assert.equal(r.code,'CONNECTION_DELETED');
  assert.equal(fs.existsSync(path.join(root,'agent-connection-v1.json')),false,'connection file removed');
  const left=contents(root);
  assert.equal(left.some(([,v])=>v.includes(KEY)||v.includes(Buffer.from('encrypted:'+KEY).toString('base64'))),false,'no key, sealed or plain, anywhere in the profile');
  assert.equal(left.some(([f])=>f.includes('agent-connection')),false,'no connection file, temporary or backup, is left');
  assert.deepEqual(s.get().configured,false);
  // a fresh start reads nothing back
  const again=createDiskService(root,safe).get();assert.equal(again.configured,false);assert.equal(again.ok,true);assert.equal(again.model,'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('backups of an unreadable connection (which can hold a sealed key) and stray temporaries are removed too',()=>{
 const root=profile();
 try{
  const file=path.join(root,'agent-connection-v1.json'),sealed=Buffer.from('encrypted:'+KEY).toString('base64');
  fs.writeFileSync(file,JSON.stringify({version:1,provider:'openai',model:'m',secret:sealed,extra:1}));
  const s=createDiskService(root,safe);assert.equal(s.get().code,'CONFIG_READ_FAILED');
  assert.equal(s.reset().ok,true);
  assert.ok(fs.readdirSync(root).some(n=>n.startsWith('agent-connection-backup-')),'reset made a backup');
  fs.writeFileSync(file+'.0f0e.tmp',JSON.stringify({secret:sealed}));
  assert.equal(s.configure({provider:'deepseek',model:'d',apiKey:KEY}).ok,true);
  fs.writeFileSync(path.join(root,'unrelated.json'),'kept');
  assert.equal(s.deleteConnection().ok,true);
  assert.deepEqual(fs.readdirSync(root),['unrelated.json'],'only the connection files go; other files stay');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an unreadable connection can be deleted directly, without a backup first',()=>{
 const root=profile();
 try{
  fs.writeFileSync(path.join(root,'agent-connection-v1.json'),'{broken');
  const s=createDiskService(root,safe);assert.equal(s.get().code,'CONFIG_READ_FAILED');
  const r=s.deleteConnection();assert.equal(r.ok,true);assert.equal(r.code,'CONNECTION_DELETED');
  assert.deepEqual(fs.readdirSync(root),[]);
  assert.equal(s.get().ok,true);assert.equal(s.get().configured,false);
  assert.equal(s.configure({provider:'openai',model:'m',apiKey:'x'}).ok,true,'a new connection can be set up afterwards');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('after deleting, sending is refused before any request is made',async()=>{
 let calls=0,value=null;
 const s=createService({read:()=>value,write:v=>{value=v;},erase:()=>{value=null;},seal:x=>x,unseal:x=>x,request:async()=>{calls++;return{text:'answer'};}});
 s.configure({provider:'openai',model:'m',apiKey:'x'});
 assert.equal((await s.send(payload)).ok,true);assert.equal(calls,1);
 assert.equal(s.deleteConnection().ok,true);
 assert.equal((await s.send({...payload,requestId:'r2'})).code,'UNCONFIGURED');
 assert.equal(calls,1,'no request after deleting');
 assert.equal(s.configure({provider:'openai',model:'m',apiKey:''}).code,'KEY_REQUIRED','an empty key cannot bring the deleted key back');
});

test('a request in progress is cancelled by deleting, and its late answer is not shown',async()=>{
 let done,signal,value=null;
 const s=createService({read:()=>value,write:v=>{value=v;},erase:()=>{value=null;},seal:x=>x,unseal:x=>x,request:(c,p,sg)=>{signal=sg;return new Promise(r=>done=r);}});
 s.configure({provider:'openai',model:'m',apiKey:'x'});
 const pending=s.send(payload);await new Promise(r=>setImmediate(r));
 assert.equal(s.deleteConnection().ok,true);
 assert.equal(signal.aborted,true,'the request was aborted');
 done({text:'late'});
 assert.equal((await pending).code,'CANCELLED');
});

test('a failed delete says so: it is not reported as done, and what is still saved is still shown as saved',()=>{
 const root=path.resolve('synthetic-profile'),file=path.join(root,'agent-connection-v1.json');
 const files=new Map();
 const adapter={readFileSync:p=>{if(!files.has(p))throw Object.assign(Error(),{code:'ENOENT'});return files.get(p);},
  writeFileSync:(p,v)=>files.set(p,v),renameSync:(a,b)=>{files.set(b,files.get(a));files.delete(a);},
  unlinkSync:()=>{throw Object.assign(Error('busy'),{code:'EBUSY'});},existsSync:p=>files.has(p),
  readdirSync:()=>[...files.keys()].map(p=>path.basename(p)),rmdirSync:()=>{},mkdtempSync:p=>p+'1'};
 const s=createDiskService(root,safe,adapter);
 assert.equal(s.configure({provider:'openai',model:'m',apiKey:KEY}).ok,true);
 const r=s.deleteConnection();
 assert.equal(r.ok,false);assert.equal(r.code,'CONFIG_DELETE_FAILED');
 assert.equal(r.configured,true,'the key is still on disk, so it is not shown as removed');
 assert.ok(files.has(file));assert.equal(s.get().configured,true);
});

test('the page cannot delete by itself: one fixed, guarded IPC with no argument, and no file access in the page',()=>{
 const main=read('desktop/main.js'),preload=read('desktop/view-preload.js'),pane=read('agent-ui/pane.tsx');
 const loop=main.match(/for\(const operation of \[([^\]]*)\]\) ipcMain\.handle\('montclip:agent:'\+operation,\(event,value\)=>\{\s*if\(!settingsAllowed\(event,win,origin\)\)return \{ok:false,code:'AGENT_FORBIDDEN'\};/);
 assert.ok(loop,'agent operations go through the sender/frame/origin guard');
 assert.deepEqual(loop[1].split(',').map(s=>s.trim().replace(/'/g,'')),['get','configure','reset','deleteConnection','send','cancel'],'the IPC list is fixed');
 assert.match(preload,/deleteConnection:\(\)=>ipcRenderer\.invoke\('montclip:agent:deleteConnection'\)/,'the page passes nothing: no path, no file name');
 // six for the service, two for the 「AI 数据说明」 (desktop/agent-data-notice.js) and two for the 设置 › AI 助手 switch
 // (desktop/agent-switch.js; QQ via DD and Deja, 2026-11-04)
 assert.equal((preload.match(/montclip:agent:/g)||[]).length,10);
 assert.deepEqual((preload.match(/montclip:agent:switch[A-Za-z]+/g)||[]).sort(),['montclip:agent:switchGet','montclip:agent:switchSet']);
 assert.deepEqual((preload.match(/montclip:agent:notice[A-Za-z]+/g)||[]).sort(),['montclip:agent:noticeAck','montclip:agent:noticeGet']);
 for(const src of [preload,pane])assert.doesNotMatch(src,/agent-connection|require\(['"]node:fs|unlink|rmdir|rmSync/,'no file names or file calls in the page or preload');
 const svc=read('desktop/agent-service.js');
 assert.match(svc,/deleteConnection\(\)\{/,'the service method takes no argument');
});

// JJ (2026-11-02 release notes, "落地前必须确认" item 1): the button and the confirmation, word for word.
// QQ (#49): the confirmation also says the chat history stays (the sessions are a separate store); wording for JJ.
test('the button and the confirmation use JJ\'s wording in both languages',()=>{
 const view=require('../ui-preferences');
 const want={'zh-CN':{removeConnection:'删除这个连接',removeConfirm:'删除后，这台电脑上保存的密钥会被清掉，AI 助手要重新设置才能用。剪辑不受影响，聊天记录也还在。'},
  en:{removeConnection:'Remove this connection',removeConfirm:'This clears the key saved on this computer. You will need to set up the AI service again to use the assistant. Editing is not affected, and your chat history stays.'}};
 for(const l of ['zh-CN','en']){for(const [k,v] of Object.entries(want[l]))assert.equal(view.text[l]['officialPane_'+k],v,l+' '+k);
  for(const k of ['connectionRemoved','connectionRemoveFailed'])assert.ok(view.text[l]['officialPane_'+k],l+' '+k);}
});

test('the pane asks first: the button only opens the confirmation, and only its confirm button deletes',()=>{
 const pane=read('agent-ui/pane.tsx');
 const button=pane.match(/<button data-remove-connection onClick=\{(.*?)\}>/);assert.ok(button,'the remove button');
 assert.doesNotMatch(button[1],/deleteConnection/);assert.match(button[1],/removeDialog\.current\?\.showModal\(\)/);
 // VV (#49): Cancel has the focus when it opens, so Enter does not delete
 assert.match(button[1],/showModal\(\);removeDialog\.current\?\.querySelector<HTMLButtonElement>\('\[data-remove-cancel\]'\)\?\.focus\(\)/);
 assert.equal((pane.match(/deleteConnection\(\)/g)||[]).length,1,'one call');
 assert.match(pane,/<button data-remove-confirm onClick=\{async\(\)=>\{removeDialog\.current\?\.close\(\);const result=await W\.montclipAgentService\?\.deleteConnection\(\);/);
 assert.match(pane,/\(cfg\?\.configured\|\|cfg\?\.code==='CONFIG_READ_FAILED'\|\|cfg\?\.code==='SEED_CONFLICT'\)&&<button data-remove-connection/,'shown while a connection is saved or unreadable');
 assert.match(pane,/if\(result\?\.ok\)\{setCfg\(result\);setModel\(''\);setKey\(''\);setNotice\('connectionRemoved'\);\}else\{setCfg\(await W\.montclipAgentService\?\.get\(\)\);setNotice\('connectionRemoveFailed'\);\}/,'a failure shows its own notice and re-reads the real state');
 assert.match(pane,/<button data-remove-cancel onClick=\{\(\)=>removeDialog\.current\?\.close\(\)\}>/);
});

test('the shipped bundle is rebuilt from the pane source with the remove button',()=>{
 const bundle=read('app/cindy-official.js');
 for(const s of ['data-remove-connection','data-remove-confirm','data-remove-cancel','deleteConnection()'])assert.ok(bundle.includes(s),s);
});
