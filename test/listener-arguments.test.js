/* VV (2026-11-02, #26 423234fa): 「按句选段」 did nothing. Its click listener was the function itself, and
   showSentenceSelection had since gained parameters (suggestion, onApplied): the MouseEvent arrived as
   `suggestion`, failed validation and returned silently. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// QQ (2026-11-02, 109e941c): the web demo carries its own copy (docs/demo/app.js, made by docs/demo/sync.js) and was
// left with the old listener; both copies are checked.
const FILES=['app/app.js','docs/demo/app/app.js'],read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('「按句选段」 calls showSentenceSelection with no arguments, in the editor and in the web demo',()=>{
 for(const f of FILES)assert.match(read(f),/q\("\[data-tr-sentences\]"\)\.addEventListener\("click", \(\) => showSentenceSelection\(\)\);/,f);
});

test('no listener hands its event to a top-level function whose first parameter is not an event, in either copy',()=>{
 const EVENT=/^(e|ev|evt|event)\b/;const bad=[];
 for(const f of FILES){const app=read(f),params={};
  for(const m of app.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm))params[m[1]]=m[2].trim();
  app.split('\n').forEach((line,i)=>{for(const m of line.matchAll(/addEventListener\(\s*["'`][\w:-]+["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)){const p=params[m[1]];if(p&&!EVENT.test(p))bad.push(`${f}:${i+1} ${m[1]}(${p})`);}});}
 assert.deepEqual(bad,[]);
});

test('an invalid suggestion is logged, not dropped silently, in either copy',()=>{
 for(const f of FILES){const app=read(f),at=app.indexOf('async function showSentenceSelection(');assert.ok(at>=0,f);
  assert.match(app.slice(at,at+2500),/if \(suggestion\) \{if\(!MontClipProposal\.current\(suggestion,projectJSON\(\),proposalContext\(\)\)\)\{console\.warn\("showSentenceSelection: /,f);}
});
