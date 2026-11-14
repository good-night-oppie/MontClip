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

// JJ (2026-11-05): with no key store the key is never saved in plain text — not by us, and not through Electron's
// basic_text fallback (a fixed built-in password on Linux), even when that backend reports itself available.
test('no key store, or only basic_text: never saved in plain text — nothing written, no basic_text fallback',()=>{
 const backends=[['basic_text',true],['basic_text',false],['unknown',false]];
 for(const [backend,available] of backends){
  const root=profile();let encrypted=0;
  try{
   const safe={isEncryptionAvailable:()=>available,getSelectedStorageBackend:()=>backend,encryptString:s=>{encrypted++;return Buffer.from('basic:'+s);},decryptString:b=>b.toString()};
   const r=createDiskService(root,safe).configure({provider:'meta',model:'muse-spark-1.1',apiKey:KEY});
   assert.equal(r.code,'KEY_STORE_UNAVAILABLE',backend+'/'+available);
   assert.equal(encrypted,0,'the key never reaches the basic_text encryptor');
   assert.deepEqual(fs.readdirSync(root),[],'no file at all');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
 // a real key store still works, and so does one that cannot name its backend (Windows, macOS)
 for(const getSelectedStorageBackend of [()=>'gnome_libsecret',()=>{throw Error('Linux only');},undefined]){
  const root=profile();
  try{assert.equal(createDiskService(root,{...sealing,getSelectedStorageBackend}).configure({provider:'meta',model:'muse-spark-1.1',apiKey:KEY}).ok,true);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
 }
 // nothing in MontClip turns Electron's plain-text fallback on
 for(const f of ['desktop/main.js','desktop/agent-service.js'])assert.doesNotMatch(read(f),/setUsePlainTextEncryption/,f);
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
 const html=read('app/index.html'),all=html.match(/<option\b[^>]*>/g)||[];
 assert.ok(all.length>20);
 for(const o of all)assert.match(o,/\bvalue="[^"]*"/,'an option without a value takes its shown (translated) text as value: '+o);
});

// Deja (2026-11-05, after #166): a failed save says which thing is wrong. Each code the service returns has its own
// notice; any other code still falls back to 「配置未保存，原有设置保留。」.
test('each save failure code shows its own notice; an unknown code falls back to "not saved"',()=>{
 const pane=read('agent-ui/pane.tsx'),view=require('../shared/ui-preferences');
 const m=pane.match(/setNotice\(result\?\.ok\?'saved':\(\(m:Record<string,string>,c:string\)=>Object\.hasOwn\(m,c\)\?m\[c\]:'configFailed'\)\((\{[^}]*\}),String\(result\?\.code\)\)\);/);
 assert.ok(m,'the save button maps the code to a notice');
 const map=Function('return '+m[1])();
 assert.deepEqual(map,{KEY_STORE_UNAVAILABLE:'configKeyStore',KEY_REQUIRED:'configKeyRequired',CONFIG_INVALID:'configInvalid',CONFIG_WRITE_FAILED:'configWriteFailed'});
 const notice=code=>Object.hasOwn(map,code)?map[code]:'configFailed';
 for(const code of ['CONFIG_READ_FAILED','SEED_CONFLICT','AGENT_FORBIDDEN','toString','constructor','undefined'])assert.equal(notice(code),'configFailed',code);
 // JJ's final wording (2026-11-05), word for word. The 〔复制问题信息〕 half is its own fragment and is not shown yet: that
 // button is in #161 and not on the AI service panel. On europa (Linux, a signed-in openbox desktop, no --password-store)
 // reopening did not help, so 「请在已经登录电脑桌面的状态下，重新打开 MontClip 再试」 is left out of the key-store notice.
 const want={'zh-CN':{configKeyStore:'这台电脑现在没法安全地保存密钥（系统自带的密码保管用不了），所以没有保存，原有设置不变。',
  configKeyRequired:'请先在「API 密钥（留空保留已有密钥）」一栏填好密钥，再保存。',
  configInvalid:'模型 ID 里只能有英文字母、数字和 . _ : / - 这几个符号，最多 100 个字符。常见原因是多了空格，或者用了中文标点。',
  configWriteFailed:'设置文件写不进去，所以没有保存，原有设置不变。',configCopyDetails:'请点〔复制问题信息〕发给我们。',configFailed:'配置未保存，原有设置保留。'},
  en:{configKeyStore:'This computer can\'t store the key safely right now (its built-in password storage isn\'t available), so nothing was saved. Your previous settings are unchanged.',
  configKeyRequired:'Fill in “API key (leave blank to retain)” first, then save.',
  configInvalid:'The model ID can only contain letters, digits and . _ : / - (up to 100 characters). This is often caused by an extra space or a full-width punctuation mark.',
  configWriteFailed:'The settings file couldn\'t be written, so nothing was saved. Your previous settings are unchanged.',configCopyDetails:'Click “Copy problem details” and send it to us.',
  configFailed:'Configuration was not saved. Existing settings retained.'}};
 for(const l of ['zh-CN','en'])for(const [k,v] of Object.entries(want[l]))assert.equal(view.text[l]['officialPane_'+k],v,l+' '+k);
 // 「没填密钥」 names the key field by the field's own label: the same text, so they cannot drift apart
 for(const l of ['zh-CN','en']){const t=view.text[l],label=t.officialPane_key;
  assert.equal(t.officialPane_configKeyRequired,(l==='en'?'Fill in “{field}” first, then save.':'请先在「{field}」一栏填好密钥，再保存。').replace('{field}',label),l);}
 assert.match(pane,/<label>\{t\.key\}<SettingsTextInput type="password"/,'the key field is labelled with officialPane_key');
 assert.match(read('shared/ui-preferences.js'),/officialPane_configKeyRequired=officialPaneText\[language\]\.configKeyRequired\.split\('\{field\}'\)\.join\(officialPaneText\[language\]\.key\)/,'filled from the key field\'s own text, not a copy');
 // the 〔复制问题信息〕 fragment is not shown anywhere until that button is on the panel
 for(const l of ['zh-CN','en'])for(const k of ['configKeyStore','configWriteFailed'])assert.ok(!view.text[l]['officialPane_'+k].includes(view.text[l].officialPane_configCopyDetails),l+' '+k);
 assert.doesNotMatch(pane,/configCopyDetails/,'not wired yet (#161)');
 const bundle=read('app/cindy-official.js');
 for(const s of ['KEY_STORE_UNAVAILABLE:"configKeyStore"','KEY_REQUIRED:"configKeyRequired"','CONFIG_INVALID:"configInvalid"','CONFIG_WRITE_FAILED:"configWriteFailed"'])assert.ok(bundle.includes(s),'bundle rebuilt: '+s);
});
