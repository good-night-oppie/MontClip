'use strict';
// Meta (Muse Spark) as an AI service (the owner, 2026-11-04, for the Meta AI developer hackathon). A local HTTP server
// stands in for api.meta.ai: the request the product makes (path, model, Authorization, the format note) goes to it,
// its reply (a keep_ranges edit: "delete 3–5 s") is checked and applied by the editor's own code and is one undo step.
// A wrong key (401) and a wrong model name are told in plain words. No real key and no network beyond 127.0.0.1.
const {test}=require('node:test'),a=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../desktop/agent-service'),F=require('../agent-format'),V=require('../agent-conversation'),P=require('../chat-proposal'),R=require('../range-plan'),E=require('../agent-events'),U=require('../ui-preferences');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const FAKE_KEY='test-only-not-a-real-key';

// The fake api.meta.ai. `reply(req, body)` returns [status, json].
async function fakeMeta(reply){
 const seen=[];
 const server=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
  let body=null;try{body=JSON.parse(raw);}catch{}
  seen.push({method:req.method,path:req.url,auth:req.headers.authorization,type:req.headers['content-type'],body});
  const [status,json]=reply(req,body);res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(json));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port,urls=[];
 // the product's fixed URL, redirected to the fake host with the same path, method, headers and body
 const fetchVia=async(url,init)=>{urls.push(url);return fetch('http://127.0.0.1:'+port+new URL(url).pathname,init);};
 return {seen,urls,fetchVia,close:()=>new Promise(r=>server.close(r))};
}
const service=(fake,{provider='meta',model=S.DEFAULT_MODELS.meta}={})=>S.createService({read:()=>null,write(){},seal:k=>'sealed:'+k,unseal:s=>s.replace(/^sealed:/,''),
 request:(c,p,signal)=>S.httpsRequest(c,p,signal,{fetch:fake.fetchVia})});
const payload=(text)=>({version:1,requestId:'r'+crypto.randomUUID().slice(0,8),projectId:'p',sequenceId:'main',revision:1,gen:1,messages:[{role:'user',content:text}]});
const chatReply=(content)=>[200,{id:'chatcmpl-1',object:'chat.completion',model:'muse-spark-1.1',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content}}]}];

// a 10 s recording on the timeline, with its sound linked
function fixture(){
 return {revision:1,fps:30,width:1280,height:720,markers:[],comps:[],media:[{id:'m',name:'合成.mp4',src:'/media/合成.mp4',kind:'video',duration:10}],
  clips:[{id:'v',kind:'video',mediaId:'m',track:'V1',start:0,in:0,duration:10,props:{volume:0},linkGroup:'g'},
   {id:'a',kind:'audio',mediaId:'m',track:'A1',start:0,in:0,duration:10,linkGroup:'g'}]};
}
// The editor's own apply and undo (app.js), run on that document
function editor(doc){
 const src=read('app.js'),fn=n=>{const s=src.indexOf('function '+n+'(');a.ok(s>=0,n);return src.slice(s,src.indexOf('\n}',s)+2);};
 const ctx={project:doc,runtime:{undo:[],redo:[]},crypto,MontClipEvents:E,SeqLib:{activeId:()=>'main',find:()=>null,others:()=>[]},seqRoot:()=>doc,
  applyProject(p){for(const k of Object.keys(p))ctx.project[k]=p[k];},setSelection(){},setTime(){},scheduleSave(){},renderTranscript(){},pruneSelection(){},renderInspector(){},toast(){}};
 vm.createContext(ctx);
 vm.runInContext(['undoSnapshot','pushUndo','hasSeqClips','restoreSnapshot','counterSnapshot','eventLog','eventIdOf','withEventId','moveEvent','undoEvent','undo','commitRangePlan'].map(fn).join('\n')
  +'\nconst isOutsideStep=(snap)=>typeof snap==="string"&&snap.startsWith(\'{"outside":true,\');',ctx);
 return ctx;
}
const timeline=doc=>JSON.stringify(doc.clips.map(c=>[c.id,c.track,c.start,c.in,c.duration]));

test('Meta is offered: listed after OpenRouter, Muse Spark filled in, its fixed endpoint, the default unchanged',()=>{
 a.equal(S.ENDPOINTS.meta,'https://api.meta.ai/v1/chat/completions');
 a.deepEqual(S.PUBLIC_PROVIDERS,['openrouter','meta','deepseek','openai']);
 a.equal(S.DEFAULT_MODELS.meta,'muse-spark-1.1');
 a.equal(S.DEFAULT_PROVIDER,'openrouter','the default service is still the owner\'s choice of 2026-11-02');
 const g=S.createService({read:()=>null,write(){},seal:k=>k,unseal:k=>k}).get();
 a.ok(g.providers.includes('meta'));a.equal(g.defaultModels.meta,'muse-spark-1.1');
});

test('the settings show "Meta（Muse Spark）" (zh) / "Meta (Muse Spark)" (en), and the review shows api.meta.ai',()=>{
 const pane=read('agent-ui/pane.tsx'),bundle=read('cindy-official.js');
 a.match(pane,/meta:'Meta（Muse Spark）'/);a.match(pane,/PROVIDER_NAME_EN:Record<string,string>=\{meta:'Meta \(Muse Spark\)'\}/);
 a.match(pane,/meta:'api\.meta\.ai'/,'the review dialog names the host the text goes to');
 a.match(pane,/<p>\{DOMAIN\[provider\]\|\|DOMAIN\.openai\} · \{cfg\?\.model\}<\/p>/,'the review line reads the same map');
 // esbuild writes the full-width brackets as （ / ）
 for(const s of ['Meta\\uFF08Muse Spark\\uFF09','Meta (Muse Spark)','api.meta.ai'])a.ok(bundle.includes(s),'the bundle was rebuilt: '+s);
});

test('Yolo\'s outgoing allowlist and the external target include api.meta.ai (from the fixed endpoints)',()=>{
 const main=read('desktop/main.js');
 a.match(main,/allowlist: Object\.values\(AgentService\.ENDPOINTS\)/);
 a.ok(Object.values(S.ENDPOINTS).includes('https://api.meta.ai/v1/chat/completions'));
 const h=require('../desktop/agent-policy-host').createPolicyHost({confirmYolo:async()=>true,external:()=>({enabled:true,allowlist:Object.values(S.ENDPOINTS)}),language:()=>'zh-CN'});
 const EXT=require('../capabilities').list().find(c=>c.risk==='external').name;
 const d=h.decide({sessionId:'s1',capability:EXT,target:{kind:'origin',value:'https://api.meta.ai/v1/chat/completions'},bytes:100});
 a.equal(d.target,'api.meta.ai');
});

test('"把 3 到 5 秒删掉": the request goes to /v1/chat/completions with the model and the key; the reply is applied and is one undo step',async()=>{
 const reply=JSON.stringify({type:'keep_ranges',output_mode:'one_file',ranges:[{clipId:'v',from:0,to:3},{clipId:'v',from:5,to:10}]});
 const fake=await fakeMeta(()=>chatReply(reply));
 try{
  const s=service(fake);
  a.equal(s.configure({provider:'meta',model:'muse-spark-1.1',apiKey:FAKE_KEY}).configured,true);
  const r=await s.send(payload('把 3 到 5 秒删掉'));
  a.equal(r.ok,true,JSON.stringify(r));
  a.deepEqual(fake.urls,['https://api.meta.ai/v1/chat/completions'],'the fixed Meta endpoint, nothing else');
  a.equal(fake.seen.length,1);const q=fake.seen[0];
  a.equal(q.method,'POST');a.equal(q.path,'/v1/chat/completions');a.equal(q.auth,'Bearer '+FAKE_KEY);a.equal(q.type,'application/json');
  a.equal(q.body.model,'muse-spark-1.1');a.equal(q.body.stream,false);
  a.deepEqual(q.body.messages[0],{role:'system',content:F.FORMAT_NOTE},'the fixed format note goes first');
  a.equal(q.body.messages.at(-1).content,'把 3 到 5 秒删掉');
  // the editor checks the reply against the project, then applies it with its own range engine
  const doc=fixture(),before=timeline(doc),ed=editor(doc);
  const response=V.parseProposal(r.text);a.equal(response.type,'keep_ranges');
  const proposal=P.prepare(response,{doc:JSON.parse(JSON.stringify(doc)),context:{projectId:'p',sequenceId:'main',generation:1,revision:1}});
  a.deepEqual(proposal.keep,[{from:0,to:3},{from:5,to:10}]);
  const ev=ed.eventLog().append(P.event(proposal,{id:crypto.randomUUID(),runId:crypto.randomUUID(),step:1,actor:'ai',at:new Date().toISOString(),revision:1}));
  proposal.eventId=ev.id;
  const plan=R.create(JSON.parse(JSON.stringify(doc)),proposal.keep);plan.keep=proposal.keep;
  ed.commitRangePlan(plan,proposal);
  const video=doc.clips.filter(c=>c.kind==='video').map(c=>[c.start,c.in,c.duration]);
  a.deepEqual(video,[[0,0,3],[3,5,5]],'3–5 s is gone and the rest closes up');
  a.equal(doc.clips.filter(c=>c.kind==='audio').length,2,'the sound is cut with it');
  a.equal(ed.runtime.undo.length,1,'one undo step');a.equal(ed.eventLog().get(ev.id).state,'applied');
  a.equal(ed.undoEvent(ev.id).ok,true);
  a.equal(timeline(doc),before,'undo puts the timeline back');a.equal(ed.eventLog().get(ev.id).state,'undone');
  a.equal(ed.runtime.redo.length,1);
 }finally{await fake.close();}
});

test('a wrong key (401) and a wrong model name are explained in plain words; the draft is kept',async()=>{
 const fake=await fakeMeta((req,body)=>req.headers.authorization!=='Bearer '+FAKE_KEY
  ?[401,{error:{message:'Invalid API key provided.',type:'invalid_request_error',code:'invalid_api_key'}}]
  :body.model!=='muse-spark-1.1'?[404,{error:{message:'The model `'+body.model+'` does not exist or you do not have access to it.',type:'invalid_request_error',code:'model_not_found'}}]
  :chatReply('好的'));
 try{
  const bad=service(fake);bad.configure({provider:'meta',model:'muse-spark-1.1',apiKey:'wrong-'+FAKE_KEY});
  a.equal((await bad.send(payload('hi'))).code,'AUTH');
  const typo=service(fake);typo.configure({provider:'meta',model:'muse-spark-9',apiKey:FAKE_KEY});
  a.equal((await typo.send(payload('hi'))).code,'MODEL_INVALID');
  // the same model error as a 400 is told the same way
  const r400={ok:false,status:400,body:[Buffer.from(JSON.stringify({error:{message:'Unknown model: muse-spark-9'}}))]};
  await a.rejects(S.httpsRequest({provider:'meta',model:'muse-spark-9',key:FAKE_KEY},payload('hi'),new AbortController().signal,{fetch:async()=>r400}),/MODEL_INVALID/);
  // a 404 that is not about the model stays a provider error
  const r404={ok:false,status:404,body:[Buffer.from(JSON.stringify({error:{message:'Not Found'}}))]};
  await a.rejects(S.httpsRequest({provider:'meta',model:'m',key:FAKE_KEY},payload('hi'),new AbortController().signal,{fetch:async()=>r404}),/PROVIDER_HTTP/);
  const zh=U.text['zh-CN'],en=U.text.en;
  a.equal(zh.officialPane_errAuth,'密钥不对或没有权限，请去设置里检查。草稿仍保留。');
  a.equal(zh.officialPane_errModel,'模型名称不对，请去设置里检查。草稿仍保留。');
  a.ok(en.officialPane_errAuth&&en.officialPane_errModel);
  const pane=read('agent-ui/pane.tsx');a.match(pane,/AUTH:'errAuth',MODEL_INVALID:'errModel'/);
 }finally{await fake.close();}
});

test('no real key in the synthetic tests or the Meta real-model files',()=>{
 for(const f of ['test/agent-meta-provider.test.js','real-tests/run-meta-e2e.cjs','real-tests/meta-e2e-smoke.cjs','real-tests/meta-key-file.cjs'])
  a.ok(!/\b(sk|mk|meta)[-_][A-Za-z0-9]{20,}/.test(read(f)),f);
});
