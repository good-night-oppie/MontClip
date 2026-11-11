'use strict';
// Integration tests against a real model: an OpenRouter free vision model (id ends in
// ":free"), through the product's own request path (desktop/agent-service.js with the
// fixed OpenRouter endpoint). Off unless MONTCLIP_REAL_MODELS=1; never run in CI.
//   MONTCLIP_REAL_MODELS=1 node --test dev/real-tests/openrouter.integration.cjs
// Key: only ~/.openrouter-montclip (mode 600, on europa) or the file MONTCLIP_OPENROUTER_KEY_FILE names; a file with wider
// permissions is refused and the tests are skipped (dev/real-tests/key-file.cjs). It is never printed, logged or written anywhere.
// Rate limits (429) and upstream failures are reported as SKIPPED (with the reason), not passed.
const {test}=require('node:test'),a=require('node:assert/strict'),path=require('node:path');
const S=require('../../desktop/agent-service'),C=require('../../agent-conversation'),K=require('./key-file.cjs');
const ON=process.env.MONTCLIP_REAL_MODELS==='1';
const found=ON?K.readKey():{},KEY=found.key||null;
const off=!ON?'real-model tests are off (set MONTCLIP_REAL_MODELS=1)':!KEY?found.skip:false;
const report=[];const scrub=K.scrubber(KEY);
const out=process.env.MONTCLIP_REAL_REPORT||path.join(__dirname,'..','docs','validation','real-model-integration.json');

async function pickModel(){
 if(process.env.MONTCLIP_OPENROUTER_MODEL)return process.env.MONTCLIP_OPENROUTER_MODEL;
 const r=await fetch('https://openrouter.ai/api/v1/models',{headers:{Authorization:'Bearer '+KEY}});
 const list=(await r.json()).data||[];
 const free=list.filter(m=>/:free$/.test(m.id)&&(m.architecture?.input_modalities||[]).includes('image')).map(m=>m.id);
 return free.find(id=>/nemotron.*vl/i.test(id))||free[0]||null;
}
let modelP=null;const model=()=>modelP||(modelP=off?Promise.resolve(null):pickModel());
// OpenRouter is a test provider: the integration test switches it on explicitly, as a release never does
function service(key,m){return S.createService({read:()=>JSON.stringify({version:1,provider:'openrouter',model:m,secret:'sealed'}),write(){},seal:k=>k,unseal:()=>key,timeoutMs:90000,providers:S.ALL_PROVIDERS});}
const refs=[{type:'caption',projectId:'p_it',sequenceId:'main',revision:3,gen:0,clipId:'c1',sourceCaptionId:'c1',text:'今天我们来看三个剪辑技巧。',start:1,end:3.2},
 {type:'caption',projectId:'p_it',sequenceId:'main',revision:3,gen:0,clipId:'c2',sourceCaptionId:'c2',text:'第一个是删掉停顿。',start:3.2,end:5}];
const payload=(text,withRefs=true)=>({version:1,requestId:'it'+Date.now()+Math.random().toString(36).slice(2,7),projectId:'p_it',sequenceId:'main',revision:3,gen:0,
 messages:[{role:'user',content:text+(withRefs?'\n\n'+JSON.stringify({references:refs}):'')}]});
async function run(t,name,fn){
 const m=await model();if(!m){report.push({name,result:'skipped',reason:off||'no free vision model listed'});return t.skip(off||'no free vision model listed');}
 const t0=Date.now(),r=await fn(m),ms=Date.now()-t0;
 if(r.skip){report.push({name,model:m,result:'skipped',reason:r.skip,ms});return t.skip(r.skip);}
 report.push({name,model:m,result:'passed',ms,...r.note});
}
const transient=(res)=>res.code==='RATE_LIMIT'?'429 rate limited by OpenRouter/upstream':res.code==='UPSTREAM'?'upstream unavailable (5xx)':res.code==='TIMEOUT'?'no answer within 90 s':res.code==='NETWORK'?'network unreachable':null;

test('plain request "keep these two" comes back as a usable proposal (format note sent by the product)',{skip:off},async t=>{
 await run(t,'plain-keep',async m=>{
  const res=await service(KEY,m).send(payload('只保留这两句'));
  if(!res.ok){const why=transient(res);if(why)return{skip:why};a.fail('request failed: '+res.code);}
  const sum=C.proposalSummary(res.text,refs);
  a.ok(sum,'usable proposal; reply was: '+scrub(res.text).slice(0,300));
  a.equal(sum.count,2);return{note:{reply:scrub(res.text).slice(0,400)}};
 });
});
test('an ordinary question gets an ordinary answer, not a proposal',{skip:off},async t=>{
 await run(t,'ordinary-question',async m=>{
  const res=await service(KEY,m).send(payload('这两句字幕主要在讲什么？用一句话回答。'));
  if(!res.ok){const why=transient(res);if(why)return{skip:why};a.fail('request failed: '+res.code);}
  a.equal(C.proposalSummary(res.text,refs),null,'not a proposal');a.ok(res.text.trim().length>0);
  return{note:{reply:scrub(res.text).slice(0,200)}};
 });
});
test('a wrong key is reported as AUTH (key wrong or no access)',{skip:off},async t=>{
 await run(t,'wrong-key',async m=>{
  const res=await service('sk-or-v1-not-a-real-key-'+Date.now(),m).send(payload('hi',false));
  if(!res.ok&&transient(res))return{skip:transient(res)};
  a.equal(res.code,'AUTH');return{note:{code:res.code}};
 });
});
test.after(()=>{
 if(off)return;
 K.writeReport(out,{when:new Date().toISOString(),provider:'openrouter',endpoint:S.ENDPOINTS.openrouter,results:report,
  counts:{passed:report.filter(r=>r.result==='passed').length,skipped:report.filter(r=>r.result==='skipped').length}},KEY);
});
