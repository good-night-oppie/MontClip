'use strict';
// Deja / JJ 2026-11-02 (#26): OpenRouter is for testing the product's real request path, not for
// streamers. A release lists only OpenAI and DeepSeek and cannot reach openrouter.ai; a development
// build, or a release started with the main process's own test switch, also lists OpenRouter. The page
// has no way to turn it on. Copy: the format note is explained and folded; noProposal reworded.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../desktop/agent-service'),V=require('../ui-preferences');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const stored=provider=>JSON.stringify({version:1,provider,model:'vendor/m:free',secret:'sealed'});
const svc=(extra={})=>{const calls=[];const s=S.createService({read:()=>null,write(){},seal:k=>k,unseal:()=>'k',request:async(c)=>{calls.push(c);return{text:'ok'};},...extra});return{s,calls};};
const payload=()=>({version:1,requestId:'r'+Math.random().toString(36).slice(2,8),projectId:'p',sequenceId:'main',revision:1,gen:0,messages:[{role:'user',content:'hi'}]});

test('a release lists OpenAI and DeepSeek only, and cannot be configured for OpenRouter',()=>{
 a.deepEqual(S.PUBLIC_PROVIDERS,['openai','deepseek']);a.deepEqual(S.TEST_PROVIDERS,['openrouter']);
 const {s}=svc();a.deepEqual(s.get().providers,['openai','deepseek']);
 a.equal(s.configure({provider:'openrouter',model:'m',apiKey:'k'}).code,'CONFIG_INVALID');
 a.equal(s.configure({provider:'deepseek',model:'deepseek-chat',apiKey:'k'}).configured,true);
});

test('a release never sends to openrouter.ai, even with an OpenRouter connection saved by a development build',async()=>{
 const {s,calls}=svc({read:()=>stored('openrouter')});
 const g=s.get();a.equal(g.ok,true,'not a broken file: no reset is offered');a.equal(g.configured,false);a.notEqual(g.provider,'openrouter');
 a.equal((await s.send(payload())).code,'UNCONFIGURED');a.equal(calls.length,0);
 // the real request function refuses it too, before any network call
 let fetched=0;const fake=async()=>{fetched++;throw Error('no');};
 await a.rejects(S.httpsRequest({provider:'openrouter',model:'m',key:'k'},payload(),new AbortController().signal,{fetch:fake}),/PROVIDER_UNAVAILABLE/);
 a.equal(fetched,0);
});

test('with the test switch the same service lists and uses OpenRouter, through its fixed endpoint',async()=>{
 const {s,calls}=svc({read:()=>stored('openrouter'),providers:S.ALL_PROVIDERS});
 a.deepEqual(s.get().providers,['openai','deepseek','openrouter']);a.equal(s.get().configured,true);
 a.equal((await s.send(payload())).ok,true);a.equal(calls[0].provider,'openrouter');
 let url;await S.httpsRequest({provider:'openrouter',model:'m',key:'k'},payload(),new AbortController().signal,{providers:S.ALL_PROVIDERS,fetch:async(u)=>{url=u;return{ok:true,status:200,body:[Buffer.from(JSON.stringify({choices:[{message:{content:'x'}}]}))]};}});
 a.equal(url,'https://openrouter.ai/api/v1/chat/completions');
});

test('the switch: on in development; in a release only by a launch argument or an environment variable',()=>{
 const on=S.testProvidersEnabled;
 a.equal(on({isPackaged:false,argv:[],env:{}}),true);
 a.equal(on({isPackaged:true,argv:['MontClip.exe'],env:{}}),false);
 a.equal(on({isPackaged:true,argv:['MontClip.exe','--montclip-test-providers'],env:{}}),true);
 a.equal(on({isPackaged:true,argv:[],env:{MONTCLIP_TEST_PROVIDERS:'1'}}),true);
 a.equal(on({isPackaged:true,argv:[],env:{MONTCLIP_TEST_PROVIDERS:'true'}}),false,'exactly "1"');
 const main=read('desktop/main.js');
 a.match(main,/createDiskService\(app\.getPath\('userData'\),safeStorage,undefined,\{providers:AgentService\.testProvidersEnabled\(\{isPackaged:app\.isPackaged,argv:process\.argv,env:process\.env\}\)\?AgentService\.ALL_PROVIDERS:AgentService\.PUBLIC_PROVIDERS\}\)/);
 // the page has no channel that sets it
 const preload=read('desktop/view-preload.js');a.ok(!/provider[s]?\s*:/i.test(preload.slice(preload.indexOf('montclipAgentService'))) ,'no provider list setter in the preload');
 a.ok(!/montclip:agent:providers|testProviders/.test(preload+read('agent-ui/pane.tsx')));
});

test('the settings list comes from the service, not a fixed list in the page',()=>{
 const pane=read('agent-ui/pane.tsx');
 a.ok(!/<option value="openrouter">/.test(pane),'no hard-coded OpenRouter option');
 a.match(pane,/\(cfg\?\.providers\|\|\['openai','deepseek'\]\)\.map\(/);
 a.ok(!/免费|free/i.test(JSON.stringify(V.text['zh-CN'])+JSON.stringify(V.text.en).replace(/:free/g,'')),'no "free" in the interface');
});

test("JJ's copy: the format note is explained, folded by default, and still counted and shown in full in the raw request",()=>{
 const zh=V.text['zh-CN'],en=V.text.en;
 a.equal(zh.officialPane_formatNoteExplain,'下面这段英文是 MontClip 每次自动附上的固定说明，只是告诉 AI 怎么写剪辑建议。里面没有你的录像、字幕或项目内容，你不用看懂。');
 a.equal(en.officialPane_formatNoteExplain,'The text below is a fixed note MontClip adds to every request. It only tells the AI how to format editing suggestions. It contains none of your recordings, subtitles or project content.');
 a.equal(zh.officialPane_formatNote,'每次请求都会附带的格式说明');
 // QQ 2026-11-02: the summary names what goes out instead of a total
 a.equal(zh.officialPane_reviewSummary,'这次会发送一段固定的格式说明、消息文字、引用的 {captions} 条字幕，以及之前的 {history} 条消息（包含其中的引用）。');
 a.equal(en.officialPane_reviewSummary,'This will send a fixed formatting note, your message, {captions} quoted subtitles, and {history} earlier messages (including their quotes).');
 a.equal(zh.officialPane_noProposal,'这条回复不是剪辑建议。想让它直接剪，可以说清要保留哪几句。');
 a.equal(en.officialPane_noProposal,'This reply is not an editing suggestion. To have it cut for you, say which sentences to keep.');
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/<section data-format-note><p data-format-explain>\{t\.formatNoteExplain\}<\/p><details data-format-details><summary>\{t\.formatNote\}<\/summary><pre>\{MontClipFormat\.FORMAT_NOTE\}<\/pre><\/details><\/section>/);
 a.ok(!/<details data-format-details open/.test(pane),'folded by default');
 a.match(pane,/MontClipFormat\.body\(cfg\?\.model,MontClipFormat\.withFormat\(review\?\.messages\|\|\[\]\)\)/,'the raw request still shows it in full');
 a.match(pane,/\.replace\('\{total\}',String\(\(review\?\.messages\?\.length\|\|0\)\+1\)\)/,'and the count still includes it');
});

test('the ADR records who decides about opening OpenRouter to streamers',()=>{
 const adr=read('docs/decisions/2026-11-01-official-cindy-port.md');
 a.match(adr,/OpenRouter/);a.match(adr,/--montclip-test-providers/);a.match(adr,/MONTCLIP_TEST_PROVIDERS=1/);
 a.match(adr,/owner decides/i);a.match(adr,/免费模型的服务商可能会保存你发送的文字/);a.match(adr,/QQ/);a.match(adr,/retain/i);a.match(adr,/"free"/);
});

// VV's real-model recheck (Deja 2026-11-02): a wrong model name gets its own line; a wrong key
// (and a wrong model name) gets the same "Go to settings" button as an unconfigured service.
const reply400=(text,status=400)=>async()=>({ok:false,status,body:(async function*(){yield Buffer.from(text);})()});
async function code400(fake){try{await S.httpsRequest({provider:'deepseek',model:'m',key:'k'},payload(),new AbortController().signal,{fetch:fake});return 'OK';}catch(e){return e.message;}}
test('a 400 that names a bad model is MODEL_INVALID; any other 400 stays PROVIDER_HTTP',async()=>{
 a.equal(await code400(reply400(JSON.stringify({error:{message:'nvidia/x is not a valid model ID',code:400}}))),'MODEL_INVALID');
 a.equal(await code400(reply400(JSON.stringify({error:{message:'Invalid model ID: foo'}}))),'MODEL_INVALID');
 a.equal(await code400(reply400(JSON.stringify({error:{message:'Model not found'}}))),'MODEL_INVALID');
 a.equal(await code400(reply400(JSON.stringify({error:{message:'Model Not Exist',type:'invalid_request_error'}}))),'MODEL_INVALID');
 a.equal(await code400(reply400(JSON.stringify({error:{message:'messages: too long'}}))),'PROVIDER_HTTP');
 a.equal(await code400(reply400('model not found',404)),'PROVIDER_HTTP','only a 400');
 // the error body is read only up to a small limit
 let chunks=0;const huge=async()=>({ok:false,status:400,body:(async function*(){for(let i=0;i<1000;i++){chunks++;yield Buffer.alloc(1024,32);}})()});
 a.equal(await code400(huge),'PROVIDER_HTTP');a.ok(chunks<=20,'stops reading a long error body: '+chunks);
 const {s}=svc({read:()=>stored('deepseek'),request:async()=>{throw Error('MODEL_INVALID');}});
 a.equal((await s.send(payload())).code,'MODEL_INVALID','passed to the page as its own code');
});
test('the draft is kept after a model-name error',async()=>{
 const {create}=require('../agent-pane'),{createConversation}=require('../agent-conversation');
 const ctx=()=>({projectId:'p',sequenceId:'s',gen:1,revision:2});const state=create();state.context(ctx());state.draft('只保留第一句');
 const c=createConversation({state,getContext:ctx,service:{send:async()=>({ok:false,code:'MODEL_INVALID'}),cancel:async()=>({ok:true})},id:()=>'r1'});
 c.prepare();const r=await c.confirm();a.equal(r.code,'MODEL_INVALID');a.equal(state.current().draft,'只保留第一句');a.deepEqual(state.current().messages,[]);
});
test('wrong model name: its own line; wrong key: a Go to settings button like the unconfigured one',()=>{
 a.equal(V.text['zh-CN'].officialPane_errModel,'模型名称不对，请去设置里检查。草稿仍保留。');
 a.equal(V.text.en.officialPane_errModel,'The model name is wrong. Check it in settings. Your draft is kept.');
 const pane=read('agent-ui/pane.tsx');
 a.match(pane,/MODEL_INVALID:'errModel'/);
 a.match(pane,/\{\(notice==='unconfigured'\|\|notice==='errAuth'\|\|notice==='errModel'\)&&<button data-go-config onClick=\{\(\)=>\{if\(!configOpen\)void openConfig\(\);\}\}>\{t\.goConfig\}<\/button>\}/,'the same button, the same action');
 a.match(read('desktop/agent-service.js'),/const KNOWN=new Set\(\[[^\]]*'MODEL_INVALID'/);
});
