'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../desktop/agent-reframe-review-smoke.cjs'),'utf8');
function check(args){
 let loaded=false;
 const stop=new Error('STOP_BEFORE_APP');
 try{vm.runInNewContext(src,{process:{argv:['electron','smoke',...args],env:{MONTCLIP_FFMPEG_DIR:'synthetic-bin'}},require:id=>{if(id==='electron'){loaded=true;throw stop;}return require(id);}});}
 catch(e){if(e===stop)return {loaded};return {loaded,error:e.message};}
 return {loaded};
}
for(const args of [[],['--montclip-smoke'],['--montclip-smoke','--user-data-dir='],['--montclip-smoke','--user-data-dir=   ']])
 test('reframe smoke refuses missing/blank profile before loading Electron: '+JSON.stringify(args),()=>{const r=check(args);a.equal(r.loaded,false);a.ok(r.error);});
test('reframe smoke refuses a used profile without modifying it; accepts an empty or nonexistent one',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mc-smoke-guard-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const used=path.join(root,'used'),empty=path.join(root,'empty');fs.mkdirSync(used);fs.mkdirSync(empty);fs.writeFileSync(path.join(used,'settings.json'),'KEEP');
 const r=check(['--montclip-smoke','--user-data-dir='+used]);a.equal(r.loaded,false);a.match(r.error,/fresh|empty/i);a.equal(fs.readFileSync(path.join(used,'settings.json'),'utf8'),'KEEP');
 for(const p of [empty,path.join(root,'new')])a.deepEqual(check(['--montclip-smoke','--user-data-dir='+p]),{loaded:true});
 a.equal(fs.existsSync(path.join(root,'new')),false);
});
