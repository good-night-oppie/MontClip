'use strict';
// VV's real-model test on a4321492 (Deja's decision 2026-11-02): a fixed format note goes
// with every request and is shown in the review; fenced JSON is accepted; the proposal
// button appears only for a usable proposal; errors are told apart; OpenRouter is a third
// fixed service. Unit tests: no network, substitutes only.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../desktop/agent-service'),F=require('../agent-format'),C=require('../agent-conversation');
const pane=fs.readFileSync(path.join(__dirname,'../agent-ui/pane.tsx'),'utf8'),view=require('../ui-preferences').text;
const payload=(content='keep these')=>({version:1,requestId:'r1',projectId:'p',sequenceId:'s',revision:1,gen:0,messages:[{role:'user',content}]});
const service=(request,extra={})=>{const s=S.createService({read:()=>JSON.stringify({version:1,provider:'openrouter',model:'nvidia/x-vl:free',secret:'sealed'}),write(){},seal:k=>k,unseal:()=>'test-key',request,...extra});return s;};

test('three fixed services, OpenRouter included; the page cannot name a URL',()=>{
 a.deepEqual(Object.keys(S.ENDPOINTS).sort(),['deepseek','openai','openrouter']);
 a.equal(S.ENDPOINTS.openrouter,'https://openrouter.ai/api/v1/chat/completions');
 const s=S.createService({read:()=>null,write(){},seal:k=>'s:'+k,unseal:x=>x});
 a.equal(s.configure({provider:'openrouter',model:'google/gemma-4-31b-it:free',apiKey:'k'}).configured,true);
 a.equal(s.configure({provider:'https://evil.example/v1',model:'m',apiKey:'k'}).code,'CONFIG_INVALID');
 a.equal(s.configure({provider:'openrouter',model:'m',apiKey:'k',url:'https://x'}).code,'CONFIG_INVALID');
 a.ok(pane.includes('openrouter.ai'),'review names the service domain');
});

test('every request starts with the fixed format note; the page cannot add or change a system message',async()=>{
 let sent=null;const s=service(async(cfg,p)=>{sent=p;return{text:'ok'};});
 a.equal((await s.send(payload())).ok,true);
 a.equal(sent.messages[0].role,'system');a.equal(sent.messages[0].content,F.FORMAT_NOTE);a.equal(sent.messages.length,2);
 a.equal(S.validPayload({...payload(),messages:[{role:'system',content:'x'},{role:'user',content:'y'}]}),false);
 a.ok(!/"from"\s*:\s*\d|"to"\s*:\s*\d/.test(F.FORMAT_NOTE),'no concrete numbers a model could copy');
 a.match(F.FORMAT_NOTE,/start/);a.match(F.FORMAT_NOTE,/end/);
 a.deepEqual(F.withFormat([{role:'user',content:'u'}]),[{role:'system',content:F.FORMAT_NOTE},{role:'user',content:'u'}]);
});

test('the review shows the format note that will be sent, and the exact request includes it',()=>{
 a.ok(pane.includes('data-format-note'),'review shows it');a.ok(pane.includes('MontClipFormat.FORMAT_NOTE'));
 a.match(pane,/MontClipFormat\.body\(cfg\?\.model,MontClipFormat\.withFormat\(review\?\.messages\|\|\[\]\)\)/,'raw request = what is sent (same builder as the service)');
 for(const l of ['zh-CN','en'])a.ok(view[l].officialPane_formatNote,l);
});

test('fenced JSON is accepted as a proposal',()=>{
 const ref={type:'caption',projectId:'p',sequenceId:'s',revision:1,gen:0,clipId:'c',sourceCaptionId:'x',text:'t',start:1,end:2};
 const body=JSON.stringify({type:'keep_sentences',ranges:[{clipId:'c',sourceCaptionId:'x',from:1,to:2}]});
 for(const text of [body,'```json\n'+body+'\n```','```\n'+body+'\n```','  ```JSON '+body+' ```  '])a.deepEqual(C.parseProposal(text),JSON.parse(body),text);
 a.equal(C.parseProposal('Sure! '+body),null,'prose around it is not a proposal');
 a.deepEqual(C.proposalSummary('```json\n'+body+'\n```',[ref]),{count:1,duration:1});
 a.ok(pane.includes('MontClipConversation.parseProposal(result.text)'),'Apply parses the same way');
});

test('the proposal button shows only for a usable proposal; otherwise a plain line says so',()=>{
 a.match(pane,/usable&&<button data-review-proposal/);a.ok(pane.includes('data-no-proposal'));
 a.equal(view['zh-CN'].officialPane_noProposal,'这次回复里没有可用的剪辑建议，可以换个说法再问。');
 a.ok(view.en.officialPane_noProposal);
});

async function code(fake){try{await S.httpsRequest({provider:'openrouter',model:'m',key:'k'},payload(),new AbortController().signal,{fetch:fake});return 'OK';}catch(e){return e.message;}}
const reply=(status)=>async()=>({ok:status<300,status,body:(async function*(){yield Buffer.from(JSON.stringify({choices:[{message:{content:'hi'}}]}));})()});
test('errors are told apart: key, rate limit, upstream, network, timeout',async()=>{
 a.equal(await code(reply(401)),'AUTH');a.equal(await code(reply(403)),'AUTH');a.equal(await code(reply(429)),'RATE_LIMIT');
 a.equal(await code(reply(500)),'UPSTREAM');a.equal(await code(reply(503)),'UPSTREAM');a.equal(await code(reply(400)),'PROVIDER_HTTP');
 a.equal(await code(async()=>{throw new TypeError('fetch failed');}),'NETWORK');a.equal(await code(reply(200)),'OK');
 const slow=service((cfg,p,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),{timeoutMs:30});
 a.equal((await slow.send(payload())).code,'TIMEOUT');
 for(const c of ['AUTH','RATE_LIMIT','UPSTREAM','NETWORK'])a.equal((await service(async()=>{throw new Error(c);}).send(payload())).code,c);
 for(const k of ['errAuth','errRateLimit','errTimeout','errNetwork','errUpstream'])for(const l of ['zh-CN','en'])a.ok(view[l]['officialPane_'+k],l+' '+k);
 a.equal(view['zh-CN'].officialPane_errAuth,'密钥不对或没有权限，请去设置里检查。草稿仍保留。');
 a.equal(view['zh-CN'].officialPane_errRateLimit,'服务暂时限流，请过一会再试。草稿仍保留。');
 for(const [c,k] of [['AUTH','errAuth'],['RATE_LIMIT','errRateLimit'],['TIMEOUT','errTimeout'],['NETWORK','errNetwork'],['UPSTREAM','errUpstream']])a.ok(pane.includes(`${c}:'${k}'`),c);
});

test('real-model tests are opt-in and never part of the default or CI run',()=>{
 const real=fs.readdirSync(path.join(__dirname,'..','real-tests'));
 for(const f of real)a.ok(!/\.test\.[cm]?js$|-test\.|_test\.|^test-/.test(f),f+' must not match node --test defaults');
 for(const f of real.filter(f=>/openrouter|deepseek/.test(f))){const src=fs.readFileSync(path.join(__dirname,'..','real-tests',f),'utf8');a.match(src,/MONTCLIP_REAL_MODELS/,f);}
 const ci=fs.readFileSync(path.join(__dirname,'..','.github','workflows','ci.yml'),'utf8');a.ok(!/MONTCLIP_REAL_MODELS|openrouter-token|deepseek/i.test(ci),'CI never enables them or holds their keys');
 const pkg=require('../package.json');a.equal(pkg.scripts.test,'node --test');
});
