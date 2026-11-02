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
