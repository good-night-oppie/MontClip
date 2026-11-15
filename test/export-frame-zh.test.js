'use strict';
// Deja (2026-11-05): the export-frame drop-down above the player (#exportFrameSel) said “Full canvas”, “9:16 Reel”… in
// the Chinese interface too. Its options and its tooltip now come from own.ef-* in the interface language, and follow a
// language switch. JJ定稿 (2026-11-05), English included: no platform names (Reel, IG) any more.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const View=require('../ui-preferences');

const KEYS=['ef-full-canvas','ef-9-16','ef-16-9','ef-4-5','ef-1-1'];
test('JJ定稿, word for word: every option, the custom size and the tooltip, in both languages',()=>{
 const en=View.text.en,zh=View.text['zh-CN'];
 a.deepEqual(KEYS.map(k=>zh['own.'+k]),['完整画布','9:16 竖屏','16:9 横屏','4:5 竖图','1:1 方形']);
 a.deepEqual(KEYS.map(k=>en['own.'+k]),['Full canvas','9:16 Vertical','16:9 Landscape','4:5 Portrait','1:1 Square']);
 a.equal(View.t('zh-CN','own.ef-custom',{w:608,h:1080}),'自定义 · 608×1080');
 a.equal(View.t('en','own.ef-custom',{w:608,h:1080}),'Custom · 608×1080');
 a.equal(zh['own.ef-title'],'导出画面：在画布里框出要导出的那一块。');
 a.equal(en['own.ef-title'],'Export frame: the part of the canvas that gets exported.');
 for(const k of KEYS)a.ok(!/Reel|\bIG\b/.test(en['own.'+k]+zh['own.'+k]),'no platform names: '+k);
 // 「完整画布」 is the key VV's four use (#148): one key, one wording
 a.equal(KEYS[0],'ef-full-canvas');
});

test('the drop-down is built from those keys, in the order and with the sizes it had, and rebuilt on a language switch',()=>{
 const app=read('app/app.js');
 a.match(app,/const EXPORT_FRAME_ASPECTS = \[\n  \{ key: "ef-full-canvas", w: 0, h: 0 \},\n  \{ key: "ef-9-16", w: 9, h: 16 \},\n  \{ key: "ef-16-9", w: 16, h: 9 \},\n  \{ key: "ef-4-5", w: 4, h: 5 \},\n  \{ key: "ef-1-1", w: 1, h: 1 \},\n\];/);
 a.ok(!/"Full canvas"|"9:16 Reel"|"4:5 IG"|"1:1 Square"/.test(app),'no option words left in app.js');
 const sync=app.slice(app.indexOf('function syncExportFrameSel()'),app.indexOf('function applyProject('));
 a.match(sync,/escapeHtml\(uiText\("own\." \+ a\.key\)\)/);
 a.match(sync,/escapeHtml\(uiText\("own\.ef-custom", \{ w: ef\.w, h: ef\.h \}\)\)/);
 a.match(sync,/els\.exportFrameSel\.title = uiText\("own\.ef-title"\);/);
 const refresh=app.slice(app.indexOf('function refreshLanguageText()'),app.indexOf('function updateMontClipView('));
 a.match(refresh,/syncExportFrameSel\(\);/);
});
