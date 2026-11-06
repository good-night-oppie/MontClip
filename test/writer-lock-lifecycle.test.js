'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const W=require('../writer-lock');
function dir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-lock-life-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
async function child(t,d){const code=`const w=require(${JSON.stringify(require.resolve('../writer-lock'))});w.acquire(process.argv[1]);process.send('locked');process.on('message',m=>{if(m==='exit')process.exit(0);if(m==='fail')throw Error('synthetic failure');});`;const p=spawn(process.execPath,['-e',code,d],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});t.after(()=>{if(p.exitCode===null&&!p.signalCode)p.kill();});const exited=new Promise(r=>p.once('exit',r));await new Promise((res,rej)=>{p.once('message',res);p.once('error',rej);});return{p,exited};}
for(const mode of ['exit','fail','kill'])test(mode+' lifecycle and subsequent acquisition',async t=>{const d=dir(t),{p,exited}=await child(t,d),file=path.join(d,W.LOCK_NAME),before=fs.readFileSync(file,'utf8');a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE'});a.equal(fs.readFileSync(file,'utf8'),before);if(mode==='kill')p.kill('SIGKILL');else p.send(mode);await exited;if(mode==='kill')a.ok(fs.existsSync(file),'hard termination leaves lock as recovery fixture');else a.equal(fs.existsSync(file),false);const next=W.acquire(d);a.equal(W.holder(d).pid,process.pid);next.release();a.equal(fs.existsSync(file),false);});
test('reused live PID equal to current process cannot be stolen',t=>{const d=dir(t),file=path.join(d,W.LOCK_NAME),old=JSON.stringify({pid:process.pid,shell:'prior-incarnation',started:'2000-01-01'});fs.writeFileSync(file,old);a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE'});a.equal(fs.readFileSync(file,'utf8'),old);});
test('same-process second acquisition cannot replace its live owner',t=>{const d=dir(t),first=W.acquire(d);try{a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE'});}finally{first.release();}});
test('unreadable ownership metadata is not proof of dead owner',t=>{const d=dir(t),file=path.join(d,W.LOCK_NAME);fs.writeFileSync(file,'{partial');a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE'});a.equal(fs.readFileSync(file,'utf8'),'{partial');});
test('EPERM probing owner means alive and must not steal',t=>{const d=dir(t),file=path.join(d,W.LOCK_NAME),original=process.kill;fs.writeFileSync(file,JSON.stringify({pid:987654321}));process.kill=()=>{throw Object.assign(Error('denied'),{code:'EPERM'});};try{a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE'});}finally{process.kill=original;}});
test('only unverifiable metadata receives LOCK_OWNER_UNVERIFIED',t=>{
 const d=dir(t),file=path.join(d,W.LOCK_NAME);
 for(const value of ['{partial','null','{}','{"pid":0}','{"pid":"123"}']){
  fs.writeFileSync(file,value);a.throws(()=>W.acquire(d),{code:'DATA_DIR_IN_USE',reason:'LOCK_OWNER_UNVERIFIED'});a.equal(fs.readFileSync(file,'utf8'),value);
 }
 fs.writeFileSync(file,JSON.stringify({pid:process.pid,shell:'server'}));
 a.throws(()=>W.acquire(d),e=>{a.equal(e.code,'DATA_DIR_IN_USE');a.equal(e.reason,undefined);return true;});
});
test('exhausted stale-owner contention does not become unverified ownership',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(require.resolve('../writer-lock'),'utf8'),module={exports:{}};let removals=0;
 const fakeFs={openSync(){throw Object.assign(Error('exists'),{code:'EEXIST'});},readFileSync:()=>JSON.stringify({pid:987654321}),rmSync(){removals++;}};
 vm.runInNewContext(source,{module,require:n=>n==='fs'?fakeFs:require(n),process:{pid:123,kill(){throw Object.assign(Error('gone'),{code:'ESRCH'});}}});
 a.throws(()=>module.exports.acquire('/synthetic'),e=>{a.equal(e.code,'DATA_DIR_IN_USE');a.equal(e.reason,undefined);return true;});a.equal(removals,2);
});
