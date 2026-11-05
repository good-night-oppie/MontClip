/* P9 (europa, 2026-11-05): in the Chinese interface, choosing Meta and pressing 「保存连接配置」 left the connection at
   OpenRouter, no model, not configured. The interface language was not the cause: the pane sends the provider's fixed id
   (option value), and the same steps in Chinese save fine wherever the key can be sealed (desktop/agent-config-language-smoke.cjs,
   Windows and europa). That run had no key store (Electron fell back to basic_text without --password-store), so the key
   was — rightly — not written; the failure only said "not saved". It now says why: KEY_STORE_UNAVAILABLE. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createDiskService}=require('../desktop/agent-service');
const ROOT=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const KEY='synthetic-key-for-config-language-test';
const sealing={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('sealed:'+s),decryptString:b=>b.toString().replace(/^sealed:/,'')};
const noStore={isEncryptionAvailable:()=>false,encryptString:()=>{throw Error('unavailable');},decryptString:()=>{throw Error('unavailable');}};
const profile=()=>fs.mkdtempSync(path.join(os.tmpdir(),'mc-p9-'));

test('Meta, its model and a key are saved by their fixed ids: provider meta, configured',()=>{
 const root=profile();
 try{
  const s=createDiskService(root,sealing),r=s.configure({provider:'meta',model:'muse-spark-1.1',apiKey:KEY});
  assert.equal(r.ok,true);assert.equal(r.provider,'meta');assert.equal(r.model,'muse-spark-1.1');assert.equal(r.configured,true);
  assert.equal(createDiskService(root,sealing).get().provider,'meta','read back after a restart');
  assert.equal(fs.readFileSync(path.join(root,'agent-connection-v1.json'),'utf8').includes(KEY),false,'the key is sealed, never plain');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a shown name is not an id: the Chinese or English label of Meta is refused, nothing is saved',()=>{
 const root=profile();
 try{
  const s=createDiskService(root,sealing);
  for(const shown of ['Meta（Muse Spark） · api.meta.ai','Meta (Muse Spark) · api.meta.ai','Meta（Muse Spark）'])
   assert.equal(s.configure({provider:shown,model:'muse-spark-1.1',apiKey:KEY}).code,'CONFIG_INVALID',shown);
  assert.equal(s.get().configured,false);assert.deepEqual(fs.readdirSync(root),[]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('no key store: the save fails as KEY_STORE_UNAVAILABLE (not a write failure), nothing is written, the old state stays',()=>{
 const root=profile();
 try{
  const s=createDiskService(root,noStore),r=s.configure({provider:'meta',model:'muse-spark-1.1',apiKey:KEY});
  assert.equal(r.ok,false);assert.equal(r.code,'KEY_STORE_UNAVAILABLE');
  assert.deepEqual(fs.readdirSync(root),[],'no connection file, no temporary, and so no plain key');
  const g=s.get();assert.equal(g.configured,false);assert.equal(g.provider,'openrouter');assert.equal(g.model,'');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a failing disk is still a write failure, not a key-store one',()=>{
 const root=profile();
 try{
  const disk={...fs,writeFileSync:()=>{throw Object.assign(Error('full'),{code:'ENOSPC'});}};
  assert.equal(createDiskService(root,sealing,disk).configure({provider:'meta',model:'muse-spark-1.1',apiKey:KEY}).code,'CONFIG_WRITE_FAILED');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

// The general rule behind P9: a settings list's values never follow the interface language; only what is shown does.
test('settings lists: the AI service list uses the provider id as its value; every option in the page has a fixed value',()=>{
 const pane=read('agent-ui/pane.tsx');
 const options=pane.match(/<option\b[^>]*>/g)||[];
 assert.deepEqual(options,['<option key={p} value={p}>'],'the provider list: value = the provider id from the service');
 assert.match(pane,/\(cfg\?\.providers\|\|\['openrouter','meta','deepseek','openai'\]\)\.map\(\(p:string\)=><option key=\{p\} value=\{p\}>/);
 assert.match(pane,/configure\(\{provider,model,apiKey:key\}\)/,'save sends the chosen id, not the shown text');
 const html=read('index.html'),all=html.match(/<option\b[^>]*>/g)||[];
 assert.ok(all.length>20);
 for(const o of all)assert.match(o,/\bvalue="[^"]*"/,'an option without a value takes its shown (translated) text as value: '+o);
});

// Deja (2026-11-05, after #166): a failed save says which thing is wrong. Each code the service returns has its own
// notice; any other code still falls back to 「配置未保存，原有设置保留。」. The wording is a draft for JJ.
test('each save failure code shows its own notice; an unknown code falls back to "not saved"',()=>{
 const pane=read('agent-ui/pane.tsx'),view=require('../ui-preferences');
 const m=pane.match(/setNotice\(result\?\.ok\?'saved':\(\(m:Record<string,string>,c:string\)=>Object\.hasOwn\(m,c\)\?m\[c\]:'configFailed'\)\((\{[^}]*\}),String\(result\?\.code\)\)\);/);
 assert.ok(m,'the save button maps the code to a notice');
 const map=Function('return '+m[1])();
 assert.deepEqual(map,{KEY_STORE_UNAVAILABLE:'configKeyStore',KEY_REQUIRED:'configKeyRequired',CONFIG_INVALID:'configInvalid',CONFIG_WRITE_FAILED:'configWriteFailed'});
 const notice=code=>Object.hasOwn(map,code)?map[code]:'configFailed';
 for(const code of ['CONFIG_READ_FAILED','SEED_CONFLICT','AGENT_FORBIDDEN','toString','constructor','undefined'])assert.equal(notice(code),'configFailed',code);
 const want={'zh-CN':{configKeyStore:'这台电脑的系统钥匙串现在用不了，密钥没法加密保存，所以没有保存。原有设置不变。',configKeyRequired:'请先填写 API 密钥再保存。',
  configInvalid:'模型 ID 只能用英文字母、数字和 . _ : / -，最多 100 个字符。',configWriteFailed:'设置文件写不进去，没有保存。原有设置不变。',configFailed:'配置未保存，原有设置保留。'},
  en:{configKeyStore:'This computer’s keychain isn’t available, so the key can’t be stored safely and nothing was saved. Your previous settings are unchanged.',
  configKeyRequired:'Enter the API key, then save.',configInvalid:'The model ID can only use letters, digits and . _ : / -, up to 100 characters.',
  configWriteFailed:'The settings file couldn’t be written, so nothing was saved. Your previous settings are unchanged.',configFailed:'Configuration was not saved. Existing settings retained.'}};
 for(const l of ['zh-CN','en'])for(const [k,v] of Object.entries(want[l])){assert.equal(view.text[l]['officialPane_'+k],v,l+' '+k);if(l==='zh-CN')assert.doesNotMatch(v,/我/,'no 「我」');}
 const bundle=read('cindy-official.js');
 for(const s of ['KEY_STORE_UNAVAILABLE:"configKeyStore"','KEY_REQUIRED:"configKeyRequired"','CONFIG_INVALID:"configInvalid"','CONFIG_WRITE_FAILED:"configWriteFailed"'])assert.ok(bundle.includes(s),'bundle rebuilt: '+s);
});
