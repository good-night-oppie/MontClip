'use strict';
// Ported from MontClip PR175 64ef89f5, focused on the new final-wording regression.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences');
test('JJ final sequence-limit wording renders the same limit as the guard',()=>{
 const vm=require('node:vm'),Seq=require('../sequences'),app=read('app.js');
 const start=app.indexOf("  if(!r.ok){if(ev)moveEvent(ev.id,r.code==='CANCELLED'");
 const branch=app.slice(start,app.indexOf('\n  const c=agentProjectContext();',start));
 for(const [lang,expected] of [
  ['zh-CN','这个工程已有 64 个序列，暂时不能再新建。请先删除一个不需要的序列，再试。'],
  ['en','This project already has 64 sequences. Remove an unneeded sequence, then try again.']]){
  for(const limit of [Seq.MAX,17]){
   let shown;
   vm.runInNewContext('(function(){'+branch+'})()',{
    r:{ok:false,code:'SEQUENCE_LIMIT'},ev:null,aspect:'9:16',SeqLib:{MAX:limit},
    uiText:(k,v)=>View.t(lang,k,v),toast:s=>shown=s
   });
   a.equal(shown,expected.replace('64',String(limit)));
  }
 }
});
