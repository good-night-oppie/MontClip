'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../real-tests/meta-demo-footage.cjs'), 'utf8');
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'footage-')));
  t.after(() => { const out=path.join(root,'out');try{if(fs.lstatSync(out).isSymbolicLink())fs.unlinkSync(out);}catch{} fs.rmSync(root, {recursive:true, force:true}); });
  return {root, out:path.join(root,'out'), profile:path.join(root,'profile')};
}
function boot(f, {missingKey=false, encodeStatus=1, lifecycle=false, recordingFails=false, loadFails=false, cleanupFails=false,reportFails=false}={}) {
  const output=[]; let exited, keyReads=0, userData, service;
  const handlers={};
  const agentModule={...require('../desktop/agent-service')};
  class BrowserWindow { async loadURL() {if(loadFails)throw Error('LOAD_FAILED');} }
  const context = {Buffer, console, setInterval:()=>1, clearInterval(){}, setTimeout:fn=>fn(),
    process:{argv:['node','script','--montclip-smoke','--user-data-dir='+f.profile],env:{MONTCLIP_REAL_MODELS:'1',MONTCLIP_FOOTAGE_OUT:f.out},stdout:{write:s=>output.push(s)},exit:n=>{exited=n;throw Error('EXIT');}},
    require(id) {
      if(id==='electron') return {app:{setPath:(_k,v)=>{userData=v;},getPath:()=>userData,exit:n=>{exited=n;},on:(name,fn)=>handlers[name]=fn},BrowserWindow};
      if(id==='node:fs'&&reportFails)return {...fs,writeFileSync(p,...args){if(p===path.join(f.out,'footage-result.json'))throw Error('synthetic report denied');return fs.writeFileSync(p,...args);}};
      if(id==='./meta-key-file.cjs') return {readKey:()=>{keyReads++;return missingKey?{skip:'no key file at '+path.join(f.root,'private-user','key')}:{key:'synthetic-secret'};}};
      if(id==='./footage-profile.cjs') return require('../real-tests/footage-profile.cjs');
      if(id==='../desktop/agent-service') return agentModule;
      if(id==='node:child_process') return {spawnSync:(_bin,args)=>{fs.writeFileSync(args.at(-1),'partial');return {status:encodeStatus,stderr:Buffer.from(f.root+'/private-user/error synthetic-secret')};}};
      if(id==='node:module') return {_load(){}};
      if(id==='../desktop/main') {
        if(lifecycle){
          const disk=cleanupFails?{...fs,unlinkSync(){throw Error('synthetic denied');}}:fs;
          service=agentModule.createDiskService(userData||f.profile,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},disk);
          a.equal(service.configure({provider:'meta',model:'muse-spark-1.1',apiKey:'synthetic-secret'}).configured,true);
        }
        return {};
      }
      return require(id);
    }};
  vm.createContext(context);
  // Enter the real stopTake closure without driving Electron or calling a model.
  let instrumented=source.replace(' const still=async name=>', ' globalThis.takeTest={startTake,stopTake,result,takes};return; const still=async name=>');
  if(lifecycle){
    const start=source.indexOf('  await read(`(async()=>{const until=Date.now()+15000;');
    const end=source.indexOf(' }catch(e){const code=');
    a.ok(start>0&&end>start);
    instrumented=source.slice(0,start)+(recordingFails?"  throw Error('SYNTHETIC_RECORDING_FAILURE');\n":"  result.passed=true;\n")+source.slice(end);
  }
  return {run:()=>vm.runInContext(instrumented,context),context,output,keyReads:()=>keyReads,exited:()=>exited,quit:()=>handlers['will-quit'](),
    open:()=>BrowserWindow.prototype.loadURL.call({webContents:{},isDestroyed:()=>false})};
}
for(const kind of ['file','directory','nonempty','junction','dangling']) test('refuses existing output '+kind+' without changing it', t=>{
  const f=fixture(t), target=path.join(f.root,'target');
  if(kind==='file') fs.writeFileSync(f.out,'original');
  else if(kind==='directory'||kind==='nonempty') {fs.mkdirSync(f.out);if(kind==='nonempty')fs.writeFileSync(path.join(f.out,'take-A.mp4'),'original');}
  else {if(kind==='junction')fs.mkdirSync(target);fs.symlinkSync(target,f.out,'junction');}
  const b=boot(f);a.throws(b.run);
  if(kind==='file')a.equal(fs.readFileSync(f.out,'utf8'),'original');
  if(kind==='nonempty')a.equal(fs.readFileSync(path.join(f.out,'take-A.mp4'),'utf8'),'original');
  if(kind==='junction'||kind==='dangling')a.ok(fs.lstatSync(f.out).isSymbolicLink());
});

test('invalid profile never consults the real-key adapter',t=>{
  const f=fixture(t);fs.mkdirSync(f.profile);fs.writeFileSync(path.join(f.profile,'keep'),'original');
  const b=boot(f);a.throws(b.run);a.equal(b.keyReads(),0);
});
for(const condition of ['success','recording failure','load failure'])test('sentinel credentials removed after '+condition,async t=>{
  const f=fixture(t),b=boot(f,{lifecycle:true,recordingFails:condition==='recording failure',loadFails:condition==='load failure'});
  b.run();await b.open();
  // Only this test's synthetic data; count matches without emitting contents.
  const residual=fs.readdirSync(f.profile).filter(n=>fs.lstatSync(path.join(f.profile,n)).isFile()&&fs.readFileSync(path.join(f.profile,n)).includes(Buffer.from('synthetic-secret').toString('base64'))).length;
  a.equal(residual,0);a.equal(b.exited(),condition==='success'?0:1);
  a.ok(!b.output.join('').includes('synthetic-secret'));
});
test('cleanup failure cannot report successful completion',async t=>{
  const f=fixture(t),b=boot(f,{lifecycle:true,cleanupFails:true});b.run();await b.open();
  a.equal(b.exited(),1);const result=JSON.parse(fs.readFileSync(path.join(f.out,'footage-result.json')));
  a.equal(result.passed,false);a.equal(result.failed,'CREDENTIAL_CLEANUP_FAILED');
});
test('report write failure still erases credentials and exits nonzero',async t=>{
 const f=fixture(t),b=boot(f,{lifecycle:true,reportFails:true});b.run();await b.open();
 a.equal(b.exited(),1);a.ok(!fs.existsSync(path.join(f.profile,'agent-connection-v1.json')));a.ok(b.output.join('').includes('REPORT_WRITE_FAILED'));
});
test('orderly quit outside recording handler erases credentials',t=>{
 const f=fixture(t),b=boot(f,{lifecycle:true});b.run();b.quit();a.ok(!fs.existsSync(path.join(f.profile,'agent-connection-v1.json')));
});
test('refuses a reused profile before creating output',t=>{
  const f=fixture(t);fs.mkdirSync(f.profile);fs.writeFileSync(path.join(f.profile,'project.json'),'original');
  a.throws(boot(f).run);a.equal(fs.readFileSync(path.join(f.profile,'project.json'),'utf8'),'original');a.ok(!fs.existsSync(f.out));
});
test('accepts an empty profile created by Electron before the script loads',t=>{
  const f=fixture(t);fs.mkdirSync(f.profile);a.doesNotThrow(boot(f).run);a.ok(fs.statSync(f.out).isDirectory());
});
test('missing key logs neither local path nor raw reader reason',t=>{
  const f=fixture(t), b=boot(f,{missingKey:true});a.throws(b.run,/EXIT/);
  a.equal(b.exited(),2);a.ok(!b.output.join('').includes(f.root));a.ok(!b.output.join('').includes('private-user'));
});
test('nonzero encoder cannot complete a take or publish its partial video',async t=>{
  const f=fixture(t), b=boot(f);b.run();await b.open();
  const x=b.context.takeTest;x.startTake('A');x.takes.A.frames.push({file:'00000.jpg',at:0});
  await a.rejects(x.stopTake());a.notEqual(x.result.passed,true);a.ok(!fs.existsSync(path.join(f.out,'take-A.mp4')));
  a.ok(fs.existsSync(x.takes.A.dir),'failed frames remain recoverable');
});
test('successful encoder publishes a take without overwriting an existing destination',async t=>{
  const f=fixture(t), b=boot(f,{encodeStatus:0});b.run();await b.open();
  const x=b.context.takeTest;x.startTake('A');x.takes.A.frames.push({file:'00000.jpg',at:0});
  fs.writeFileSync(path.join(f.out,'take-A.mp4'),'original');await a.rejects(x.stopTake());
  a.equal(fs.readFileSync(path.join(f.out,'take-A.mp4'),'utf8'),'original');
});
test('successful encoder publishes the staged file and cleans only its frames',async t=>{
  const f=fixture(t), b=boot(f,{encodeStatus:0});b.run();await b.open();
  const x=b.context.takeTest;x.startTake('A');x.takes.A.frames.push({file:'00000.jpg',at:0});
  await x.stopTake();a.equal(x.result.takes.A.ok,true);a.equal(fs.readFileSync(path.join(f.out,'take-A.mp4'),'utf8'),'partial');
  a.ok(!fs.existsSync(x.takes.A.dir));
});
