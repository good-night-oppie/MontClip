'use strict';
// Development-only check (P9, europa 2026-11-05): choose Meta in 「AI 服务」, fill the model and a synthetic key,
// press save, then read the saved state — in the Chinese and the English interface, through the real pane, the same
// way the demo recording does (the select set by value, then a change event). Own fresh profile, hidden offscreen
// window, no network (nothing is sent). MONTCLIP_SMOKE_NO_KEYSTORE=1 makes the key store unavailable, as it was in
// the europa run: nothing is saved, and the pane says why (KEY_STORE_UNAVAILABLE).
// Either way, an empty key and a bad model ID are refused with their own notice before anything is saved.
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const profile=profileArg.slice('--user-data-dir='.length),file=path.join(profile,'agent-connection-v1.json');
const noKeyStore=process.env.MONTCLIP_SMOKE_NO_KEYSTORE==='1',KEY='synthetic-key-for-language-smoke';
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const results=[],lists={};
 const selects=()=>read(`Array.from(document.querySelectorAll('select')).map((s,i)=>[s.id||s.name||s.className||'select'+i,Array.from(s.options).map(o=>o.value)])`);
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  for(const language of ['zh-CN','en']){
   await read(`montclipAgentService.deleteConnection()`);
   await read(`updateMontClipView({language:${JSON.stringify(language)}});setSideTab('assistant');mcAgent.render();true`);await wait(400);
   const T=await read(`(()=>{const t=MontClipView.text[${JSON.stringify(language)}];return{config:t.officialPane_config,save:t.officialPane_save,saved:t.officialPane_saved,keyStore:t.officialPane_configKeyStore,keyRequired:t.officialPane_configKeyRequired,invalid:t.officialPane_configInvalid};})()`);
   const config=`Array.from(document.querySelectorAll('.cindy-port button')).find(b=>b.textContent===${JSON.stringify(T.config)})`;
   if(await read(`!!document.querySelector('.cindy-config')`)){await read(`${config}.click();true`);await wait();}
   await read(`${config}.click();true`);await wait(400);
   // the provider list: values are the fixed ids whatever the interface language; only the shown names change
   const options=await read(`Array.from(document.querySelectorAll('.cindy-config select option')).map(o=>[o.value,o.textContent])`);
   const setValue=(sel,v)=>read(`(()=>{const e=${sel},proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`);
   await setValue(`document.querySelector('.cindy-config select')`,'meta');await wait(300);
   const model=await read(`document.querySelectorAll('.cindy-config input')[0].value`);
   const statusText=()=>read(`Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join('|')`);
   const saveButton=`Array.from(document.querySelectorAll('.cindy-config button')).find(b=>b.textContent===${JSON.stringify(T.save)}).click();true`;
   // nothing saved yet and no key: 请先填写 API 密钥再保存
   await read(saveButton);await wait(500);assert.ok((await statusText()).includes(T.keyRequired),language+': empty key named');
   // a model ID the service refuses: its own notice; the model is put back afterwards
   await setValue(`document.querySelectorAll('.cindy-config input')[0]`,'缪斯 spark');await setValue(`document.querySelectorAll('.cindy-config input')[1]`,KEY);await wait(200);
   await read(saveButton);await wait(500);assert.ok((await statusText()).includes(T.invalid),language+': bad model ID named');
   assert.equal((await read(`montclipAgentService.get()`)).configured,false);
   await setValue(`document.querySelectorAll('.cindy-config input')[0]`,'muse-spark-1.1');
   await setValue(`document.querySelectorAll('.cindy-config input')[1]`,KEY);await wait(200);
   await read(`Array.from(document.querySelectorAll('.cindy-config button')).find(b=>b.textContent===${JSON.stringify(T.save)}).click();true`);await wait(800);
   const conf=await read(`montclipAgentService.get()`);
   const status=await read(`Array.from(document.querySelectorAll('.cindy-port [role=status]')).map(e=>e.textContent).join('|')`);
   const r={language,options,model,provider:conf.provider,savedModel:conf.model,configured:conf.configured,fileWritten:fs.existsSync(file),status};
   lists[language]=await selects();
   results.push(r);process.stdout.write('CONFIG_LANGUAGE '+JSON.stringify(r)+'\n');
   assert.deepEqual(options.map(o=>o[0]),['openrouter','meta','deepseek','openai'],language+': option values do not follow the language');
   assert.equal(model,'muse-spark-1.1',language+': the Meta model is filled in');
   if(noKeyStore){
    assert.equal(conf.configured,false);assert.equal(r.fileWritten,false);
    assert.ok(status.includes(T.keyStore),language+': the pane says the keychain is not available');
    const direct=await read(`montclipAgentService.configure({provider:'meta',model:'muse-spark-1.1',apiKey:${JSON.stringify(KEY)}})`);
    assert.equal(direct.code,'KEY_STORE_UNAVAILABLE',language+': the reason reaches the page');
   }else{
    assert.equal(conf.provider,'meta');assert.equal(conf.model,'muse-spark-1.1');assert.equal(conf.configured,true);assert.ok(r.fileWritten);
    assert.ok(status.includes(T.saved),language+': the pane says it was saved');
   }
   assert.equal(fs.existsSync(file)&&fs.readFileSync(file,'utf8').includes(KEY),false,'the key is never written in plain text');
  }
  // every list in the page (the settings, export, sort and the AI service): the same values in both languages
  assert.ok(lists.en.length>10);
  // compared as a set of value lists: the pane's own list has no id and can sit elsewhere in the page after a re-render
  const values=l=>l.map(([,v])=>JSON.stringify(v)).sort(),en=values(lists.en),zh=values(lists['zh-CN']);
  const differ=[...en.filter(v=>!zh.includes(v)),...zh.filter(v=>!en.includes(v))];
  if(differ.length)process.stdout.write('CONFIG_LANGUAGE_SELECTS_DIFFER '+JSON.stringify(differ)+'\n');
  assert.deepEqual(zh,en,'option values do not change with the interface language');
  await read(`montclipAgentService.deleteConnection()`);
  process.stdout.write('CONFIG_LANGUAGE_COMPLETE '+JSON.stringify({noKeyStore,languages:results.map(r=>r.language),selects:lists.en.length})+'\n');
 }catch(e){process.stdout.write('CONFIG_LANGUAGE_FAIL '+String(e&&e.message).split(KEY).join('<key>')+'\n');}
 finally{setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken. Optionally a key store that is not available.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;
 const safeStorage=noKeyStore?{isEncryptionAvailable:()=>false,encryptString:()=>{throw Error('unavailable');},decryptString:()=>{throw Error('unavailable');}}:electron.safeStorage;
 return{...electron,safeStorage,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
