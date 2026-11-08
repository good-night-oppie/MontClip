'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {toolError}=require('../tool-error');
test('error metadata keeps codes and data-relative saved paths, not outside locations',()=>{
 const root='C:/Users/Some One/data';
 const raw=Object.assign(new Error("open 'C:/Users/Some One/data/model.bin' failed"),{code:'ASR_FAILED',saved:[root+'/analysis/transcripts/a.json'],path:'C:/Users/other/private.bin'});
 const safe=toolError(raw,{dataDir:root});
 a.equal(safe.code,'ASR_FAILED');a.equal(safe.message,"open '…/model.bin' failed");
 a.deepEqual(safe.saved,['analysis/transcripts/a.json']);a.equal(safe.path,null);
 a.deepEqual(toolError({saved:['file:///C:/Users/Some%20One/data/analysis/transcripts/a.json']},{dataDir:root}).saved,['analysis/transcripts/a.json']);
});
test('old structured and text error results are scrubbed without breaking source routes',()=>{
 const root='C:/Users/someone/data';
 const raw=JSON.stringify({error:'failed at '+root+'/x.bin',saved:[root+'/analysis/transcripts/a.json'],src:'/media/a.wav',code:'KEEP'});
 const safe=JSON.parse(toolError(raw,{dataDir:root,legacy:true}));
 a.equal(safe.code,'KEEP');a.equal(safe.src,'/media/a.wav');a.equal(safe.error,'failed at x.bin');
 a.deepEqual(safe.saved,['analysis/transcripts/a.json']);
 a.equal(toolError('Export failed: '+root+'/x.bin; source /media/a.wav',{dataDir:root,legacy:true}),'Export failed: x.bin; source /media/a.wav');
});
test('no-path errors remain actionable and repeated normalization is stable',()=>{
 const raw={error:'decoder failed (EACCES); retry with supported audio',code:'EACCES',saved:['analysis/transcripts/a.json']};
 a.deepEqual(toolError(raw),raw);a.deepEqual(toolError(toolError(raw)),raw);
});
test('a real data root inside a route namespace is not mistaken for a virtual route',()=>{
 a.equal(toolError('Export failed: /media/Users/someone/private.json',{dataDir:'/media/Users/someone',legacy:true}), 'Export failed: private.json');
 a.equal(toolError({error:'failed: /media/Users/someone/private.json'},{dataDir:'/tmp/data',legacy:true}).error,'failed: …/private.json');
});
test('normal structured tool replies sanitize only diagnostic leaves before storage',()=>{
 const input=JSON.stringify({src:'/media/a.wav',text:'ordinary source data',warning:{code:'EACCES',message:'cannot open C:/Users/someone/a.wav'}});
 const out=JSON.parse(toolError(input,{result:true}));
 a.equal(out.src,'/media/a.wav');a.equal(out.text,'ordinary source data');
 a.deepEqual(out.warning,{code:'EACCES',message:'cannot open …/a.wav'});
 a.equal(toolError('Imported → {"src":"/media/a.wav"}',{result:true}),'Imported → {"src":"/media/a.wav"}');
});

test('a ticket or token held under its own key in a structured error is hidden whole (#255)',()=>{
 const t='a'.repeat(64);
 a.deepEqual(toolError({error:{ticket:t,conn:'c1'}}),{error:{ticket:'…',conn:'c1'}});
 a.deepEqual(toolError({detail:{Token:t,code:'TASK_TICKET_REFUSED'}}),{detail:{Token:'…',code:'TASK_TICKET_REFUSED'}});
 a.deepEqual(toolError([{ticket:t}]),[{ticket:'…'}]);
 a.equal(JSON.parse(toolError(JSON.stringify({ok:true,warning:{ticket:t}}),{result:true})).warning.ticket,'…','an error leaf of a tool reply too');
 a.equal(JSON.parse(toolError(JSON.stringify({ok:true,ticket:t}),{result:true})).ticket,t,'a successful reply keeps the ticket its caller asked for');
 a.deepEqual(toolError({error:{tickets:2,tokenCount:3}}),{error:{tickets:2,tokenCount:3}},'only the exact key names');
});
