'use strict';
// Manual only: node desktop/run-narrow-pane.cjs [label]. Fresh task profile, visible
// window, injected provider; writes screenshots + a scrubbed log under docs/validation.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),label=process.argv[2]||'run';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-narrow-pane-'));
const out=path.join(root,'docs/validation/2026-11-01-pr26-narrow',label);fs.mkdirSync(out,{recursive:true});
const env={...process.env,MONTCLIP_NARROW_OUT:out};delete env.ELECTRON_RUN_AS_NODE;
const child=cp.spawn(path.join(__dirname,'node_modules/electron/dist/electron.exe'),[path.join(__dirname,'narrow-pane-smoke.cjs'),'--montclip-smoke','--user-data-dir='+profile],{env});
let output='';const scrub=s=>s.replaceAll(root,'<repo>').replaceAll(os.homedir(),'<user>');
for(const s of [child.stdout,child.stderr])s.on('data',b=>{output+=b;process.stdout.write(scrub(b.toString()));});
const timer=setTimeout(()=>child.kill(),90000);
child.on('exit',code=>{clearTimeout(timer);fs.writeFileSync(path.join(out,'run.txt'),scrub(output));fs.rmSync(profile,{recursive:true,force:true});process.exitCode=output.includes('NARROW_COMPLETE')&&!output.includes('NARROW_FAIL')?0:1;});
