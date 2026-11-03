'use strict';
// Where the corrections live (Deja, 2026-11-03): under the app's userData, on this computer; never in the project file,
// never in the MCP server's context, never sent (a numbers-only summary may go with an assistant request later, only
// when the streamer opens the assistant and agrees — not wired here). It can be turned off, emptied in one go, and says
// how many it holds.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Store=require('../desktop/corrections-store');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'montclip-corr-'));
const rec=(o={})=>({type:'trim',kind:'song',startShift:-4,endShift:3,duration:3600,...o});

test('kept under userData; counted; read back; numbers and fixed words only in the file',()=>{
 const dir=tmp(),s=Store.create({dir});
 a.deepEqual(s.status(),{enabled:true,count:0,byType:{trim:0,remove:0,kind:0,add:0}});
 a.equal(s.append(rec()).ok,true);a.equal(s.append({type:'kind',from:'song',to:'other',duration:3600,features:{len:120,level:-25,pause:0.3}}).ok,true);
 a.equal(s.status().count,2);
 a.equal(s.records().length,2);
 const files=fs.readdirSync(path.join(dir,'corrections'));a.ok(files.length>=1);
 for(const f of files){const raw=fs.readFileSync(path.join(dir,'corrections',f),'utf8');
  a.ok(!/\.(mp4|flv|wav|mov|mkv)|[\\/]|[一-鿿]/.test(raw),'no file name, path or text: '+raw.slice(0,200));}
 // what is refused is not kept
 a.equal(s.append({...rec(),name:'我的直播.mp4'}).code,'CORRECTION_INVALID');a.equal(s.status().count,2);
});

test('off: nothing is kept and nothing is used; on again, the old ones are back; emptied in one go',()=>{
 const dir=tmp(),s=Store.create({dir});
 s.append(rec());s.append(rec());
 s.setEnabled(false);
 a.deepEqual([s.status().enabled,s.status().count],[false,2]);
 a.equal(s.append(rec()).code,'CORRECTIONS_OFF');a.equal(s.records(),null,'off: none used');
 a.equal(Store.create({dir}).status().enabled,false,'the switch is remembered');
 s.setEnabled(true);a.equal(s.records().length,2);
 a.equal(s.clear().ok,true);a.equal(s.status().count,0);a.deepEqual(s.records(),[]);
 a.equal(Store.create({dir}).status().count,0,'emptied on disk too');
 // 〔清空〕 deletes the record files themselves (Deja): only the on/off switch is left
 a.deepEqual(fs.readdirSync(path.join(dir,'corrections')),['settings.json']);
});

test('the settings page counts by kind of change; undoing an edit takes its record back (v11)',()=>{
 const s=Store.create({dir:tmp()});
 const one=s.append(rec());a.match(one.id,/^[a-f0-9]{16}$/);
 s.append(rec());s.append({type:'remove',kind:'moment',duration:600});s.append({type:'kind',from:'moment',to:'song',duration:600});
 const two=s.append({type:'add',kind:'interaction',duration:600});
 a.deepEqual(s.status(),{enabled:true,count:5,byType:{trim:2,remove:1,kind:1,add:1}});
 a.deepEqual(s.undo(two.id),{ok:true});a.deepEqual(s.status().byType,{trim:2,remove:1,kind:1,add:0});
 a.equal(s.undo(two.id).code,'CORRECTION_UNKNOWN');a.equal(s.undo('../x').code,'CORRECTION_UNKNOWN');
 a.equal(s.records().some(r=>r.id===two.id),false);
});
test('bounded: the newest are kept',()=>{
 const s=Store.create({dir:tmp(),max:5});
 for(let i=0;i<8;i++)s.append(rec({startShift:-i}));
 a.deepEqual(s.records().map(r=>r.startShift),[-3,-4,-5,-6,-7]);
});

test('not in the project, not in MCP: the server, MCP and project code never read them',()=>{
 for(const f of ['server.js','mcp-server.js','mcp-tools.js','project-ops.js','projects.js'])a.ok(!/corrections/i.test(read(f)),f);
 // the main process reaches them through fixed channels only, behind the same guard as the other settings; no path from the page
 const main=read('desktop/main.js');
 for(const op of ['status','append','setEnabled','clear','records','undo'])a.match(main,new RegExp(`"montclip:corrections:${op}"`),op);
 a.match(main,/const corrections = require\("\.\/corrections-store"\)\.create\(\{ dir: app\.getPath\("userData"\) \}\);/);
 a.equal((main.match(/montclip:corrections:\w+[\s\S]{0,160}?settingsAllowed\(event, win, origin\)/g)||[]).length,6,'every channel guarded');
 a.match(read('desktop/view-preload.js'),/montclipCorrections/);
});

test('the golden-set evaluation runs without corrections unless asked (they come from the same streamer: a leak)',()=>{
 const g=read('real-tests/songs-golden.cjs');
 a.match(g,/const corrections = arg\("--corrections"\);/);
 a.match(g,/corrections: off/);
 a.ok(!/corrections-store|userData/.test(g),'never the streamer’s own store');
});
