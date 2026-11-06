'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork } = require('node:child_process');
const { serverLease, resolveMediaTools } = require('../real-tests/privacy-runtime.cjs');

async function foreign(t) {
  let writes=0;
  const server=http.createServer((req,res)=>{if(req.method!=='GET')writes++;res.end('{}');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  return {origin:`http://127.0.0.1:${server.address().port}`,writes:()=>writes};
}
function childFor(t,code) {
  const child=fork('-e',[code],{stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(child.exitCode===null&&!child.killed)child.kill();});
  return child;
}
for(const kind of ['external 200','wrong handshake','child exit'])test(`privacy server rejects ${kind} before any write`,async t=>{
  const s=await foreign(t);
  const msg={type:kind==='wrong handshake'?'other':'montclip-ready',origin:s.origin};
  const child=childFor(t,`process.send(${JSON.stringify(msg)});${kind==='child exit'?'process.exit(1)':'setInterval(()=>{},1000)'}`);
  let rejected=false;
  try {
    const lease=await serverLease(child,{token:'only-this-task',proofPath:'/media/private-proof',proof:'unpredictable-proof',timeoutMs:500});
    lease.assertAlive();
    await fetch(lease.origin+'/api/project',{method:'PUT',body:'synthetic',headers:lease.headers});
  }catch{rejected=true;}
  assert.equal(s.writes(),0,'foreign service must receive zero write requests');
  assert.equal(rejected,true);
});

for(const PATH of ['',path.join(os.tmpdir(),'different-ffmpeg-on-path')])test(`privacy tools honor absolute overrides with PATH=${PATH?'different':'empty'}`,()=>{
  const env={PATH,MONTCLIP_FFMPEG:process.execPath,MONTCLIP_FFPROBE:process.execPath};
  const tools=resolveMediaTools(env);
  assert.equal(tools.ffmpeg,process.execPath);
  assert.equal(tools.ffprobe,process.execPath);
});
