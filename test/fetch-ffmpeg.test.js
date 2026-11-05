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
test('a cached archive is used only when its size and SHA-256 match; otherwise it is fetched again',async t=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cache-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));
 const good=Buffer.from('pinned archive bytes'),sha=require('node:crypto').createHash('sha256').update(good).digest('hex');
 const b={url:'https://example.invalid/a.tar.xz',sha256:sha,bytes:good.length};let downloads=0;
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
// Rea on #150: a download is checked against the manifest's exact byte count first, then its SHA-256.
// A local server stands in for GitHub (the https:// URL is sent to it over plain HTTP).
function server(t,body){const http=require('node:http');let hits=0;const s=http.createServer((q,r)=>{r.writeHead(200,{'content-length':body.length});r.end(body);});
 t.after(()=>new Promise(r=>s.close(r)));return new Promise(r=>s.listen(0,'127.0.0.1',()=>{const port=s.address().port;
  r({hits:()=>hits,get:(url,cb)=>{hits++;return http.get(url.replace(/^https:\/\/[^/]+/,'http://127.0.0.1:'+port),cb);}});}));}
function cacheDir(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'mc-bytes-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const shaOf=(b)=>require('node:crypto').createHash('sha256').update(b).digest('hex');
test('a download whose size is not the pinned byte count is refused and its temporary file deleted',async t=>{
 const body=Buffer.from('an archive of the wrong length'),s=await server(t,body),d=cacheDir(t);
 const b={url:'https://example.invalid/ff.tar.xz',sha256:shaOf(body),bytes:body.length+1};
 await a.rejects(F.cachedArchive(b,d,{download:(u,f)=>F.download(u,f,{get:s.get})}),/size mismatch.*got 30 bytes, pinned 31/);
 a.equal(s.hits(),1);a.deepEqual(fs.readdirSync(d),[],'no .part and no archive left');
});
test('a download of the pinned size and SHA-256 is kept',async t=>{
 const body=Buffer.from('the pinned archive'),s=await server(t,body),d=cacheDir(t);
 const f=await F.cachedArchive({url:'https://example.invalid/ff.zip',sha256:shaOf(body),bytes:body.length},d,{download:(u,f)=>F.download(u,f,{get:s.get})});
 a.equal(fs.readFileSync(f,'utf8'),'the pinned archive');a.deepEqual(fs.readdirSync(d),['ff.zip']);
});
test('a build with no pinned byte count is an error, never skipped, and nothing is downloaded',async t=>{
 const body=Buffer.from('x'),s=await server(t,body),d=cacheDir(t);
 for(const bytes of [undefined,0,-1,1.5,'1'])
  await a.rejects(F.cachedArchive({url:'https://example.invalid/ff.zip',sha256:shaOf(body),bytes},d,{download:(u,f)=>F.download(u,f,{get:s.get})}),/no pinned byte count/,String(bytes));
 a.equal(s.hits(),0);a.deepEqual(fs.readdirSync(d),[]);
 a.throws(()=>F.checkArchive(path.join(d,'none'),{sha256:shaOf(body)}),/no pinned byte count/);
});
// Rea on #153: an --archive that fails its check names that local file, not the manifest's URL.
test('--archive: a local file that fails the size or SHA-256 check is named by its path in the error',t=>{
 const {spawnSync}=require('node:child_process'),man=require('../desktop/ffmpeg-manifest.json');
 const plat=Object.keys(man.builds)[0],d=cacheDir(t);
 const cases=[['short.tar.xz',Buffer.from('too short')],['samesize.tar.xz',Buffer.alloc(man.builds[plat].bytes)]];
 for(const [name,body] of cases){
  const file=path.join(d,name);fs.writeFileSync(file,body);
  const r=spawnSync(process.execPath,[path.join(__dirname,'..','desktop','fetch-ffmpeg.cjs'),'--platform',plat,'--archive',file,'--force'],{encoding:'utf8',env:{...process.env,MONTCLIP_FFMPEG_DIR:''}});
  a.notEqual(r.status,0,name);
  a.match(r.stderr,name==='short.tar.xz'?/size mismatch/:/SHA-256 mismatch/,name);
  a.ok(r.stderr.includes(file),name+': the error names '+file+'\n'+r.stderr);
  a.ok(!r.stderr.includes(man.builds[plat].url),name+': not the URL');
 }
});
