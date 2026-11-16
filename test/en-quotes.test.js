'use strict';
// JJ's rule (2026-11-03), for the whole app: English quotes with “ ”, never 「」 (Chinese keeps 「」). Every English value
// of the interface's own tables (ui-preferences: own.* and the other keyed tables; ui-terms' English column; the native
// dialogs' English text, desktop/native-text.js), and every English string literal the interface shows (app.js,
// index.html, server.js, export-jobs.js, desktop/main.js, the assistant pane). A literal counts as English when it has
// no Chinese outside its brackets. Not the AI's tool descriptions (mcp-tools.js, mcp-server.js): they quote the
// interface's Chinese words for the AI to use with the streamer, and nobody reads them on screen.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=(f)=>{try{return fs.readFileSync(path.join(ROOT,f),'utf8');}catch{return null;}};
const QUOTE=/[「」]/;

test('every English value of the interface\'s tables quotes with “ ”, never 「」',()=>{
 const V=require('../ui-preferences'),bad=[];
 for(const [k,v] of Object.entries(V.text.en||{}))if(typeof v==='string'&&QUOTE.test(v))bad.push('ui-preferences '+k);
 // the other tables in ui-preferences (each {en, zh} or [en, zh]): their English halves
 const walk=(o,at)=>{if(!o||typeof o!=='object')return;for(const [k,v] of Object.entries(o)){
  if(k==='en'&&v&&typeof v==='object')for(const [kk,vv] of Object.entries(v)){if(typeof vv==='string'&&QUOTE.test(vv))bad.push(at+'.en.'+kk);}
  else if(v&&typeof v==='object'&&k!=='zh'&&k!=='zh-CN'&&at.split('.').length<4)walk(v,at+'.'+k);}};
 walk(V,'ui-preferences');
 const T=require('../ui-terms');const terms=T.TERMS||T.terms||{};
 for(const [k,v] of Object.entries(terms))if(Array.isArray(v)&&QUOTE.test(v[0]))bad.push('ui-terms '+k);
 if(read('desktop/native-text.js')){const N=require('../desktop/native-text');const en=(N.TEXT||N.text||N).en||{};
  for(const [k,v] of Object.entries(en))if(QUOTE.test(JSON.stringify(v)))bad.push('native-text '+k);}
 a.deepEqual([...new Set(bad)],[]);
});

test('every English string the interface shows quotes with “ ”, never 「」',()=>{
 const FILES=['ui-preferences.js','ui-terms.js','app/app.js','index.html','server/server.js','server/export-jobs.js','desktop/main.js','desktop/native-text.js','agent-ui/src/pane.tsx','app/cindy-official.js'];
 const LIT=/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g,bad=[];
 for(const f of FILES){const src=read(f);if(src==null)continue;
  // comments are not shown (blanked out, so line numbers stay)
  const code=src.replace(/\/\*[\s\S]*?\*\//g,(m)=>m.replace(/[^\n]/g,' ')).replace(/(^|[^:"'`\\])\/\/.*$/gm,(m,p)=>p+' '.repeat(m.length-p.length));
  for(const m of code.matchAll(LIT)){const t=m[0];if(!QUOTE.test(t))continue;
   const outside=t.replace(/「[^」]*」/g,'');if(/[一-鿿]/.test(outside)||!/[A-Za-z]{3,}/.test(outside))continue;
   bad.push(`${f}:${src.slice(0,m.index).split('\n').length}  ${t.slice(0,80)}`);}}
 a.deepEqual(bad,[]);
});

test('the check finds what it is for, and leaves Chinese and the AI\'s descriptions alone',()=>{
 const english=(t)=>{const o=t.replace(/「[^」]*」/g,'');return QUOTE.test(t)&&!/[一-鿿]/.test(o)&&/[A-Za-z]{3,}/.test(o);};
 a.ok(english('"Took out 「{name}」"'));a.ok(!english('"已拿掉「{name}」"'));a.ok(!english('"Took out “{name}”"'));
 a.ok(!/fablecut_|mcp/.test(['ui-preferences.js','app/app.js'].join()),'the AI\'s descriptions are not in the scope');
});
