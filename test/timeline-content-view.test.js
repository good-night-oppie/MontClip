'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function setup(){
 const tracks=['V3','V2','V1','A1','A2'].map(id=>({id,kind:id[0]==='V'?'video':'audio',h:id[0]==='V'?58:42}));
 const scroll={scrollTop:0,getBoundingClientRect:()=>({top:0})};
 const rows=tracks.map((t,i)=>({dataset:{track:t.id},hidden:false,getBoundingClientRect(){const top=26+tracks.slice(0,i).reduce((n,t,j)=>n+(rows[j].hidden?0:t.h),0)-scroll.scrollTop;return{top,bottom:top+(this.hidden?0:t.h)};}}));
 const headers=rows.map(r=>({dataset:r.dataset}));let mode='simple',seq='a';
 const ctx={state:{gesture:false},project:{clips:[{track:'V1'},{track:'A1'}]},runtime:{projectGen:1},TRACKS:tracks,RULER_H:26,SeqLib:{activeId:()=>seq},seqRoot:()=>({}),mcView:{get:()=>({mode})},els:{tracks:{children:rows},timelineScroll:scroll},$:()=>({children:headers})};
 vm.runInNewContext(source.match(/function syncTimelineTrackView\(\) \{[\s\S]*?\n\}/)[0],ctx);
 return{ctx,rows,headers,scroll,run:()=>ctx.syncTimelineTrackView(),mode:v=>{mode=v;},seq:v=>{seq=v;}};
}
test('simple shows occupied and main tracks; advanced retains all tracks without editing project',()=>{const s=setup(),before=JSON.stringify(s.ctx.project);s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[true,true,false,false,true]);assert.deepEqual(s.headers.map(r=>r.hidden),s.rows.map(r=>r.hidden));s.mode('advanced');s.run();assert.ok(s.rows.every(r=>!r.hidden));assert.equal(s.scroll.scrollTop,116);assert.equal(JSON.stringify(s.ctx.project),before);});
test('ordinary render/edit preserves manual scroll; new track, sequence or project focuses content',()=>{const s=setup();s.mode('advanced');s.run();s.scroll.scrollTop=0;s.run();assert.equal(s.scroll.scrollTop,0);s.ctx.project.clips[0].start=9;s.run();assert.equal(s.scroll.scrollTop,0);s.seq('b');s.run();assert.equal(s.scroll.scrollTop,116);s.scroll.scrollTop=0;s.ctx.runtime.projectGen++;s.run();assert.equal(s.scroll.scrollTop,116);s.ctx.project.clips.push({track:'V2'});s.run();assert.equal(s.scroll.scrollTop,58);});
test('empty simple project keeps main lanes; occupied non-main tracks remain editable',()=>{const s=setup();s.ctx.project.clips=[];s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[true,true,false,false,true]);s.ctx.project.clips=[{track:'V3'},{track:'A2'}];s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[false,true,true,true,false]);});

function gestureWorld(simple=false){
 const s=setup(),listeners=new Map(),c={id:'v',track:simple?'V2':'V1',kind:'video',start:0,in:0,duration:4,props:{}},audio={id:'a',track:'A1',kind:'audio',start:0,in:0,duration:4,props:{}};
 s.ctx.project.clips=[c,audio];if(simple)s.ctx.project.clips.push({id:"target",track:"V1",kind:"video",start:8,in:0,duration:1,props:{}});s.mode(simple?'simple':'advanced');s.run();s.scroll.scrollTop=0;
 Object.assign(s.ctx,{window:{addEventListener(k,f){listeners.set(k,f);},removeEventListener(k,f){if(listeners.get(k)===f)listeners.delete(k);}},getMedia:()=>({duration:4}),withLinked:()=>s.ctx.project.clips,selectedClips:()=>[c],isClipLocked:()=>false,isTrackLocked:()=>false,timeAtEvent:e=>e.clientX/100,snapInfo:t=>({t,hit:false}),routeClipGain(){},renderInspector(){},scheduleSave(){s.saves++;},toastLocked(){},selectClip(){},pruneSelection(){},restoreSnapshot:v=>{s.ctx.project.clips=JSON.parse(v);},syncFromServer(){s.synced=true;}});
 s.ctx.state.selIds=new Set(['v']);s.ctx.runtime.undo=[];s.ctx.runtime.redo=['old'];s.saves=0;
 for(const name of ['trackAtEvent','startClipGesture'])vm.runInNewContext(source.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))[0],s.ctx);
 const event=(x,y)=>({clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 s.begin=()=>s.ctx.startClipGesture(event(10,s.rows.find(r=>r.dataset.track===c.track).getBoundingClientRect().top+20),c,'move',false);
 s.move=(x,y)=>{listeners.get('pointermove')(event(x,y));s.run();};
 s.end=type=>{const fn=listeners.get(type);assert.ok(fn,`${type} listener missing`);fn(type==='keydown'?{key:'Escape',preventDefault(){},stopImmediatePropagation(){}}:event(15,50));s.run();};
 s.c=c;s.listeners=listeners;return s;
}
test('production drag across empty upper lane keeps repeated pointer moves on the same target until release',()=>{
 const s=gestureWorld();s.begin();const y=s.rows[1].getBoundingClientRect().top+10;
 s.move(15,y);assert.equal(s.c.track,'V2');assert.equal(s.scroll.scrollTop,0);
 s.move(16,y);assert.equal(s.c.track,'V2');assert.equal(s.scroll.scrollTop,0);
 s.end('pointerup');assert.equal(s.ctx.state.gesture,false);assert.equal(s.ctx.runtime.undo.length,1);assert.equal(JSON.parse(s.ctx.runtime.undo[0])[0].track,'V1');assert.equal(s.scroll.scrollTop,58);assert.equal(s.saves,1);
});
test('simple unique source row remains until drag completes, then folds without changing undo',()=>{
 const s=gestureWorld(true);s.begin();const y=s.rows[2].getBoundingClientRect().top+10;
 s.move(15,y);assert.equal(s.c.track,'V1');assert.equal(s.rows[1].hidden,false);s.move(16,y);assert.equal(s.c.track,'V1');
 s.end('pointerup');assert.equal(s.rows[1].hidden,true);assert.equal(s.ctx.runtime.undo.length,1);
});
test('pointer cancel, Escape and blur restore the clip snapshot with no undo or save and settle layout',()=>{
 for(const type of ['pointercancel','keydown','blur']){const s=gestureWorld(true),before=JSON.stringify(s.ctx.project.clips);s.begin();s.move(15,s.rows[2].getBoundingClientRect().top+10);s.end(type);assert.equal(JSON.stringify(s.ctx.project.clips),before);assert.equal(s.ctx.runtime.undo.length,0);assert.equal(s.ctx.runtime.redo.length,1);assert.equal(s.ctx.state.gesture,false);assert.equal(s.rows[1].hidden,false);assert.equal(s.listeners.size,0);assert.equal(s.saves,0);}
});

test('simple V2/A1 content hides the empty V1 placeholder without editing project or undo',()=>{const s=setup();s.ctx.project.clips=[{track:'V2'},{track:'A1'}];const before=JSON.stringify(s.ctx.project);s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[true,false,true,false,true]);assert.equal(JSON.stringify(s.ctx.project),before);});
