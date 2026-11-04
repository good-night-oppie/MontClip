'use strict';
// P6a: how the page offers 「按歌词校准字幕」. Behaviour: test/lyrics-align.test.js and desktop/lyrics-smoke.cjs.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences');

test('on this computer only: the alignment module and the window send nothing',()=>{
 const mod=read('lyrics-align.js'),app=read('app.js'),i=app.indexOf('function lyricsTargets'),body=app.slice(i,app.indexOf('function captionQuickHtml',i));
 for(const src of [mod,body])a.ok(!/fetch\(|XMLHttpRequest|montclipAgentService|WebSocket|sendBeacon/.test(src));
});

test('nothing changes before 〔应用〕; then one undo step, after a CAS on the project',()=>{
 // the dialog is shared with the 自动出切片 card (lyricsDialog, docs/decisions/2026-11-03-card-lyrics.md): it changes
 // nothing itself; 〔应用〕 checks stale() (the CAS) and only then calls the caller's onApply
 const app=read('app.js'),k=app.indexOf('function lyricsDialog('),dlg=app.slice(k,app.indexOf('function captionQuickHtml',k));
 a.ok(!/project\.clips\s*=|pushUndo\(|autoSnap\(/.test(dlg),'the dialog itself changes nothing');
 const apply=dlg.slice(dlg.indexOf('const apply ='));
 a.match(apply,/if \(stale\(\)\) \{ summary\.textContent = uiText\("own\.ly-changed"\); return; \}[\s\S]*onApply\(p\);/);
 // the Transcript tab: the CAS is the whole project; its change is one undo step, inside onApply
 const i=app.indexOf('function openLyricsAlign'),body=app.slice(i,k);
 a.match(body,/const signature = JSON\.stringify\(projectJSON\(\)\);/);
 a.match(body,/stale: \(\) => JSON\.stringify\(projectJSON\(\)\) !== signature, onApply: \(p\) => \{/);
 a.ok(!/project\.clips\s*=|pushUndo\(/.test(body.slice(0,body.indexOf('onApply: (p) =>'))),'nothing before 〔应用〕');
 a.equal((body.match(/pushUndo\(/g)||[]).length,1);
 // unsure lines are not ticked, and lines with nothing heard can't be
 a.match(dlg,/box\.checked = l\.sure; box\.disabled = l\.start == null;/);
 a.match(dlg,/result\.lines\.map\(\(l, i\) => \(l\.sure \? i : -1\)\)/,'apply all leaves the unsure lines out');
});

test('the button is in the Transcript tab’s caption row; the module loads with the page',()=>{
 const app=read('app.js'),html=read('index.html');
 a.match(app,/<button type="button" class="btn tiny" data-tr-cap-lyrics title="\$\{escapeHtml\(uiText\("own\.ly-open-title"\)\)\}" data-i18n="own\.ly-open" data-i18n-title="own\.ly-open-title">/);
 a.match(app,/q\("\[data-tr-cap-lyrics\]"\)\.addEventListener\("click", \(\) => openLyricsAlign\(\)\);/);
 a.ok(html.indexOf('lyrics-align.js')>0&&html.indexOf('lyrics-align.js')<html.indexOf('"app.js"'));
});

test('new words, both languages (for JJ); the button’s name is the one the setup page already uses',()=>{
 for(const k of ['ly-open','ly-open-title','ly-title','ly-intro','ly-paste','ly-placeholder','ly-align','ly-was','ly-now','ly-unsure','ly-no-time','ly-pick-line','ly-summary','ly-apply','ly-apply-all','ly-cancel','ly-done','ly-pick-range','ly-no-words','ly-no-lyrics','ly-too-long','ly-changed']){
  const zh=View.t('zh-CN','own.'+k),en=View.t('en','own.'+k);a.ok(zh&&zh!=='own.'+k,k);a.ok(en&&!/[一-鿿]/.test(en),k);
 }
 a.equal(View.t('zh-CN','own.ly-open'),'按歌词校准字幕');a.equal(View.t('en','own.ly-open'),'Fix captions using lyrics');
 a.ok(View.t('zh-CN','own.setup-local-errors').includes('「按歌词校准字幕」'));a.ok(View.t('en','own.setup-local-errors').includes('Fix captions using lyrics'));
});

// QQ on #85 / Deja (2026-11-03): the captions picked are the ones changed, the others not by a single character
test('the part is the picked captions (else the unlocked ones in IN–OUT), worked out by MontClipLyrics.scope, not a span from first to last',()=>{
 const app=read('app.js'),i=app.indexOf('function lyricsTargets'),body=app.slice(i,app.indexOf('function openLyricsAlign',i));
 a.match(body,/MontClipLyrics\.scope\(\{/);
 a.ok(!/Math\.min\(\.\.\.sel\.map/.test(body),'no first-to-last span any more');
 a.match(body,/locked:\s*isClipLocked\(c\)/,'IN–OUT leaves locked captions out');
});
test('apply replaces only what MontClipLyrics.plan says, each new caption in its own caption’s place; the removed ids leave the selection',()=>{
 const app=read('app.js'),i=app.indexOf('function openLyricsAlign'),body=app.slice(i,app.indexOf('function captionQuickHtml',i));
 a.match(body,/MontClipLyrics\.plan\(result, picked, t\.caps\)/);
 a.match(body,/const gone = new Set\(p\.replace\);/);
 a.ok(!/new Set\(t\.caps\.map/.test(body),'never every caption in the part');
 a.match(body,/for \(const id of gone\) state\.selIds\.delete\(id\);\s*if \(gone\.has\(state\.selId\)\) state\.selId = \[\.\.\.state\.selIds\]\.pop\(\) \?\? null;/);
 a.equal((body.match(/pushUndo\(/g)||[]).length,1,'one undo step');
 // under the comparison: how many lines answer to captions not picked (and how many picked captions stay as they were)
 a.match(body,/data-ly-outside/);a.match(body,/uiText\("own\.ly-outside", \{ n: p\.outside\.length \}\)/);
 a.match(body,/uiText\("own\.ly-held", \{ n: p\.held\.length \}\)/);
});
test('the two new sentences, both languages (for JJ)',()=>{
 for(const k of ['ly-outside','ly-held']){const zh=View.t('zh-CN','own.'+k),en=View.t('en','own.'+k);a.ok(zh&&zh!=='own.'+k&&zh.includes('{n}'),k);a.ok(en&&!/[一-鿿]/.test(en),k);}
 a.equal(View.t('zh-CN','own.ly-outside',{n:1}),'有 1 行歌词对应的是你没选的字幕，没改');
});
