'use strict';
// e2e with a real model: Meta Muse Spark (Meta Model API, api.meta.ai), in the real desktop app (hidden window).
//   MONTCLIP_REAL_MODELS=1 node dev/real-tests/run-meta-e2e.cjs          (on europa; Linux without a screen: xvfb-run -a …)
// Off unless MONTCLIP_REAL_MODELS=1; never run in CI. Key: only ~/.meta-montclip, mode 600 (dev/real-tests/meta-key-file.cjs);
// never printed, logged, written or shown in a screenshot. Model: MONTCLIP_E2E_MODEL, else muse-spark-1.1 (the product's
// default for Meta). Before the app, two checks through the product's own request path (desktop/agent-service.js):
// a made-up key must read as AUTH, a made-up model name as MODEL_INVALID.
// On Linux the key is sealed with the session keyring (safeStorage). On a desktop Electron does not recognise (xvfb, openbox)
// the app asks for it itself (desktop/password-store.js), so no --password-store is needed; the session's DBUS_SESSION_BUS_ADDRESS must be set (xvfb for the screen is fine). Without
// a reachable keyring the app refuses to save the key (KEY_STORE_UNAVAILABLE), as it should, and the run fails there.
// Exit 0 = passed, 2 = skipped (reason printed), 1 = failed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const K=require('./meta-key-file.cjs'),S=require('../../desktop/agent-service');
const root=path.resolve(__dirname,'..');
if(process.env.MONTCLIP_REAL_MODELS!=='1'){console.log('E2E SKIPPED: real-model tests are off (set MONTCLIP_REAL_MODELS=1)');process.exit(2);}
const found=K.readKey();
if(!found.key){console.log('E2E SKIPPED: '+found.skip);process.exit(2);}
const KEY=found.key,MODEL=process.env.MONTCLIP_E2E_MODEL||S.DEFAULT_MODELS.meta;
// the key, and any 6+ character head or tail of it (an error message might echo part of a key)
const scrub=s=>{let t=String(s).split(KEY).join('<key>');for(let n=Math.min(KEY.length-1,16);n>=6;n--){t=t.split(KEY.slice(0,n)).join('<key-part>').split(KEY.slice(-n)).join('<key-part>');}return t.replaceAll(root,'<repo>').replaceAll(os.homedir(),'<user>');};
const out=path.join(root,'docs','validation','real-model-e2e-meta');
const payload=()=>({version:1,requestId:'e2e'+Date.now(),projectId:'p_e2e',sequenceId:'main',revision:1,gen:0,messages:[{role:'user',content:'hi'}]});
async function code(config){const t0=Date.now();try{await S.httpsRequest(config,{...payload(),messages:require('../../agent-format').withFormat(payload().messages)},AbortSignal.timeout(60000));return{code:'OK',ms:Date.now()-t0};}catch(e){return{code:e.message,ms:Date.now()-t0};}}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const checks={};
 checks.badKey=await code({provider:'meta',model:MODEL,key:'made-up-key-montclip-e2e'});
 checks.badModel=await code({provider:'meta',model:'muse-spark-does-not-exist',key:KEY});
 console.log('E2E_CHECKS '+scrub(JSON.stringify(checks)));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-meta-e2e-'));
 const env={...process.env,MONTCLIP_E2E_OUT:out,MONTCLIP_E2E_KEY_FILE:found.file,MONTCLIP_E2E_MODEL:MODEL,MONTCLIP_E2E_CHECKS:JSON.stringify(checks)};delete env.ELECTRON_RUN_AS_NODE;
 const electron=path.join(root,'desktop','node_modules','electron','dist',process.platform==='win32'?'electron.exe':process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
 const child=cp.spawn(electron,[path.join(__dirname,'meta-e2e-smoke.cjs'),'--montclip-smoke','--user-data-dir='+profile,...(process.platform==='linux'?['--no-sandbox']:[])],{env});
 let text='';
 for(const s of [child.stdout,child.stderr])s.on('data',b=>{text+=b;process.stdout.write(scrub(b.toString()));});
 const timer=setTimeout(()=>child.kill(),300000);
 child.on('exit',()=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'run.txt'),scrub(text));fs.rmSync(profile,{recursive:true,force:true});
  let r={};try{r=JSON.parse(fs.readFileSync(path.join(out,'e2e-result.json'),'utf8'));}catch{}
  if(text.includes(KEY)||JSON.stringify(r).includes(KEY)){console.log('E2E FAILED: key appeared in output');process.exit(1);}
  const checksOk=checks.badKey.code==='AUTH'&&checks.badModel.code==='MODEL_INVALID';
  console.log('E2E '+(r.passed?'PASSED':r.skipped?'SKIPPED: '+r.skipped:'FAILED: '+(r.failed||'no result'))+' (model '+MODEL+'); error checks '+(checksOk?'as expected':'NOT as expected: '+JSON.stringify(checks)));
  process.exit(r.passed&&checksOk?0:r.skipped?2:1);});
})();
