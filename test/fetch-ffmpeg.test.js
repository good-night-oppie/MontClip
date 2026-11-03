'use strict';
// QQ on #28: an install that fails half way, or whose LGPL self-check fails, must not
// leave a partial or unchecked ffmpeg in vendor/ (ffmpeg-path.js uses whatever is there),
// and a download whose response breaks off must fail instead of hanging.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const F=require('../desktop/fetch-ffmpeg.cjs');
function tree(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-fetch-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const src=path.join(d,'src');fs.mkdirSync(path.join(src,'bin'),{recursive:true});for(const n of ['ffmpeg','ffprobe'])fs.writeFileSync(path.join(src,'bin',n),'new '+n);fs.writeFileSync(path.join(src,'LICENSE.txt'),'LGPL');
 const dest=path.join(d,'vendor','ffmpeg','linux-x64');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'ffmpeg'),'old good');return{src,dest,parent:path.dirname(dest)};}
test('a failing self-check leaves the previous vendor folder as it was and no staging behind',t=>{
 const {src,dest,parent}=tree(t);
 a.throws(()=>F.installTree({src,dest,win:false,check:()=>{throw new Error('GPL build');}}),/GPL build/);
 a.equal(fs.readFileSync(path.join(dest,'ffmpeg'),'utf8'),'old good');
 a.deepEqual(fs.readdirSync(parent),['linux-x64'],'no staging or backup folders left');
});
test('a missing file in the archive fails before touching vendor',t=>{
 const {src,dest,parent}=tree(t);fs.rmSync(path.join(src,'bin','ffprobe'));
 a.throws(()=>F.installTree({src,dest,win:false,check:()=>'ok'}));
 a.equal(fs.readFileSync(path.join(dest,'ffmpeg'),'utf8'),'old good');a.deepEqual(fs.readdirSync(parent),['linux-x64']);
});
test('a checked install replaces vendor in one step',t=>{
 const {src,dest,parent}=tree(t);
 F.installTree({src,dest,win:false,check:file=>{a.ok(!file.startsWith(dest+path.sep),'checked before it is in vendor');return 'ffmpeg version n9 LGPL';},source:{url:'u'}});
 a.equal(fs.readFileSync(path.join(dest,'ffmpeg'),'utf8'),'new ffmpeg');a.ok(fs.existsSync(path.join(dest,'SOURCE.json')));
 a.deepEqual(fs.readdirSync(parent),['linux-x64']);
});
function fakeGet(behaviour){return(url,cb)=>{const req=new EventEmitter();const res=new EventEmitter();Object.assign(res,{statusCode:200,headers:{},resume(){},pipe(out){res.out=out;return out;},destroy(){}});req.setTimeout=(ms,f)=>{req.timer=setTimeout(f,ms);};req.destroy=e=>{clearTimeout(req.timer);req.emit('error',e||new Error('destroyed'));};
 setImmediate(()=>{cb(res);behaviour(res,req);});return req;};}
test('a response that breaks off or stalls rejects instead of hanging',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-dl-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 await a.rejects(F.download('https://x/a.zip',path.join(d,'a'),{get:fakeGet(res=>res.emit('aborted'))}),/interrupted|aborted/);
 await a.rejects(F.download('https://x/b.zip',path.join(d,'b'),{get:fakeGet(res=>res.emit('error',new Error('ECONNRESET')))}),/ECONNRESET/);
 await a.rejects(F.download('https://x/c.zip',path.join(d,'c'),{get:fakeGet(()=>{}),timeoutMs:50}),/timed out/);
});

// Owner 2026-11-02: CI and local runs reuse the one pinned build; nothing is fetched
// again unless the manifest changes, and a reused copy is verified first.
const build={url:'https://example.invalid/ffmpeg-x-lgpl.tar.xz',sha256:null,root:'r'};
function installed(t,{win=false}={}){const {src,dest}=tree(t);F.installTree({src,dest,win,check:()=>'v',source:{sha256:'abc',url:build.url}});return dest;}
test('an installed folder with the same pinned hash and unchanged programs is reused',t=>{
 const dest=installed(t);
 a.equal(F.upToDate(dest,{sha256:'abc'},{win:false}).ok,true);
 a.equal(F.upToDate(dest,{sha256:'other'},{win:false}).ok,false,'another pinned build');
 fs.writeFileSync(path.join(dest,'ffmpeg'),'tampered');
 const r=F.upToDate(dest,{sha256:'abc'},{win:false});a.equal(r.ok,false);a.match(r.reason,/ffmpeg changed/);
 a.equal(F.upToDate(path.join(dest,'nope'),{sha256:'abc'},{win:false}).ok,false);
});
test('a cached archive is used only when its SHA-256 matches; otherwise it is fetched again',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cache-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const good=Buffer.from('pinned archive bytes'),sha=require('node:crypto').createHash('sha256').update(good).digest('hex');
 const b={url:'https://example.invalid/a.tar.xz',sha256:sha};let downloads=0;
 const dl=async(url,file)=>{downloads++;fs.writeFileSync(file,good);};
 const p1=await F.cachedArchive(b,d,{download:dl});a.equal(downloads,1);a.equal(F.sha256(p1),sha);
 const p2=await F.cachedArchive(b,d,{download:dl});a.equal(downloads,1,'cache hit: no download');a.equal(p2,p1);
 fs.writeFileSync(p1,'corrupt');await F.cachedArchive(b,d,{download:dl});a.equal(downloads,2,'bad cached copy is replaced');
 await a.rejects(F.cachedArchive({...b,sha256:'0'.repeat(64)},fs.mkdtempSync(path.join(d,'x')),{download:dl}),/SHA-256 mismatch/,'a download that does not match fails red');
 await a.rejects(F.cachedArchive(b,fs.mkdtempSync(path.join(d,'y')),{download:async()=>{throw new Error('HTTP 503');}}),/HTTP 503/);
});
test('fetch-ffmpeg never looks for an ffmpeg on PATH or the runner',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','desktop','fetch-ffmpeg.cjs'),'utf8');
 a.ok(!/process\.env\.PATH|["']which["']|["']where(\.exe)?["']|spawnSync\(["']ffmpeg/.test(src));
});
