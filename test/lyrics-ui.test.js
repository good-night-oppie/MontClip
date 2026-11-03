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
 const app=read('app.js'),i=app.indexOf('function openLyricsAlign'),body=app.slice(i,app.indexOf('function captionQuickHtml',i));
 const apply=body.indexOf('const apply =');
 a.ok(apply>0);
 a.ok(!/project\.clips\s*=|pushUndo\(/.test(body.slice(0,apply)),'aligning and showing the lines change nothing');
 a.match(body,/if \(JSON\.stringify\(projectJSON\(\)\) !== signature\) \{ summary\.textContent = uiText\("own\.ly-changed"\); return; \}/);
 a.equal((body.match(/pushUndo\(/g)||[]).length,1);
 // unsure lines are not ticked, and lines with nothing heard can't be
 a.match(body,/box\.checked = l\.sure; box\.disabled = l\.start == null;/);
 a.match(body,/result\.lines\.map\(\(l, i\) => \(l\.sure \? i : -1\)\)/,'apply all leaves the unsure lines out');
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
