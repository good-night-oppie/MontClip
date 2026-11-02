'use strict';
// Chinese interface, batch 2 (Deja, 2026-11-02): the Transcript panel, where streamers cut by
// text, plus "connected" in the top bar. Terms come from Rea's SPEC (term.*) and #30; anything
// else is own.* for JJ. Hover titles, dropdown options and the shortcuts window are batch 3.
// Chinese transcripts carry sentence times only, so no Chinese text may suggest cutting word by word.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const V=require('../ui-preferences'),zh=V.text['zh-CN'],en=V.text.en;
const OWN=['transcribe','transcribe-selected','transcribe-file','transcribe-files','found','cut-all','cut-n','copy','select-sentences','mapping',
 'caption-last','tr-empty','tr-missing','tr-more','loading','tr-no-words','tr-module-missing','tr-downloading-model','tr-transcribing','tr-transcribing-of',
 'tr-selection','tr-selection-one','connected','local-session'];
const SPEC=['cancel','import-2','captions','add-captions','cut','find-words'];

test('every string of the panel has a key in both languages; SPEC terms are reused, not redefined',()=>{
 for(const k of OWN){a.ok(zh['own.'+k],'zh own.'+k);a.ok(en['own.'+k],'en own.'+k);a.notEqual(zh['own.'+k],en['own.'+k],'own.'+k+' is translated');}
 for(const k of SPEC)a.ok(zh['term.'+k]&&en['term.'+k],'term.'+k);
 for(const k of OWN)a.ok(!(('term.'+k) in zh),'own.'+k+' must not shadow a SPEC term');
});

test('placeholders fill in both languages',()=>{
 const t=(l,k,v)=>V.t(l,k,v);
 a.equal(t('zh-CN','own.transcribe-selected',{n:2}),'听写所选（2）');a.equal(t('en','own.transcribe-selected',{n:2}),'Transcribe selected (2)');
 a.equal(t('zh-CN','own.found',{n:3}),'找到 3 处');a.equal(t('en','own.cut-n',{n:3}),'Cut 3');
 a.match(t('zh-CN','own.tr-transcribing-of',{name:'a.mp4',i:1,n:2,pct:40}),/a\.mp4.*1.*2.*40%/);
});

test('the panel and the top bar no longer hard-code English or mixed labels',()=>{
 const app=read('app.js').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 const build=app.slice(app.indexOf('function buildTranscriptPage'),app.indexOf('function transcriptSig')>app.indexOf('function buildTranscriptPage')?app.indexOf('function transcriptSig'):app.indexOf('function buildTranscriptPage')+8000);
 for(const s of ['>Cancel<','placeholder="Find words…"','>Cut all<','>Copy<','>Captions<','>Add captions<','>Import…<','按句选段 / Select sentences','时间映射 / Mapping','Caption last:','>Cut</button>'])
  a.ok(!build.includes(s),'buildTranscriptPage still has '+s);
 for(const s of ['`Transcribe selected (','"Cut all"','No transcript yet:','"No words in these clips."','`Downloading the speech model','`Transcribing ${name}','🟢 connected"','⚪ local session"',' found` : ""'])
  a.ok(!app.includes(s),'app.js still has '+s);
});

test('Chinese text never suggests cutting word by word (Chinese transcripts have sentence times)',()=>{
 for(const k of OWN){const v=zh['own.'+k];a.ok(!/逐词|选词|单词|逐字|按词|词语/.test(v),'own.'+k+': '+v);}
 a.ok(!/\{n\}/.test(zh['own.tr-selection'])||!/词/.test(zh['own.tr-selection']),'the selection line does not count words in Chinese');
});

test('switching language relabels the panel and the top bar without rebuilding the project',()=>{
 const app=read('app.js'),upd=app.slice(app.indexOf('function updateMontClipView'),app.indexOf('function updateMontClipView')+600);
 a.match(upd,/refreshLanguageText\(\)/);
 a.match(app,/function refreshLanguageText\(\)[\s\S]{0,600}renderTranscript\(true\)/);
 a.match(app,/function refreshLanguageText\(\)[\s\S]{0,600}projectStatusText\(\)/);
});

test('the new own.* keys are listed for JJ',()=>{
 const doc=read('docs/i18n/2026-11-02-zh-transcript-review.md');
 for(const k of OWN)a.ok(doc.includes('own.'+k),'listed: own.'+k);
});
