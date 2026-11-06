'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../real-tests/meta-demo-footage.cjs'), 'utf8');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'footage-'));
  t.after(() => { const out=path.join(root,'out');try{if(fs.lstatSync(out).isSymbolicLink())fs.unlinkSync(out);}catch{} fs.rmSync(root, {recursive:true, force:true}); });
  return {root, out:path.join(root,'out'), profile:path.join(root,'profile')};
}
function boot(f, {missingKey=false, encodeStatus=1}={}) {
  const output=[]; let exited;
  class BrowserWindow { async loadURL() {} }
  const context = {Buffer, console, setInterval:()=>1, clearInterval(){}, setTimeout:fn=>fn(),
    process:{argv:['node','script','--montclip-smoke','--user-data-dir='+f.profile],env:{MONTCLIP_REAL_MODELS:'1',MONTCLIP_FOOTAGE_OUT:f.out},stdout:{write:s=>output.push(s)},exit:n=>{exited=n;throw Error('EXIT');}},
    require(id) {
      if(id==='electron') return {app:{exit:n=>{exited=n;}},BrowserWindow};
      if(id==='./meta-key-file.cjs') return {readKey:()=>missingKey?{skip:'no key file at '+path.join(f.root,'private-user','key')}:{key:'synthetic-secret'}};
      if(id==='node:child_process') return {spawnSync:(_bin,args)=>{fs.writeFileSync(args.at(-1),'partial');return {status:encodeStatus,stderr:Buffer.from(f.root+'/private-user/error synthetic-secret')};}};
      if(id==='node:module') return {_load(){}};
      if(id==='../desktop/main') return {};
      return require(id);
    }};
  vm.createContext(context);
  // Enter the real stopTake closure without driving Electron or calling a model.
  const instrumented=source.replace(' const still=async name=>', ' globalThis.takeTest={startTake,stopTake,result,takes};return; const still=async name=>');
  return {run:()=>vm.runInContext(instrumented,context),context,output,exited:()=>exited,
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
