'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { fork,spawn,execFileSync } = require('node:child_process');
const { serverLease, resolveMediaTools,pipeClient,verifyBrowserArguments } = require('../real-tests/privacy-runtime.cjs');
const {makeDataDir}=require('./helpers');

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

for(const different of [false,true])test(`privacy tools honor absolute overrides with PATH=${different?'different':'empty'}`,t=>{
  const PATH=different?makeDataDir(t):'';
  if(different)for(const name of ['ffmpeg','ffprobe'])fs.copyFileSync(process.execPath,path.join(PATH,name+(process.platform==='win32'?'.exe':'')));
  const actual=require('../ffmpeg-path');
  const env={...process.env,PATH,Path:PATH,MONTCLIP_FFMPEG:actual.path('ffmpeg'),MONTCLIP_FFPROBE:actual.path('ffprobe')};
  const tools=resolveMediaTools(env);
  assert.equal(tools.ffmpeg,env.MONTCLIP_FFMPEG);
  assert.equal(tools.ffprobe,env.MONTCLIP_FFPROBE);
  for(const tool of Object.values(tools))assert.match(execFileSync(tool,['-version'],{env,encoding:'utf8',windowsHide:true}),/version/);
});

test('privacy rejects port occupation and child startup failure without adopting foreign 200',async t=>{
  const s=await foreign(t),port=new URL(s.origin).port;
  const child=childFor(t,`require('http').createServer().listen(${port},'127.0.0.1')`);
  await assert.rejects(serverLease(child,{token:'x',proofPath:'/proof',proof:'x',timeoutMs:1000}));
  assert.equal(s.writes(),0);
  assert.equal((await fetch(s.origin)).status,200,'foreign fixture remains alive');
});
test('privacy rejects spawn error without writing',async t=>{
  const s=await foreign(t);
  const child=spawn(path.join(os.tmpdir(),'missing-privacy-executable'),[],{stdio:'ignore'});
  await assert.rejects(serverLease(child,{token:'x',proofPath:'/proof',proof:'x',timeoutMs:1000}));
  assert.equal(s.writes(),0);
});
test('owned IPC server proof works and exit invalidates its lease',async t=>{
  const data=makeDataDir(t),token=require('node:crypto').randomBytes(32).toString('hex'),proof='random-fixture-'+Date.now();
  fs.mkdirSync(path.join(data,'media'),{recursive:true});
  fs.writeFileSync(path.join(data,'media','proof.txt'),proof);
  const child=fork(path.join(__dirname,'../server.js'),[],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token,FABLECUT_DATA_DIR:data,FABLECUT_NO_FS_WATCH:'1'},stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(child.exitCode===null&&!child.killed)child.kill();});
  const lease=await serverLease(child,{token,proofPath:'/media/proof.txt',proof});
  lease.assertAlive();assert.equal((await fetch(lease.origin+'/api/project',{headers:lease.headers})).status,200);
  const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;
  assert.throws(()=>lease.assertAlive(),/exited/);
});
test('wrong CDP endpoint/profile is rejected with zero writes to the foreign fixture',async t=>{
  const s=await foreign(t),profile=path.join(os.tmpdir(),'private-profile');
  let rejected=false;
  try{verifyBrowserArguments(['--remote-debugging-port='+new URL(s.origin).port,'--user-data-dir=foreign'],profile);await fetch(s.origin,{method:'POST'});}catch{rejected=true;}
  assert.equal(rejected,true);assert.equal(s.writes(),0);
  verifyBrowserArguments(['--remote-debugging-pipe','--user-data-dir='+profile],profile);
});
test('private CDP pipe rejects an unexpected target session',async t=>{
  const child=spawn(process.execPath,['-e',`setTimeout(()=>require('fs').writeSync(4,JSON.stringify({id:1,sessionId:'foreign',result:{}})+'\\0'),50);setInterval(()=>{},1000)`],{stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
  const cdp=pipeClient(child,{timeoutMs:1000});
  t.after(()=>{cdp.close();if(child.exitCode===null&&!child.killed)child.kill();});
  await assert.rejects(cdp.send('Runtime.evaluate',{},'owned'),/session mismatch/);
});
test('invalid explicit media tool path does not fall back to PATH',()=>{
  assert.throws(()=>resolveMediaTools({PATH:process.env.PATH,MONTCLIP_FFMPEG:path.join(os.tmpdir(),'missing-ffmpeg')}),/no file/);
});
