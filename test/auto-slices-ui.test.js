'use strict';
// P3 「✨ 自动出切片」 in the editor (Deja 2026-11-03; frozen design v7, v7.5 last; JJ's copy). What the real window does —
// placing, the first placed clip selected on its own track, one-step undo, the notification — is checked by
// desktop/auto-slices-smoke.cjs; this file checks the pieces that must be there and the words JJ approved.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const V=require('../ui-preferences');
const zh=(k,v)=>V.t('zh-CN','own.'+k,v),en=(k,v)=>V.t('en','own.'+k,v);

test('two entries: the top bar right of 项目, and the transcript tab beside 高光候选 (which stays)',()=>{
 const html=read('index.html'),i=html.indexOf('id="btnProjectsDash"'),j=html.indexOf('id="btnAutoSlices"');
 a.ok(i>0&&j>i&&html.indexOf('id="projectName"')>j,'right after 项目, before the project name');
 a.match(html,/id="btnAutoSlices"[^>]*data-i18n="own\.as-open"/);
 const app=read('app.js'),row=app.slice(app.indexOf('<div class="tr-row tr-entries">'),app.indexOf('</div>',app.indexOf('<div class="tr-row tr-entries">')));
 a.ok(row.indexOf('data-tr-highlights')>0&&row.indexOf('data-tr-auto')>row.indexOf('data-tr-highlights'),'beside 高光候选, which is kept');
 a.equal(zh('as-open'),'✨ 自动出切片');a.equal(zh('as-open-done'),'✨ 自动出切片 · 找完了');a.equal(zh('hl-open'),'高光候选');
});
test("JJ's words for the bottom bar and what placing says",()=>{
 a.equal(zh('as-place',{n:3}),'放到时间线上（3 条）');a.equal(zh('as-export',{n:3}),'直接导出这 3 条');
 a.equal(zh('as-placed',{n:3}),'已把 3 条放到时间线上，可以接着细剪。');a.equal(zh('as-undo'),'撤销');
 a.deepEqual(['as-step-start','as-step-run','as-step-review','as-step-done'].map(k=>zh(k)),['选录像','找高光','看一遍','导出']);
 a.equal(zh('as-keep'),'关掉不会丢，下次接着看');a.equal(zh('as-start-title'),'从哪场直播出切片？');a.equal(zh('as-go'),'开始找高光');
 a.equal(zh('as-guess-start'),'开头是估的，可能差几秒到十几秒。点「▶ 听开头」听一下，不对就用旁边的 ± 秒挪一下');
 a.equal(zh('as-guess-end'),'结尾是估的，可能差几秒到十几秒。点「▶ 听结尾」听一下，不对就用旁边的 ± 秒挪一下');
 a.equal(zh('as-found-head',{found:5,on:3}),'找到 5 条，先帮你勾了最好的 3 条');
});
test('every 自动出切片 string has English too, and the English is not the Chinese',()=>{
 const src=read('ui-preferences.js'),keys=[...src.matchAll(/"(as-[a-z0-9-]+)":/g)].map(m=>m[1]);
 a.ok(keys.length>=40,'the dialog has its own strings: '+keys.length);
 for(const k of keys){const e=en(k,{n:2,found:2,on:1,count:5,name:'x',time:'1:00',dur:'1 min',total:'1 min'}),c=zh(k,{n:2,found:2,on:1,count:5,name:'x',time:'1:00',dur:'1 min',total:'1 min'});
  a.ok(e&&c&&e!==c&&!/[一-鿿]/.test(e.replace(/[「」]/g,'')),k+': '+e);}
});
test('finished while the window is not in front: one local notification; the dialog is kept when closed',()=>{
 const app=read('app.js');
 a.match(app,/function autoSlicesNotify\(/);
 const fn=app.slice(app.indexOf('function autoSlicesNotify('),app.indexOf('\n}',app.indexOf('function autoSlicesNotify('))+2);
 a.match(fn,/document\.hasFocus\(\)/);a.match(fn,/new Notification\(/);
 a.match(app,/function placeAutoSlices\(/);a.match(app,/function undoAutoSlices\(/);
});
test('placing is one undo step for the whole batch, an editor event like any other',()=>{
 const app=read('app.js'),fn=app.slice(app.indexOf('function placeAutoSlices('),app.indexOf('\n}',app.indexOf('function placeAutoSlices('))+2);
 a.equal((fn.match(/pushUndo\(/g)||[]).length,1,'one pushUndo for every clip placed');
 a.match(fn,/EDIT\.overwriteAt\(/);a.ok(!/"V1"/.test(fn),'the track is wherever it lands, never V1 by name');
});
test('the module loads in the page before app.js',()=>{
 const html=read('index.html');a.ok(html.indexOf('src="auto-slices.js"')>0&&html.indexOf('src="auto-slices.js"')<html.indexOf('src="app.js"'));
});
test('desktop: the notification comes from the main process over one fixed channel that takes a count only (web permissions stay denied)',()=>{
 const main=read('desktop/main.js'),pre=read('desktop/view-preload.js');
 a.match(main,/ipcMain\.on\("montclip:notify:found", \(event, found\) =>/);
 const fn=main.slice(main.indexOf('"montclip:notify:found"'),main.indexOf('});',main.indexOf('"montclip:notify:found"')));
 a.match(fn,/settingsAllowed\(event, win, origin\)/);a.match(fn,/Number\.isSafeInteger\(found\)/);a.match(fn,/new Notification\(/);
 a.match(main,/ses\.setPermissionRequestHandler\(\(_, __, callback\) => callback\(false\)\);/,'web permissions still denied');
 a.match(pre,/montclipNotify/);a.match(pre,/ipcRenderer\.send\("montclip:notify:found", Number\(found\)\)/);
 a.equal(V.t('zh-CN','own.as-notify-title'),'MontClip：找完了');a.equal(V.t('zh-CN','own.as-notify-body',{found:5}),'找到 5 条，打开「✨ 自动出切片」看一遍。');
});
test("Deja's song-card words until JJ's final copy: a time, 可能在唱歌, three tags, the lyrics button kept with 如果这段是唱歌",()=>{
 a.equal(zh('as-moment-name',{time:'1:12:04'}),'1:12:04 那段');a.equal(zh('as-maybe-singing'),'可能在唱歌');
 a.deepEqual(['as-tag-estimated','as-tag-likely','as-tag-adjusted'].map(k=>zh(k)),['估的','比较可能','你调过']);
 a.equal(zh('as-lyrics'),'按歌词校准字幕');a.equal(zh('as-lyrics-if'),'如果这段是唱歌');
 const app=read('app.js');a.match(app,/MontClipAutoSlices\.title\(c\)/);a.ok(!/uiText\("own\.as-song-name"/.test(app),'第 n 首歌 only through the gate');
 a.ok(!/"own\.as-a-song"/.test(app)&&!/as-a-song/.test(read('ui-preferences.js')),'no 一首歌 · length');
});
test('v8 (frozen, JJ-approved): a level beside each start and end time; the likely hint; 你调过 grey with no hint; 不确定, not 拿不准',()=>{
 a.equal(zh('as-likely-start'),'开头比较可能在这里，还是点「▶ 听开头」听一下再定。');a.equal(zh('as-likely-end'),'结尾比较可能在这里，还是点「▶ 听结尾」听一下再定。');
 a.equal(zh('as-kind-hint-auto'),'它会自己判断。不确定时会在找完以后问你一句。');a.match(zh('as-ask-sub'),/我不确定/);
 for(const k of ['as-kind-hint-auto','as-ask-sub'])a.ok(!/拿不准/.test(zh(k)),k);
 const app=read('app.js'),edge=app.slice(app.indexOf('function autoEdgeHtml('),app.indexOf('\n}',app.indexOf('function autoEdgeHtml('))+2);
 a.match(edge,/MontClipAutoSlices\.edgeLevel\(c, w\)/);a.match(edge,/data-as-level=/);
 const card=app.slice(app.indexOf('function autoCardHtml('),app.indexOf('\n}',app.indexOf('function autoCardHtml('))+2);
 a.ok(!/MontClipAutoSlices\.tag\(/.test(card),'the level sits by each time, not once on the card');
});
