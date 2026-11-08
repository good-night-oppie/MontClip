'use strict';

const test=require('node:test'), a=require('node:assert/strict');
const {hidePaths}=require('../asr-status');
const paths=require('./fixtures/private-paths.cjs');
test('directory apostrophes do not consume closing quotes or following prose',()=>{
 const samples=[
  ["open 'C:/Users/O'Brien/x.json' failed (E:/other/y.bin)","open '…/x.json' failed (…/y.bin)"],
  ["'C:/a/b' and 'D:/c/d'","'…/b' and '…/d'"],
  ["open 'C:/Users/O'Brien/x.json' then relative/path","open '…/x.json' then relative/path"],
  ["无法打开C:/Users/O'Brien/x.json，后续中文 a/b 不被吞。","无法打开…/x.json，后续中文 a/b 不被吞。"]
 ];
 for(const [raw,expected] of samples){
  const out=hidePaths(raw);a.equal(out,expected);a.equal(hidePaths(out),out);
 }
});
for(const [i,p] of paths.entries()) test('hidePaths private and idempotent variant '+i,()=>{
 for(const wrap of [s=>'open '+s+' failed',s=>"open '"+s+"' failed",s=>'open "'+s+'" failed',s=>'open ('+s+') failed',s=>'无法打开'+s+'。']){
  const raw=wrap(p),out=hidePaths(raw);
  a.doesNotMatch(out,/someone|Some One|Some%20One|server|share/i);
  a.equal(out,wrap('…/x.json'));
  a.equal(hidePaths(out),out);
 }
});
test('hidePaths keeps ordinary errors, web URLs and relative saved paths intact',()=>{
 for(const text of ['read / write failed','ENOENT: could not load model; try again','see http://127.0.0.1:7777/api/asr','https://example.test/a/b','ratio 1/2 at 12:30','basic_string::_S_create','analysis/transcripts/a.json','…/model.bin','无法打开…/model.bin。']){
  a.equal(hidePaths(text),text);
 }
 a.equal(hidePaths('open /home/someone/x.json failed; see /Users/someone/y.bin'),'open …/x.json failed; see …/y.bin');
 a.equal(hidePaths('open /home/someone/x.json failed while reading /Users/someone/y.bin'),'open …/x.json failed while reading …/y.bin');
 for(const first of ['C:/Users/someone/x.json','/home/someone/x.json']){
  a.equal(hidePaths('open '+first+' failed while reading C:/Users/someone/y.bin'),'open …/x.json failed while reading …/y.bin');
 }
 a.equal(hidePaths('failed C:/Users/someone/x.json see https://example.com/help'),'failed …/x.json see https://example.com/help');
});
test('QQ: Windows and UNC spaces are private, POSIX paths stop at whitespace',()=>{
 for(const p of [String.raw`C:\Users\Some One\x.json`, '//server/share/Some One/x.json', 'file:///C:/Users/Some One/x.json']){
  const out=hidePaths(p); a.equal(out,'…/x.json');
  a.doesNotMatch(out,/Some|One|server|share|Users/);
 }
 a.equal(hidePaths('/home/someone/x.json 后面的中文不能吞掉 a/b'), '…/x.json 后面的中文不能吞掉 a/b');
 a.equal(hidePaths('file:///home/someone/x.json 后面的中文不能吞掉 a/b'), '…/x.json 后面的中文不能吞掉 a/b');
 for(const p of ['C:/Users/Some One/x.json','//server/share/Some One/x.json']){
  a.equal(hidePaths('无法打开'+p+'，后面的中文不能吞掉 a/b；请重试。'), '无法打开…/x.json，后面的中文不能吞掉 a/b；请重试。');
 }
});
