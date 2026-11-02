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
