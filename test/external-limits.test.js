'use strict';
// Deja (2026-11-03, on #83): external caps are per capability, written in the capability table and fixed in the main
// process with the risk levels — not one global number.
//   text  (the AI assistant, looking up a song's name): 128 KiB a send, 4 MiB a chat;
//   audio (cloud transcription, later): 25 MiB a send (one part), 2 GiB a project while it is open — the field only, not wired.
// Over a cap: refused, saying by how much; never cut down and sent anyway.
const {test}=require('node:test'),a=require('node:assert/strict');
const Cap=require('../capabilities'),P=require('../agent-policy'),{createPolicyHost}=require('../desktop/agent-policy-host');

const KiB=1024,MiB=1024*KiB,GiB=1024*MiB;

test('every external capability has its caps in the table; nothing else has any',()=>{
 for(const c of Cap.list()){
  const l=Cap.limits(c.name);
  if(c.risk!=='external'){a.equal(l,null,c.name);continue;}
  a.ok(l,c.name);a.ok(Object.isFrozen(l),c.name);
  for(const k of ['kind','perSend','perScope','scope'])a.ok(k in l,c.name+' '+k);
 }
 a.equal(Cap.limits('nonexistent'),null);
});

test('text: the assistant and the song lookup, 128 KiB a send and 4 MiB a chat',()=>{
 for(const name of ['assistant_request','song_lookup']){
  a.equal(Cap.riskOf(name),'external',name);
  a.deepEqual({...Cap.limits(name)},{kind:'text',perSend:128*KiB,perScope:4*MiB,scope:'chat'},name);
 }
});

test('audio: cloud transcription (not wired yet), 25 MiB a part and 2 GiB a project while it is open',()=>{
 a.equal(Cap.riskOf('cloud_transcribe'),'external');
 a.deepEqual({...Cap.limits('cloud_transcribe')},{kind:'audio',perSend:25*MiB,perScope:2*GiB,scope:'project-open'});
});

test('over a cap: refused with by how much — never cut down and sent',()=>{
 const base={mode:'yolo',external:{enabled:true,allowlisted:true}};
 const one=P.decide({...base,capability:'assistant_request',bytes:128*KiB+10,scopeBytes:0});
 a.equal(one.action,'refuse');a.equal(one.code,'SEND_TOO_LARGE');a.equal(one.limit,128*KiB);a.equal(one.over,10);a.equal(one.showContent,true);
 const chat=P.decide({...base,capability:'assistant_request',bytes:100,scopeBytes:4*MiB-40});
 a.equal(chat.code,'SCOPE_LIMIT');a.equal(chat.limit,4*MiB);a.equal(chat.over,60);a.equal(chat.used,4*MiB-40);
 // the audio caps are the audio capability's own
 a.equal(P.decide({...base,capability:'cloud_transcribe',bytes:20*MiB,scopeBytes:0}).action,'run');
 a.equal(P.decide({...base,capability:'cloud_transcribe',bytes:25*MiB+1,scopeBytes:0}).over,1);
 a.equal(P.decide({...base,capability:'assistant_request',bytes:20*MiB,scopeBytes:0}).code,'SEND_TOO_LARGE','text is not allowed the audio cap');
 a.equal(P.decide({...base,capability:'assistant_request',bytes:-1}).code,'SEND_INVALID');
 a.equal(P.decide({...base,capability:'assistant_request',bytes:1.5}).code,'SEND_INVALID');
});

test('the main process keeps a total per scope and per capability',async()=>{
 const h=createPolicyHost({confirmYolo:async()=>true,external:()=>({enabled:true,allowlist:['https://openrouter.ai']}),language:()=>'zh-CN'});
 await h.setMode('yolo');
 const send=(capability,bytes,s='chat1')=>h.decide({sessionId:s,capability,target:{kind:'origin',value:'https://openrouter.ai'},bytes});
 for(let i=0;i<32;i++)a.equal(send('assistant_request',128*KiB).action,'run');
 const r=send('assistant_request',5);a.equal(r.code,'SCOPE_LIMIT');a.equal(r.over,5);a.equal(r.used,4*MiB);
 a.equal(send('song_lookup',5).action,'run','another capability, its own total');
 a.equal(send('assistant_request',5,'chat2').action,'run','another chat, its own total');
});

test('the page gets the caps read-only with the table',()=>{
 const main=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','desktop','main.js'),'utf8');
 a.match(main,/risk: c\.risk, summary: c\.summary, schema: c\.schema, limits: Capabilities\.limits\(c\.name\)/);
});
