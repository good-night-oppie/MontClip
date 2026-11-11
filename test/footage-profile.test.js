'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepare}=require('../dev/real-tests/footage-profile.cjs'),Agent=require('../desktop/agent-service');
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'footage-private-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,profile:path.join(root,'profile'),out:path.join(root,'out')};}
function bind(g,disk=fs){const agent={...Agent};let userData;g.bind({setPath:(_,p)=>userData=p,getPath:()=>userData},agent);return agent.createDiskService(g.profile,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},disk);}
test('native POSIX new and Electron-created empty profile are owner-only',{skip:process.platform==='win32'},t=>{
 for(const existing of [false,true]){const f=fixture(t);if(existing)fs.mkdirSync(f.profile,{mode:0o755});prepare(f.profile,f.out);const st=fs.statSync(f.profile);a.equal(st.mode&0o777,0o700);a.equal(st.uid,process.getuid());}
});
for(const existing of [false,true])test('POSIX mode enforcement with synthetic filesystem metadata, existing='+existing,t=>{
 const f=fixture(t);if(existing)fs.mkdirSync(f.profile);let mode=0o755,chmod=0;
 const mock={...fs,lstatSync:p=>{const st=fs.lstatSync(p);if(p===f.profile)return Object.assign(st,{uid:77,mode:(st.mode&~0o777)|mode});return st;},chmodSync:(p,m)=>{a.equal(p,f.profile);mode=m;chmod++;}};
 prepare(f.profile,f.out,{fs:mock,platform:'linux',uid:77});a.equal(chmod,1);a.equal(mode,0o700);
});
test('wrong POSIX owner is refused before chmod',t=>{
 const f=fixture(t);fs.mkdirSync(f.profile);let chmod=0;
 const mock={...fs,lstatSync:p=>Object.assign(fs.lstatSync(p),{uid:88}),chmodSync:()=>chmod++};
 a.throws(()=>prepare(f.profile,f.out,{fs:mock,platform:'linux',uid:77}),/PROFILE_OWNER_REQUIRED/);a.equal(chmod,0);a.ok(!fs.existsSync(f.out));
});
test('ineffective chmod is rejected before output creation',t=>{
 const f=fixture(t);fs.mkdirSync(f.profile);
 const mock={...fs,lstatSync:p=>{const st=fs.lstatSync(p);return Object.assign(st,{uid:77,mode:(st.mode&~0o777)|0o755});},chmodSync(){}};
 a.throws(()=>prepare(f.profile,f.out,{fs:mock,platform:'linux',uid:77}),/PRIVATE_PROFILE_REQUIRED/);a.ok(!fs.existsSync(f.out));
});
test('profile/output overlap and profile junction are refused without deleting target',t=>{
 const f=fixture(t);fs.mkdirSync(f.profile);
 a.throws(()=>prepare(f.profile,path.join(f.profile,'out')),/OVERLAPPING/);
 const alias=path.join(f.root,'alias');fs.symlinkSync(f.profile,alias,'junction');
 try{a.throws(()=>prepare(alias,f.out),/FRESH_PROFILE_REQUIRED/);a.ok(fs.existsSync(f.profile));}finally{fs.unlinkSync(alias);}
});
test('effective userData mismatch prevents service creation',t=>{
 const f=fixture(t),g=prepare(f.profile,f.out);
 a.throws(()=>g.bind({setPath(){},getPath:()=>f.root},{...Agent}),/PROFILE_BIND_FAILED/);
});
test('normal product deletion removes sentinel main, temporary and reset backup files only',t=>{
 const f=fixture(t),g=prepare(f.profile,f.out),service=bind(g);
 service.configure({provider:'meta',model:'muse-spark-1.1',apiKey:'synthetic-sentinel'});
 const base='agent-connection-v1.json',backup=path.join(f.profile,'agent-connection-backup-test');fs.mkdirSync(backup);
 fs.copyFileSync(path.join(f.profile,base),path.join(backup,base));fs.copyFileSync(path.join(f.profile,base),path.join(f.profile,base+'.test.tmp'));
 fs.writeFileSync(path.join(f.profile,'keep'),'synthetic unrelated');fs.writeFileSync(path.join(f.out,'take-A.mp4'),'synthetic output');
 a.deepEqual(g.cleanup(),{ok:true,remaining:0});a.equal(service.get().configured,false);
 a.deepEqual(fs.readdirSync(f.profile),['keep']);a.equal(fs.readFileSync(path.join(f.out,'take-A.mp4'),'utf8'),'synthetic output');
 a.deepEqual(g.cleanup(),{ok:true,remaining:0});
});
test('redirected backup cleanup fails closed and preserves outside sentinel',t=>{
 const f=fixture(t),g=prepare(f.profile,f.out);bind(g);
 const outside=path.join(f.root,'outside'),link=path.join(f.profile,'agent-connection-backup-link');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'agent-connection-v1.json'),'synthetic outside');
 fs.symlinkSync(outside,link,'junction');try{a.equal(g.cleanup().ok,false);a.equal(fs.readFileSync(path.join(outside,'agent-connection-v1.json'),'utf8'),'synthetic outside');}finally{fs.unlinkSync(link);}
});
test('replaced profile is not cleaned',t=>{
 const f=fixture(t),g=prepare(f.profile,f.out);bind(g);
 fs.renameSync(f.profile,path.join(f.root,'original'));fs.mkdirSync(f.profile);fs.writeFileSync(path.join(f.profile,'agent-connection-v1.json'),'synthetic replacement');
 a.equal(g.cleanup().ok,false);a.equal(fs.readFileSync(path.join(f.profile,'agent-connection-v1.json'),'utf8'),'synthetic replacement');
});
