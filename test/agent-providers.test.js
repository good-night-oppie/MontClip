'use strict';
// The owner (2026-11-02, relayed by Deja): the default AI service is OpenRouter with DeepSeek's Flash model. A release
// lists OpenRouter first (recommended), then DeepSeek and OpenAI; an unconfigured pane starts on OpenRouter with the
// model filled in. Never "free"; the settings say the provider may keep the text sent (QQ). Earlier (#26) OpenRouter
// was for tests only; that switch remains but no longer changes the list.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../desktop/agent-service'),V=require('../shared/ui-preferences');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const stored=provider=>JSON.stringify({version:1,provider,model:'deepseek/deepseek-v4.1-flash-1017',secret:'sealed'});
const svc=(extra={})=>{const calls=[];const s=S.createService({read:()=>null,write(){},seal:k=>k,unseal:()=>'k',request:async(c)=>{calls.push(c);return{text:'ok'};},...extra});return{s,calls};};
const payload=()=>({version:1,requestId:'r'+Math.random().toString(36).slice(2,8),projectId:'p',sequenceId:'main',revision:1,gen:0,messages:[{role:'user',content:'hi'}]});

// Meta (Muse Spark) joins second (the owner, 2026-11-04, Meta AI developer hackathon); the default does not change.
test('a release lists OpenRouter first, then Meta, DeepSeek and OpenAI; unconfigured it starts on OpenRouter with DeepSeek Flash',()=>{
 a.deepEqual(S.PUBLIC_PROVIDERS,['openrouter','meta','deepseek','openai']);
 a.equal(S.DEFAULT_PROVIDER,'openrouter');
 a.deepEqual(S.DEFAULT_MODELS,{openrouter:'deepseek/deepseek-v4.1-flash-1017',meta:'muse-spark-1.1'});
 const {s}=svc();const g=s.get();
 a.deepEqual(g.providers,['openrouter','meta','deepseek','openai']);a.equal(g.configured,false);
 a.equal(g.provider,'openrouter');a.deepEqual(g.defaultModels,{openrouter:'deepseek/deepseek-v4.1-flash-1017',meta:'muse-spark-1.1'});
 a.equal(s.configure({provider:'openrouter',model:'deepseek/deepseek-v4.1-flash-1017',apiKey:'k'}).configured,true);
});

test('a saved OpenRouter connection is used, through its fixed endpoint',async()=>{
 const {s,calls}=svc({read:()=>stored('openrouter')});
 a.equal(s.get().configured,true);a.equal(s.get().model,'deepseek/deepseek-v4.1-flash-1017');
 a.equal((await s.send(payload())).ok,true);a.equal(calls[0].provider,'openrouter');
 let url;await S.httpsRequest({provider:'openrouter',model:'m',key:'k'},payload(),new AbortController().signal,{fetch:async(u)=>{url=u;return{ok:true,status:200,body:[Buffer.from(JSON.stringify({choices:[{message:{content:'x'}}]}))]};}});
 a.equal(url,'https://openrouter.ai/api/v1/chat/completions');
});

test('only the four fixed endpoints; an unknown provider is refused before any network call',async()=>{
 a.deepEqual(Object.keys(S.ENDPOINTS).sort(),['deepseek','meta','openai','openrouter']);
 const {s}=svc();a.equal(s.configure({provider:'evil',model:'m',apiKey:'k'}).code,'CONFIG_INVALID');
 let fetched=0;await a.rejects(S.httpsRequest({provider:'evil',model:'m',key:'k'},payload(),new AbortController().signal,{fetch:async()=>{fetched++;}}),/PROVIDER_UNAVAILABLE/);
 a.equal(fetched,0);
});

test('the old test switch no longer changes the list, and the page still has no way to set it',()=>{
 a.deepEqual(S.ALL_PROVIDERS,S.PUBLIC_PROVIDERS);a.deepEqual(S.TEST_PROVIDERS,[]);
 const preload=read('desktop/view-preload.js');a.ok(!/provider[s]?\s*:/i.test(preload.slice(preload.indexOf('montclipAgentService'))),'no provider list setter in the preload');
 a.ok(!/montclip:agent:providers|testProviders/.test(preload+read('agent-ui/pane.tsx')));
});

test('the settings: OpenRouter marked recommended, the model filled in from the service, and the line that the provider may keep the text',()=>{
 const pane=read('agent-ui/pane.tsx'),zh=V.text['zh-CN'],en=V.text.en;
 a.equal(zh.officialPane_retention,'服务商可能会保存你发送的文字。');a.ok(en.officialPane_retention);
 a.ok(zh.officialPane_recommended&&en.officialPane_recommended);
 a.match(pane,/\(\(language==='en'&&PROVIDER_NAME_EN\[p\]\)\|\|PROVIDER_NAME\[p\]\|\|p\)\+' · '\+\(DOMAIN\[p\]\|\|''\)\+\(p===cfg\?\.recommended\?t\.recommended:''\)/,'the recommended one is marked');
 a.match(pane,/<p data-retention>\{t\.retention\}<\/p>/,'the retention line is shown in the settings');
 a.match(pane,/setModel\(c\?\.model\|\|c\?\.defaultModels\?\.\[c\?\.provider\]\|\|''\)/,'an unconfigured pane gets the default model');
});

// Deja (2026-11-02): what is banned is a claim of free models or free usage, not the word. JJ's
// "Free up some space and try again." (the FLV disk-full line) is fine.
const FREE_CLAIM=/免费(的)?(模型|额度|使用|调用|套餐)|\bfree[\s-]+(models?|tier|credits?|quota|usage|plan)\b/i;
test('the free-claim check catches free-model claims and leaves other uses of the word alone',()=>{
 for(const bad of ['免费模型','免费额度','可免费使用','free model','Free models','a free tier','free credits','free-tier'])a.ok(FREE_CLAIM.test(bad),bad);
 for(const ok of ['Free up some space and try again.','电脑空间不够，这个文件没导进来。清理一些空间后再试。','freedom','vendor/m:free'.replace(/:free/g,'')])a.ok(!FREE_CLAIM.test(ok),ok);
 a.ok(!FREE_CLAIM.test(V.text.en.flvDiskFull)&&/Free up some space/.test(V.text.en.flvDiskFull),"JJ's disk-full line is in the interface and passes");
});

test('the settings list comes from the service, not a fixed list in the page',()=>{
 const pane=read('agent-ui/pane.tsx');
 a.ok(!/<option value="openrouter">/.test(pane),'no hard-coded OpenRouter option');
 a.match(pane,/\(cfg\?\.providers\|\|\['openrouter','meta','deepseek','openai'\]\)\.map\(/);
 a.ok(!FREE_CLAIM.test(JSON.stringify(V.text['zh-CN'])+JSON.stringify(V.text.en).replace(/:free/g,'')),'no "free model" claim in the interface');
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

test('the ADR records the owner\'s decision: OpenRouter with DeepSeek Flash by default, and the retention line',()=>{
 const adr=read('docs/decisions/2026-11-01-official-cindy-port.md');
 a.match(adr,/OpenRouter/);a.match(adr,/deepseek\/deepseek-v4\.1-flash/);a.match(adr,/服务商可能会保存你发送的文字/);a.match(adr,/"free"/);a.match(adr,/QQ/);a.match(adr,/JJ/);
});

// Deja (2026-11-02): which default (OpenRouter or DeepSeek direct) is still the owner's call. The default service and
// model are one constant, so switching is a one-line change; the model id is the one Rea's catalogue lists for
// DeepSeek V4.1 Flash on OpenRouter (openrouter-flash-catalogue.json, sha256 c477d643…).
test('the default service and model are one constant in one line',()=>{
 const src=read('desktop/agent-service.js');
 const lines=src.split('\n').filter(l=>/^const DEFAULT_SERVICE=/.test(l));
 a.equal(lines.length,1);a.match(lines[0],/^const DEFAULT_SERVICE=Object\.freeze\(\{provider:'openrouter',model:'deepseek\/deepseek-v4\.1-flash-1017'\}\);/);
 a.equal(S.DEFAULT_PROVIDER,S.DEFAULT_SERVICE.provider);a.deepEqual(S.DEFAULT_MODELS,{[S.DEFAULT_SERVICE.provider]:S.DEFAULT_SERVICE.model,meta:'muse-spark-1.1'});
 a.equal((src.match(/deepseek-v4\.1-flash/g)||[]).length,1,'the model id is written once');
});

// JJ (8 PRs) asked Deja to confirm: "default" only preselects OpenRouter. With no key saved nothing is sent — not on
// creating the service, not on reading its state, not on a send — and no model list is fetched (the model id is fixed).
test('OpenRouter preselected without a key: no request at all until a key is saved', async () => {
 const {s,calls}=svc();
 a.equal(s.get().provider,'openrouter');a.equal(s.get().configured,false);
 a.equal((await s.send(payload())).code,'UNCONFIGURED');
 a.equal(s.configure({provider:'openrouter',model:'deepseek/deepseek-v4.1-flash-1017',apiKey:''}).code,'KEY_REQUIRED');
 a.equal((await s.send(payload())).code,'UNCONFIGURED');
 a.equal(calls.length,0,'no request without a key');
 for(const f of ['desktop/agent-service.js','desktop/main.js','agent-ui/pane.tsx','app/app.js'])a.ok(!/api\/v1\/models|\/models['"`]/.test(read(f).replace(/\/\/[^\n]*/g,'')),f+' fetches a model list');
});
