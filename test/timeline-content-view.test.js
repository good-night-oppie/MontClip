'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function setup(){
 const tracks=['V3','V2','V1','A1','A2'].map(id=>({id,kind:id[0]==='V'?'video':'audio',h:id[0]==='V'?58:42}));
 const scroll={scrollTop:0,clientHeight:180,getBoundingClientRect:()=>({top:0})};
 const rows=tracks.map((t,i)=>({dataset:{track:t.id},hidden:false,getBoundingClientRect(){const top=26+tracks.slice(0,i).reduce((n,t,j)=>n+(rows[j].hidden?0:t.h),0)-scroll.scrollTop;return{top,bottom:top+(this.hidden?0:t.h)};}}));
 const headers=rows.map(r=>({dataset:r.dataset}));let mode='simple',seq='a';
 const ctx={state:{gesture:false},project:{clips:[{track:'V1'},{track:'A1'}]},runtime:{projectGen:1},TRACKS:tracks,RULER_H:26,SeqLib:{activeId:()=>seq},seqRoot:()=>({}),mcView:{get:()=>({mode})},els:{tracks:{children:rows},timelineScroll:scroll},$:()=>({children:headers})};
 ctx.pushUndo=(snap)=>{ctx.runtime.undo.push(snap);if(ctx.runtime.undo.length>100)ctx.runtime.undo.shift();ctx.runtime.redo.length=0;}; // app.js: gestures record their step through pushUndo (P1 events)
 vm.runInNewContext(source.match(/function syncTimelineTrackView\(\) \{[\s\S]*?\n\}/)[0],ctx);
 // the helpers it calls (VV 630: lanes folded above, and the hint that says so); no hint button in this harness
 Object.assign(ctx,{document:{getElementById:()=>null},uiText:k=>k,MontClipCaptions:{isCaption:c=>!!c.caption||c.kind==='text'}});
 for(const name of ['captionOnlyTrack','foldTrackRow','updateTracksAboveHint'])vm.runInNewContext(source.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))[0],ctx);
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
 s.end('pointerup');assert.equal(s.ctx.state.gesture,false);assert.equal(s.ctx.runtime.undo.length,1);assert.equal(JSON.parse(s.ctx.runtime.undo[0])[0].track,'V1');{const r=s.rows.find(r=>r.dataset.track===s.c.track).getBoundingClientRect();assert.ok(r.top>=26&&r.bottom<=180,'the grabbed clip row stays fully visible after the drop');}assert.equal(s.scroll.scrollTop,0,'already visible: no scroll');assert.equal(s.saves,1);
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

test('subtitle above video does not push actual video/audio content below short viewport',()=>{for(const mode of ['simple','advanced']){const s=setup();s.mode(mode);s.ctx.project.clips=[{id:'caption',kind:'text',track:'V3'},{id:'video',kind:'video',track:'V1'},{id:'audio',kind:'audio',track:'A1'}];const before=JSON.stringify(s.ctx.project);s.ctx.runtime.undo=['unchanged'];s.run();for(const id of ['V1','A1']){const r=s.rows.find(r=>r.dataset.track===id),rect=r.getBoundingClientRect();assert.equal(r.hidden,false);assert.ok(rect.top>=26&&rect.bottom<=180,id+' must be entirely visible');}assert.equal(JSON.stringify(s.ctx.project),before);assert.deepEqual(s.ctx.runtime.undo,['unchanged']);s.scroll.scrollTop=0;s.run();assert.equal(s.scroll.scrollTop,0);s.ctx.state.gesture=true;s.ctx.runtime.projectGen++;s.run();assert.equal(s.scroll.scrollTop,0);s.ctx.state.gesture=false;s.run();
 // VV 2026-11-02: in simple mode a caption lane that does not fit is folded (V3 hidden, V1 right under the ruler);
 // advanced keeps every lane and scrolls past it
 if(mode==='advanced')assert.ok(s.scroll.scrollTop>0);else{assert.equal(s.rows[0].hidden,true,'V3 folded');assert.equal(s.scroll.scrollTop,0);}}});

// VV real window: dragging A1 onto an empty A2 re-focused the timeline and left the
// dropped clip 35% visible; narrowing the window left A1 57% visible.
function audioDragWorld(viewport){
 const s=setup(),listeners=new Map(),video={id:'v',track:'V1',kind:'video',start:0,in:0,duration:4,props:{}},c={id:'a',track:'A1',kind:'audio',start:0,in:0,duration:4,props:{}};
 s.scroll.clientHeight=viewport;s.ctx.project.clips=[video,c];s.mode('advanced');s.run();
 Object.assign(s.ctx,{window:{addEventListener(k,f){listeners.set(k,f);},removeEventListener(k,f){if(listeners.get(k)===f)listeners.delete(k);}},getMedia:()=>({duration:4}),withLinked:()=>[c],selectedClips:()=>[c],isClipLocked:()=>false,isTrackLocked:()=>false,timeAtEvent:e=>e.clientX/100,snapInfo:t=>({t,hit:false}),routeClipGain(){},renderInspector(){},scheduleSave(){},toastLocked(){},selectClip(){},pruneSelection(){},restoreSnapshot:v=>{s.ctx.project.clips=JSON.parse(v);},syncFromServer(){}});
 s.ctx.state.selIds=new Set(['a']);s.ctx.runtime.undo=[];s.ctx.runtime.redo=[];
 for(const name of ['trackAtEvent','startClipGesture'])vm.runInNewContext(source.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'))[0],s.ctx);
 const event=(x,y)=>({clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}}),row=id=>s.rows.find(r=>r.dataset.track===id);
 s.drag=to=>{s.ctx.startClipGesture(event(10,row(c.track).getBoundingClientRect().top+20),c,'move',false);listeners.get('pointermove')(event(15,row(to).getBoundingClientRect().top+10));s.run();listeners.get('pointerup')(event(15,0));s.run();};
 s.visible=id=>{const r=row(id).getBoundingClientRect();return r.top>=26-0.5&&r.bottom<=viewport+0.5;};
 s.c=c;return s;
}
test('a drop onto an empty lane does not jump the timeline away from the dropped clip',()=>{
 const s=audioDragWorld(150);assert.equal(s.scroll.scrollTop,116);s.scroll.scrollTop=134;assert.ok(s.visible('A2'));
 const project=()=>JSON.stringify(s.ctx.project);s.drag('A2');assert.equal(s.c.track,'A2');
 assert.equal(s.scroll.scrollTop,134,'no re-focus after the user\'s own drop');assert.ok(s.visible('A2'),'dropped clip fully visible');
 assert.equal(s.ctx.runtime.undo.length,1);
});
test('a drop onto a partly visible lane scrolls just enough to show the dropped clip',()=>{
 const s=audioDragWorld(150);assert.equal(s.scroll.scrollTop,116);assert.ok(!s.visible('A2'));
 s.drag('A2');assert.equal(s.c.track,'A2');assert.ok(s.visible('A2'),'dropped clip fully visible');assert.equal(s.scroll.scrollTop,134);
});
test('a window resize re-focuses the content once, but never during a drag',()=>{
 const s=setup();s.mode('advanced');s.run();s.scroll.scrollTop=0;
 vm.runInNewContext(source.match(/function timelineResizeRefocus\(\) \{[\s\S]*?\n\}/)[0],s.ctx);
 s.ctx.state.gesture=true;s.ctx.timelineResizeRefocus();s.run();assert.equal(s.scroll.scrollTop,0,'no re-focus while dragging');
 s.ctx.state.gesture=false;s.run();assert.equal(s.scroll.scrollTop,0,'a resize during a drag is dropped, not replayed onto the drop');
 const before=JSON.stringify(s.ctx.project);s.ctx.timelineResizeRefocus();assert.ok(s.scroll.scrollTop>0,'re-focused after the resize');
 const after=s.scroll.scrollTop;s.scroll.scrollTop=0;s.run();assert.equal(s.scroll.scrollTop,0,'only once per resize');
 s.ctx.timelineResizeRefocus();assert.equal(s.scroll.scrollTop,after);assert.equal(JSON.stringify(s.ctx.project),before);
});


// VV 2026-11-02 (630): only caption-only lanes fold; a lane with other clips keeps its row even when it does not fit.
test('a lane above with video is never folded, a caption-only lane is',()=>{
 const s=setup();s.ctx.project.clips=[{id:'over',kind:'video',track:'V2'},{id:'video',kind:'video',track:'V1'},{id:'audio',kind:'audio',track:'A1'}];s.run();
 assert.equal(s.rows[1].hidden,false,'V2 with video stays');assert.equal(s.ctx.syncTimelineTrackView.folded.size,0);
 const t=setup();t.ctx.project.clips=[{id:'cap',kind:'text',caption:true,track:'V2'},{id:'video',kind:'video',track:'V1'},{id:'audio',kind:'audio',track:'A1'}];t.run();
 assert.equal(t.rows[1].hidden,true,'caption-only V2 folds');assert.deepEqual([...t.ctx.syncTimelineTrackView.folded],['V2']);
});
