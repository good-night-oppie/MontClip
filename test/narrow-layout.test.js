'use strict';
// VV (2026-11-02): at 804×535 the preview was 0×0, the player controls sat on the timeline
// toolbar, and tools past the toolbar's edge were cut off and could not be clicked. Rule:
// what does not fit goes into a "More" menu instead of being cut; Snap goes last.
// The visible-window acceptance (804×535, 630×452, 1270×800; zh-CN/en; simple/advanced) is
// desktop/narrow-layout-smoke.cjs, recorded in docs/validation/2026-11-02-narrow-layout.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const L=require('../narrow-layout');

const items=(spec)=>spec.map(([id,width,rank])=>({id,width,rank}));
test('everything that fits stays in the bar and no More button is needed',()=>{
 const r=L.planOverflow(items([['a',50,null],['b',60,1],['c',70,2]]),{available:400,gap:8,moreWidth:40});
 a.deepEqual(r.more,[]);a.deepEqual(r.keep,['a','b','c']);a.equal(r.needsMore,false);
});
test('what does not fit goes into More, highest rank first; pinned items never move',()=>{
 const r=L.planOverflow(items([['seq',80,null],['split',60,9],['snap',60,1],['markers',70,8],['hold',90,10]]),{available:300,gap:8,moreWidth:40});
 a.equal(r.needsMore,true);
 a.deepEqual(r.more,['hold','split'],'rank 10 then 9 leave first');
 a.ok(r.keep.includes('seq')&&r.keep.includes('snap'));
 const used=r.keep.reduce((s,id)=>s+items([['seq',80],['split',60],['snap',60],['markers',70],['hold',90]]).find(x=>x.id===id).width,0)+8*r.keep.length+40;
 a.ok(used<=300,'what stays fits beside the More button: '+used);
});
test('Snap (the lowest rank) is the last tool to leave the bar',()=>{
 const spec=items([['seq',80,null],['tools',150,5],['split',60,9],['snap',70,1],['hold',90,10],['fit',50,7]]);
 for(let w=600;w>=120;w-=10){const r=L.planOverflow(spec,{available:w,gap:8,moreWidth:40});
  if(r.more.includes('snap'))a.deepEqual(r.more.slice().sort(),['fit','hold','snap','split','tools'],'at '+w+' Snap left before others');}
});
test('the timeline never takes the room the preview and player need',()=>{
 // 804×535: app inner 523, top bar 83 (wrapped), undo/redo row 31, split 6, four 6px gaps
 const max=L.timelineMax({appHeight:523,fixed:[83,31,6],gaps:4,gap:6,upperMin:150});
 a.equal(max,523-83-31-6-24-150);
 a.ok(L.UPPER_MIN>=150,'upper area keeps room for header + player + a picture');
 a.ok(L.TIMELINE_MIN<=140,'timeline can give way to the preview on short windows');
});
test('the toolbar marks how tools collapse; Snap last; nothing shrinks under its neighbour',()=>{
 const html=read('index.html'),bar=html.match(/<div class="timeline-toolbar">([\s\S]*?)\n    <\/div>\n    <div class="timeline">/)[1];
 const ranks=[...bar.matchAll(/data-more-rank="(\d+)"/g)].map(m=>+m[1]);a.ok(ranks.length>=10,'ranked tools: '+ranks.length);
 const snap=+bar.match(/class="snap-seg"[^>]*data-more-rank="(\d+)"/)[1];a.equal(snap,Math.min(...ranks),'Snap collapses last');
 a.match(bar,/id="btnTlMore"/);a.match(bar,/id="tlMoreMenu"/);
 const css=read('style.css');a.match(css,/\.timeline-toolbar > \*[^{]*\{[^}]*flex-shrink:\s*0/,'toolbar items keep their width');
 a.match(read('index.html'),/<script src="narrow-layout\.js/);
});
test('the monitor header keeps one row; its controls collapse into its own More menu',()=>{
 const html=read('index.html');a.match(html,/id="btnMonMore"/);a.match(html,/id="monMoreMenu"/);
 const head=html.match(/<section class="panel monitor" id="monitorPanel">[\s\S]*?<div class="monitor-stage"/)[0];
 a.ok([...head.matchAll(/data-more-rank="\d+"/g)].length>=5,'monitor header controls ranked');
});
test('narrow windows give the monitor room: side panels shrink below 1100px',()=>{
 const css=read('style.css'),m=css.match(/@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/)[1];
 a.match(m,/--side-panel-w:\s*clamp\(/);
});
test('More labels are in both languages',()=>{
 const v=require('../ui-preferences').text;for(const l of ['zh-CN','en'])a.ok(v[l]['own.more']||v[l].more,l);
});

test('the upper area keeps the monitor header, the player and a 90px picture',()=>{
 a.equal(L.upperNeed({head:40,transport:68}),40+68+90);
 a.equal(L.upperNeed({head:10,transport:20}),L.UPPER_MIN,'never below UPPER_MIN');
 a.match(read('app.js'),/upperMin:\s*MontClipNarrow\.upperNeed\(/,'the timeline budget uses it');
});
test('the top bar stays one row on narrow windows: its right-hand tools collapse, Export never does',()=>{
 const html=read('index.html'),right=html.match(/<div class="topbar-right">([\s\S]*?)\n    <\/div>\n  <\/header>/)[1];
 a.match(right,/id="btnTopMore"/);a.match(right,/id="topMoreMenu"/);
 a.ok(!/id="btnExport"[^>]*data-more-rank|data-more-rank[^>]*id="btnExport"/.test(right),'Export is pinned');
 a.ok([...right.matchAll(/data-more-rank="\d+"/g)].length>=4);
 const css=read('style.css'),m=css.match(/@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/)[1];a.ok(!/\.topbar[^{]*\{[^}]*flex-wrap:\s*wrap/.test(m),'no wrapping top bar');
 a.match(read('app.js'),/attach\(document\.querySelector\("\.topbar-right"\)/);
});
test('a narrow monitor puts the player on two rows instead of cutting buttons off',()=>{
 const css=read('style.css');a.match(css,/container-type:\s*inline-size/);a.match(css,/@container monitor \(max-width: 540px\)/);
});
test('a bar whose width follows its content cannot re-plan itself in a loop',()=>{
 a.match(read('narrow-layout.js'),/lastWidth/);
});
test('narrow side panels: tab strips scroll instead of cutting tabs off; the bin header collapses into More (Import stays)',()=>{
 const css=read('style.css'),m=css.match(/@media \(max-width: 1100px\) \{([\s\S]*?)\n\}/)[1];
 a.match(m,/\.bin-tabs\s*\{[^}]*overflow-x:\s*auto/);a.match(m,/\.bin-tabs button\s*\{[^}]*flex:\s*1 0 auto/);
 const html=read('index.html'),head=html.match(/<span class="panel-head-actions bin-actions">([\s\S]*?)<\/span>\n      <\/div>/)[1];
 a.match(head,/id="btnBinMore"/);a.match(head,/id="binMoreMenu"/);a.ok(!/data-more-rank[^>]*id="btnImport"|id="btnImport"[^>]*data-more-rank/.test(head),'Import is pinned');
 a.match(read('app.js'),/attach\(document\.querySelector\("\.bin-actions"\)/);
 a.match(read('app.js'),/\.bin-tabs[\s\S]{0,200}wheel/,'a mouse wheel scrolls a tab strip');
});
test('the top bar tightens its spacing on very narrow windows so Export stays in reach',()=>{
 a.match(read('style.css'),/@media \(max-width: 700px\) \{[^@]*\.app > \.topbar\s*\{[^}]*gap:\s*6px/);
});
test('the static demo ships narrow-layout.js (app.js needs it at start-up)',()=>{
 a.match(read('docs/demo/sync.js'),/"narrow-layout\.js"/);
});

// VV (#33 b9b8ddb, 804 and 630): the monitor's More menu sat under #preview, and the transcript's caption row was cut off.
test('the monitor More menu floats in <body> above the panels; the transcript tools scroll and the sentence row stands alone', () => {
  const read = (f) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', f), 'utf8');
  const lib = read('narrow-layout.js'), app = read('app.js'), css = read('style.css');
  a.match(lib, /function attach\(bar, button, menu, \{ onChange, floating = false \} = \{\}\)/);
  a.match(lib, /if \(floating\) \{ doc\.body\.appendChild\(menu\); menu\.classList\.add\("more-menu-floating"\); \}/);
  a.match(lib, /function open\(\) \{ menu\.hidden = false; button\.setAttribute\("aria-expanded", "true"\); place\(\); \}/);
  a.match(app, /MontClipNarrow\.attach\(document\.querySelector\("#monitorPanel \.panel-head-actions"\), \$\("btnMonMore"\), \$\("monMoreMenu"\), \{ floating: true \}\);/);
  a.match(css, /\.more-menu\.more-menu-floating \{\n  position: fixed;\n  right: auto;\n  z-index: 1000;/);
  a.match(css, /\.tr-head \{[^}]*max-height: 60%;\n  overflow-y: auto;\n\}/);
  // main (#52) put the entries in a row of their own at the top of the transcript head: the sentence row stands alone there
  a.match(app, /<div class="tr-row tr-entries">\n        <button type="button" class="btn tiny" data-tr-highlights>[^\n]*\n        <button type="button" class="btn tiny" data-tr-sentences>[^\n]*\n        <button type="button" class="btn tiny" data-tr-mapping>[^\n]*\n      <\/div>/);
});

// VV on b4a733e: at 804 and 630 the top bar's Layout and S/M/L were gone with no More button (a rule hid them below 1100px,
// and More only collects what is drawn); at 1270 the bin's + Adjust was squeezed under + Import (its buttons shrank).
test('nothing in a bar with a More menu is hidden by width: it goes into More instead', () => {
  const css = read('style.css');
  for (const block of css.match(/@media\s*\(max-width:\s*\d+px\)\s*\{[\s\S]*?\n\}/g) || [])
    a.ok(!/\.layout-tools\s*\{[^}]*display:\s*none/.test(block), 'the layout tools are not hidden on narrow windows');
});
test('the bin header buttons keep their labels at every width: they never shrink, they move into More', () => {
  const css = read('style.css'), outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
  a.match(outside, /\.panel-head > \.panel-head-actions\.bin-actions > \.btn \{[^}]*flex: 1 0 auto/);
});
