'use strict';
// QQ (2026-11-02) for the batch after b594850d: prove that what the review dialog shows is,
// item for item, the body actually sent (key and headers masked); pin the OpenRouter
// destination, redirect policy and response cap; and count the format note in what is sent.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../desktop/agent-service'),F=require('../shared/agent-format');
const pane=fs.readFileSync(path.join(__dirname,'../agent-ui/pane.tsx'),'utf8'),view=require('../shared/ui-preferences').text;
const KEY='sk-or-v1-test-secret-0123456789';
const pageMessages=[{role:'user',content:'第一句留下'},{role:'assistant',content:'好的'},{role:'user',content:'只保留这两句\n\n'+JSON.stringify({references:[{type:'caption',projectId:'p',sequenceId:'s',revision:3,gen:0,clipId:'c1',sourceCaptionId:'c1',text:'今天我们来看三个剪辑技巧。',start:1,end:3.2}]})}];
const payload={version:1,requestId:'rb1',projectId:'p',sequenceId:'s',revision:3,gen:0,messages:pageMessages};
async function capture(provider){
 let seen=null;
 const fake=async(url,init)=>{seen={url,init};return{ok:true,status:200,body:(async function*(){yield Buffer.from(JSON.stringify({choices:[{message:{content:'ok'}}]}));})()};};
 const s=S.createService({read:()=>JSON.stringify({version:1,provider,model:'vendor/model-x:free',secret:'sealed'}),write(){},seal:k=>k,unseal:()=>KEY,providers:S.ALL_PROVIDERS,request:(cfg,p,signal)=>S.httpsRequest(cfg,p,signal,{fetch:fake,providers:S.ALL_PROVIDERS})});
 const r=await s.send(JSON.parse(JSON.stringify(payload)));a.equal(r.ok,true,JSON.stringify(r));return seen;
}

test('the dialog and the request build the body with the same function',()=>{
 a.equal(typeof F.body,'function');
 a.match(pane,/<pre>\{JSON\.stringify\(MontClipFormat\.body\(cfg\?\.model,MontClipFormat\.withFormat\(review\?\.messages\|\|\[\]\)\),null,2\)\}<\/pre>/,'raw view = MontClipFormat.body(withFormat(messages))');
 a.match(fs.readFileSync(path.join(__dirname,'../desktop/agent-service.js'),'utf8'),/body:JSON\.stringify\(Format\.body\(config\.model,payload\.messages\)\)/,'request body = Format.body(model, outgoing messages)');
});

test('what the dialog shows equals the body actually sent, item by item (key and headers masked)',async()=>{
 const seen=await capture('openrouter'),sent=JSON.parse(seen.init.body);
 const shown=F.body('vendor/model-x:free',F.withFormat(pageMessages)); // exactly what the dialog's raw view renders
 a.deepEqual(Object.keys(sent).sort(),Object.keys(shown).sort(),'same top-level fields');
 for(const k of Object.keys(shown))if(k!=='messages')a.deepEqual(sent[k],shown[k],k);
 a.equal(sent.messages.length,shown.messages.length,'same number of messages');
 sent.messages.forEach((m,i)=>{a.equal(m.role,shown.messages[i].role,'role '+i);a.equal(m.content,shown.messages[i].content,'content '+i);});
 a.equal(sent.messages[0].content,F.FORMAT_NOTE,'the format note is the first item sent');
 // the readable sections: format note first, then one section per page message, in order
 a.match(pane,/<section data-format-note>[\s\S]*?MontClipFormat\.FORMAT_NOTE[\s\S]*?<\/section>\{review\?\.messages\?\.map/);
 // masked log of what left: no key anywhere, the Authorization header only as a mask
 const headers={...seen.init.headers,Authorization:seen.init.headers.Authorization.replace(KEY,'<masked>')};
 const log={url:seen.url,method:seen.init.method,redirect:seen.init.redirect,headers,body:sent};
 const text=JSON.stringify(log,null,1);a.ok(!text.includes(KEY),'key is masked');a.equal(headers.Authorization,'Bearer <masked>');
 if(process.env.MONTCLIP_REVIEW_LOG)fs.writeFileSync(process.env.MONTCLIP_REVIEW_LOG,text+'\n');
});

test('OpenRouter: fixed address, redirects refused, response capped',async()=>{
 a.equal(S.ENDPOINTS.openrouter,'https://openrouter.ai/api/v1/chat/completions');a.ok(Object.isFrozen(S.ENDPOINTS));
 const seen=await capture('openrouter');a.equal(seen.url,S.ENDPOINTS.openrouter);a.equal(seen.init.redirect,'error');a.equal(seen.init.method,'POST');
 const big=async()=>({ok:true,status:200,body:(async function*(){for(let i=0;i<20;i++)yield Buffer.alloc(8192,32);})(),});
 let code;try{await S.httpsRequest({provider:'openrouter',model:'m',key:'k'},payload,new AbortController().signal,{fetch:big,providers:S.ALL_PROVIDERS});}catch(e){code=e.message;}
 a.equal(code,'RESPONSE_LIMIT','a reply over 131072 bytes is refused');
 a.equal(S.RESPONSE_LIMIT_BYTES,131072);
});

test('the format note counts in what is sent: shown in the dialog and in the count',()=>{
 for(const l of ['zh-CN','en']){const s=view[l].officialPane_reviewSummary;a.match(s,/\{captions\}/,l);a.match(s,/\{history\}/,l);a.ok(/格式说明|formatting note/i.test(s),l+': names the format note');}
 a.match(pane,/\.replace\('\{total\}',String\(\(review\?\.messages\?\.length\|\|0\)\+1\)\)/,'total = page messages + the format note');
});
