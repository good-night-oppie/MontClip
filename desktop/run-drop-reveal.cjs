'use strict';
// Manual Windows-only: node desktop/run-drop-reveal.cjs <existing-electron.exe> <task-owned-synthetic.mp4> [label]
// Visible window, fresh temporary profile; writes screenshots and a scrubbed log under docs/validation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const [runtime,input,label='run']=process.argv.slice(2);if(!runtime||!input)throw Error('Supply existing Electron executable and task-owned synthetic MP4');
const root=path.resolve(__dirname,'..');
if(crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex')!=='1c4e4a41621932a3a0af00edd23a93575ff95abcb52f9d243621e17f2fc30789')throw Error('FIXTURE_HASH');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-drop-reveal-')),out=path.join(root,'docs/validation/2026-11-01-drop-reveal',label);fs.mkdirSync(out,{recursive:true});
const env={...process.env,MONTCLIP_TIMELINE_INPUT:path.resolve(input),MONTCLIP_REVEAL_OUT:out,NODE_PATH:path.resolve(path.dirname(runtime),'../..')};delete env.ELECTRON_RUN_AS_NODE;
const child=cp.spawn(runtime,[path.join(__dirname,'drop-reveal-smoke.cjs'),'--montclip-smoke','--user-data-dir='+profile],{env});
let text='';const scrub=s=>s.replaceAll(root,'<repo>').replaceAll(os.homedir(),'<user>');
for(const s of [child.stdout,child.stderr])s.on('data',b=>{text+=b;process.stdout.write(scrub(b.toString()));});
const timer=setTimeout(()=>child.kill(),120000);
child.on('exit',()=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'run.txt'),scrub(text));fs.rmSync(profile,{recursive:true,force:true});process.exitCode=text.includes('REVEAL_COMPLETE')&&!text.includes('REVEAL_FAIL')?0:1;});
