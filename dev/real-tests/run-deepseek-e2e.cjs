'use strict';
// e2e with a real model: DeepSeek Flash, in the real desktop app (visible window).
//   MONTCLIP_REAL_MODELS=1 node dev/real-tests/run-deepseek-e2e.cjs
// Off unless MONTCLIP_REAL_MODELS=1; never run in CI. Key: only ~/.deepseek-serena-api-key
// (passed to the app as a file path, typed into the password field, never printed).
// Model: MONTCLIP_E2E_MODEL, else the "flash" model listed by api.deepseek.com/models.
// Exit 0 = passed, 2 = skipped (reason printed), 1 = failed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..','..');
if(process.env.MONTCLIP_REAL_MODELS!=='1'){console.log('E2E SKIPPED: real-model tests are off (set MONTCLIP_REAL_MODELS=1)');process.exit(2);}
const keyFile=path.join(os.homedir(),'.deepseek-serena-api-key');
if(!fs.existsSync(keyFile)){console.log('E2E SKIPPED: no ~/.deepseek-serena-api-key');process.exit(2);}
const KEY=fs.readFileSync(keyFile,'utf8').trim();
(async()=>{
 let model=process.env.MONTCLIP_E2E_MODEL;
 if(!model){try{const j=await (await fetch('https://api.deepseek.com/models',{headers:{Authorization:'Bearer '+KEY}})).json();model=(j.data||[]).map(m=>m.id).find(id=>/flash/i.test(id));}catch(e){console.log('E2E SKIPPED: could not list DeepSeek models ('+e.message+')');process.exit(2);}}
 if(!model){console.log('E2E SKIPPED: DeepSeek lists no Flash model');process.exit(2);}
 const out=path.join(root,'docs','validation','real-model-e2e');fs.mkdirSync(out,{recursive:true});
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-real-e2e-'));
 const env={...process.env,MONTCLIP_E2E_OUT:out,MONTCLIP_E2E_KEY_FILE:keyFile,MONTCLIP_E2E_MODEL:model};delete env.ELECTRON_RUN_AS_NODE;
 const child=cp.spawn(path.join(root,'desktop','node_modules','electron','dist',process.platform==='win32'?'electron.exe':'electron'),[path.join(__dirname,'deepseek-e2e-smoke.cjs'),'--montclip-smoke','--user-data-dir='+profile],{env});
 let text='';const scrub=s=>s.split(KEY).join('<key>').replaceAll(root,'<repo>').replaceAll(os.homedir(),'<user>');
 for(const s of [child.stdout,child.stderr])s.on('data',b=>{text+=b;process.stdout.write(scrub(b.toString()));});
 const timer=setTimeout(()=>child.kill(),240000);
 child.on('exit',()=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'run.txt'),scrub(text));fs.rmSync(profile,{recursive:true,force:true});
  let r={};try{r=JSON.parse(fs.readFileSync(path.join(out,'e2e-result.json'),'utf8'));}catch{}
  if(text.includes(KEY)||JSON.stringify(r).includes(KEY)){console.log('E2E FAILED: key appeared in output');process.exit(1);}
  console.log('E2E '+(r.passed?'PASSED':r.skipped?'SKIPPED: '+r.skipped:'FAILED: '+(r.failed||'no result'))+' (model '+model+')');
  process.exit(r.passed?0:r.skipped?2:1);});
})();
