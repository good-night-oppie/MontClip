/* VV (2026-11-02, #26 423234fa): 「按句选段」 did nothing. Its click listener was the function itself, and
   showSentenceSelection had since gained parameters (suggestion, onApplied): the MouseEvent arrived as
   `suggestion`, failed validation and returned silently. */
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

test('「按句选段」 calls showSentenceSelection with no arguments',()=>{
 assert.match(app,/q\("\[data-tr-sentences\]"\)\.addEventListener\("click", \(\) => showSentenceSelection\(\)\);/);
});

test('no listener in app.js hands its event to a top-level function whose first parameter is not an event',()=>{
 const params={};for(const m of app.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm))params[m[1]]=m[2].trim();
 const EVENT=/^(e|ev|evt|event)\b/;const bad=[];
 app.split('\n').forEach((line,i)=>{for(const m of line.matchAll(/addEventListener\(\s*["'`][\w:-]+["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)){const p=params[m[1]];if(p&&!EVENT.test(p))bad.push(`app.js:${i+1} ${m[1]}(${p})`);}});
 assert.deepEqual(bad,[]);
});

test('an invalid suggestion is logged, not dropped silently',()=>{
 const body=app.slice(app.indexOf('async function showSentenceSelection('),app.indexOf('async function showSentenceSelection(')+2500);
 assert.match(body,/if \(suggestion\) \{if\(!MontClipProposal\.current\(suggestion,projectJSON\(\),proposalContext\(\)\)\)\{console\.warn\("showSentenceSelection: /);
});
