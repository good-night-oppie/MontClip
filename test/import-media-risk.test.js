'use strict';
// Deja (2026-11-03, on #83): fablecut_import_media is two different things. Downloading from a web address (its `path`
// holding a URL) is not one of the network exceptions the owner approved, so when the AI asks for it, it is blocked in
// every mode, Yolo too. Importing a file from this computer changes the project and can be undone: undoable. The host
// tells them apart from the arguments; a call it cannot read is blocked (fail closed).
const {test}=require('node:test'),a=require('node:assert/strict');
const Cap=require('../capabilities'),P=require('../agent-policy'),E=require('../app/agent-events');
const {createPolicyHost}=require('../desktop/agent-policy-host');

const URLS=['https://example.com/a.mp4','http://example.com/a.mp4','HTTPS://EXAMPLE.COM/a','ftp://x/y','file://C:/a.mp4','//server/share/a.mp4','\\\\server\\share\\a.mp4'];
const LOCAL=['C:\\Users\\me\\Videos\\a.mp4','C:/Users/me/a.mp4','/home/me/a.mp4','D:\\直播\\录像 1.flv'];

test('a web address or a network share: blocked; a file on this computer: undoable',()=>{
 for(const path of URLS)a.equal(Cap.riskOf('fablecut_import_media',{path}),'blocked',path);
 for(const path of LOCAL)a.equal(Cap.riskOf('fablecut_import_media',{path}),'undoable',path);
 a.equal(Cap.riskOf('fablecut_import_media',{path:'C:/a.mp4',url:'https://x'}),'blocked','a url argument of any kind');
 for(const args of [undefined,null,{},{path:''},{path:42},'C:/a.mp4'])a.equal(Cap.riskOf('fablecut_import_media',args),'blocked',JSON.stringify(args));
 a.equal(Cap.limits('fablecut_import_media'),null,'not an external send any more');
 a.equal(Cap.get('fablecut_import_media').risk,'undoable','the table’s own level is the local import');
});

test('every mode refuses the download, Yolo too; the local import is decided like any undoable step',()=>{
 const base={external:{enabled:true,allowlisted:true},approved:true};
 for(const mode of P.MODES){
  const x=P.decide({...base,mode,capability:'fablecut_import_media',args:{path:'https://example.com/a.mp4'}});
  a.equal(x.action,'refuse',mode);a.equal(x.code,'BLOCKED',mode);
 }
 const want={plan:'list',manual:'run',auto:'run',yolo:'run'};   // approved for this chat
 for(const mode of P.MODES)a.equal(P.decide({...base,mode,capability:'fablecut_import_media',args:{path:'C:/a.mp4'}}).action,want[mode],mode);
 a.equal(P.decide({...base,approved:false,mode:'manual',capability:'fablecut_import_media',args:{path:'C:/a.mp4'}}).action,'ask');
 a.equal(P.decide({...base,mode:'yolo',capability:'fablecut_import_media'}).code,'BLOCKED','no arguments: blocked');
});

test('the main process reads the arguments the same way; 「都批准」 for a local import never covers a download',async()=>{
 const h=createPolicyHost({confirmYolo:async()=>true,external:()=>({enabled:true,allowlist:[]}),language:()=>'zh-CN'});
 const ask=(path)=>h.decide({sessionId:'s1',capability:'fablecut_import_media',target:{kind:'project',value:'p_1'},args:{path}});
 const first=ask('C:/a.mp4');a.equal(first.action,'ask');a.equal(first.risk,'undoable');
 a.deepEqual(h.answer({ticket:first.ticket,choice:'session'}),{ok:true,run:true});
 a.equal(ask('C:/b.mp4').action,'run');
 const dl=ask('https://example.com/a.mp4');a.equal(dl.action,'refuse');a.equal(dl.code,'BLOCKED');
 await h.setMode('yolo');a.equal(ask('https://example.com/a.mp4').code,'BLOCKED');
});

test('an event of a download is refused too; a local import is an undoable event',()=>{
 const ev=(args)=>({id:'e1',runId:'r1',step:1,capability:'fablecut_import_media',args,actor:'ai',risk:'read',state:'planned',revisionBefore:1,revisionAfter:null,at:'2026-11-03T00:00:00Z'});
 a.throws(()=>E.normalize(ev({path:'https://example.com/a.mp4'})),/EVENT_BLOCKED/);
 a.equal(E.normalize(ev({path:'C:/a.mp4'})).risk,'undoable');
});
