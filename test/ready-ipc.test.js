const test = require('node:test'), assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
test('PORT=0 reports its own loopback listener over private IPC', async t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-ready-'));
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',FABLECUT_DATA_DIR:dir,FABLECUT_NO_FS_WATCH:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
 child.stderr.resume();
 t.after(async()=>{if(child.exitCode===null && child.signalCode===null) await new Promise(r=>{child.once('exit',r);child.kill();});assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('missing private readiness message')),10000);child.once('message',m=>{clearTimeout(timer);resolve(m);});child.once('error',reject);});
 assert.equal(ready.type,'montclip-ready'); const url=new URL(ready.origin);assert.equal(url.hostname,'127.0.0.1');assert.ok(Number(url.port)>0);assert.equal((await fetch(ready.origin+'/api/project')).status,200);
});
