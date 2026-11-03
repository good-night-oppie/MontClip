'use strict';
// Deja 2026-11-03: danmaku lost on load. What is lost, and why: the editor's load (applyProject) copies only the
// top-level fields it knows, and `danmaku` is not one of them — so project.danmaku never reached the page (the
// highlight cards never saw a single danmaku, whatever project.json held), and the save (projectJSONHere) wrote it
// back without it, deleting it from disk on the next edit. Now it is kept through load and save as it is — every field
// of every entry (today's [{t}] and the per-recording entries of #53 alike) — copied, bounded, and cleared when the
// next project has none (applyProject assigns into the same object, so a value left over would leak into it).
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js');
const fn=(name)=>{const i=app.indexOf('function '+name+'(');a.ok(i>=0,name);return app.slice(i,app.indexOf('\n}',i)+2);};

test('normalizeDanmaku keeps every field of every entry, as a copy; not an array → null; bounded',()=>{
 const normalizeDanmaku=new Function(fn('normalizeDanmaku')+'return normalizeDanmaku;')();
 const today=[{t:12.5},{t:40,text:'哈哈哈',color:16777215,mode:1,sent:1730550000000}];
 const k=normalizeDanmaku(today);a.deepEqual(k,today);a.notEqual(k,today,'a copy');a.notEqual(k[1],today[1]);
 const pr53=[{mediaId:'m1',v:1,count:2,items:[[1.5,8,null,1,16777215,'好听'],[3,4,1730550000000,5,255,'安可']],source:'rec.xml'}];
 a.deepEqual(normalizeDanmaku(pr53),pr53,'the per-recording entries of #53, every field');
 for(const bad of [null,undefined,{t:1},'x',42])a.equal(normalizeDanmaku(bad),null);
 a.equal(normalizeDanmaku([]),null,'empty: nothing to keep');
 a.equal(normalizeDanmaku(new Array(400001).fill({t:1})),null,'more than 400000 entries is not a danmaku list the editor keeps');
 a.equal(normalizeDanmaku([{t:1,f(){}}])[0].f,undefined,'only JSON survives');
});
test('the load keeps it (and clears a value left from the project before); the save writes it back',()=>{
 const load=fn('applyProject');a.match(load,/\n    danmaku: normalizeDanmaku\(data\.danmaku\),/);
 const save=fn('projectJSONHere');a.match(save,/const danmaku = normalizeDanmaku\(project\.danmaku\);\n  if \(danmaku\) out\.danmaku = danmaku;/);
});
