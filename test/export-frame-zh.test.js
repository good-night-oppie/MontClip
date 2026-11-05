'use strict';
// Deja (2026-11-05): the export-frame drop-down above the player (#exportFrameSel) said “Full canvas”, “9:16 Reel”… in
// the Chinese interface too. Its options and its tooltip now come from own.ef-* in the interface language, and follow a
// language switch. The Chinese is a first draft (待 JJ 定稿); the English is what it said before.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences');

const KEYS=['ef-full','ef-9-16','ef-16-9','ef-4-5','ef-1-1'];
test('every option has its words in both languages; the English is what the drop-down said before',()=>{
 const en=View.text.en,zh=View.text['zh-CN'];
 a.deepEqual(KEYS.map(k=>en['own.'+k]),['Full canvas','9:16 Reel','16:9','4:5 IG','1:1 Square']);
 a.deepEqual(KEYS.map(k=>zh['own.'+k]),['整个画布','9:16 竖屏','16:9 横屏','4:5 竖版','1:1 方形']);
 a.equal(View.t('zh-CN','own.ef-custom',{w:608,h:1080}),'自定义 · 608×1080');
 a.equal(View.t('en','own.ef-custom',{w:608,h:1080}),'Custom · 608×1080');
 a.ok(zh['own.ef-title']&&en['own.ef-title']);
 a.match(read('ui-preferences.js'),/待 JJ 定稿/);
});

test('the drop-down is built from those keys, in the order and with the sizes it had, and rebuilt on a language switch',()=>{
 const app=read('app.js');
 a.match(app,/const EXPORT_FRAME_ASPECTS = \[\n  \{ key: "ef-full", w: 0, h: 0 \},\n  \{ key: "ef-9-16", w: 9, h: 16 \},\n  \{ key: "ef-16-9", w: 16, h: 9 \},\n  \{ key: "ef-4-5", w: 4, h: 5 \},\n  \{ key: "ef-1-1", w: 1, h: 1 \},\n\];/);
 a.ok(!/"Full canvas"|"9:16 Reel"|"1:1 Square"/.test(app),'no English left in app.js');
 const sync=app.slice(app.indexOf('function syncExportFrameSel()'),app.indexOf('function applyProject('));
 a.match(sync,/escapeHtml\(uiText\("own\." \+ a\.key\)\)/);
 a.match(sync,/escapeHtml\(uiText\("own\.ef-custom", \{ w: ef\.w, h: ef\.h \}\)\)/);
 a.match(sync,/els\.exportFrameSel\.title = uiText\("own\.ef-title"\);/);
 const refresh=app.slice(app.indexOf('function refreshLanguageText()'),app.indexOf('function updateMontClipView('));
 a.match(refresh,/syncExportFrameSel\(\);/);
});
