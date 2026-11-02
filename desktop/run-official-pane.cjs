'use strict';
// Manual only. No downloads/media/global input; only owns the spawned process/profile.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),space=fs.statfsSync(root);if(space.bavail*space.bsize<11*1024**3)throw Error('SPACE_RESERVE');
const recovery=process.argv.includes('--recovery');
const reopen=process.argv.includes('--reopen');fs.mkdirSync(path.join(root,'out'),{recursive:true});const marker=path.join(root,'out/official-pane-profile.txt');
const profile=reopen?fs.readFileSync(marker,'utf8'):fs.mkdtempSync(path.join(os.tmpdir(),'MontClip-official-pane-'));if(!path.resolve(profile).startsWith(path.join(os.tmpdir(),'MontClip-official-pane-')))throw Error('NOT_TASK_PROFILE');fs.writeFileSync(marker,profile);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=cp.spawn(path.join(__dirname,'node_modules/electron/dist/electron.exe'),[path.join(__dirname,'official-pane-smoke.cjs'),'--montclip-smoke','--user-data-dir='+profile,...(reopen?['--official-reopen']:[]),...(recovery&&!reopen?['--official-recovery']:[])],{env,windowsHide:true});
let output='';const scrub=s=>s.replaceAll(root,'<repo>').replaceAll(os.homedir(),'<user>');for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b;process.stdout.write(scrub(b.toString()));});
const timer=setTimeout(()=>{child.kill();},60000);
child.on('exit',code=>{clearTimeout(timer);fs.writeFileSync(path.join(root,'docs/validation/2026-11-01-official-pane-'+(process.argv.includes('--presentation')?'presentation-':process.argv.includes('--card-scope')?'card-scope-':recovery?'recovery-':'')+(reopen?'reopen':'native')+'.log'),scrub(output));process.exitCode=code===0&&output.includes('OFFICIAL_COMPLETE')&&output.includes('"saved":true')?0:1;});
