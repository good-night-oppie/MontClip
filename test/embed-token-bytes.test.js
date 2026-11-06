'use strict';
const test=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
const {makeDataDir,startServer}=require('./helpers');
test('malformed/non-ASCII embed tokens reject with 403 and keep the private server alive',async t=>{
 const token=crypto.randomBytes(32).toString('hex');const {base,child}=await startServer(t,makeDataDir(t),{MONTCLIP_HOST:'cindy',MONTCLIP_EMBED_TOKEN:token,FABLECUT_NO_FS_WATCH:'1'});
 const results=[];
 for(const bad of ['é'.repeat(64),'😀'.repeat(32),'g'.repeat(64),'a'.repeat(63),'a'.repeat(65)]){
  results.push((await fetch(base+'/?token='+encodeURIComponent(bad))).status);
 }
 for(const headers of [{'X-MontClip-Session':'é'.repeat(64)},{Cookie:'montclip_embed='+'é'.repeat(64)}])results.push((await fetch(base+'/api/project',{headers})).status);
 a.equal((await fetch(base+'/api/project',{headers:{'X-MontClip-Session':token}})).status,200,'valid request still works after all malformed requests');
 a.equal(child.exitCode,null,'server remains alive');t.diagnostic(JSON.stringify(results));a.deepEqual(results,Array(7).fill(403));
});
