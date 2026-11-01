'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function setup(){
 const tracks=['V3','V2','V1','A1','A2'].map(id=>({id,h:id[0]==='V'?58:42}));
 const scroll={scrollTop:0,getBoundingClientRect:()=>({top:0})};
 const rows=tracks.map((t,i)=>({dataset:{track:t.id},hidden:false,getBoundingClientRect(){return{top:26+tracks.slice(0,i).reduce((n,t,j)=>n+(rows[j].hidden?0:t.h),0)-scroll.scrollTop};}}));
 const headers=rows.map(r=>({dataset:r.dataset}));let mode='simple',seq='a';
 const ctx={project:{clips:[{track:'V1'},{track:'A1'}]},runtime:{projectGen:1},TRACKS:tracks,RULER_H:26,SeqLib:{activeId:()=>seq},seqRoot:()=>({}),mcView:{get:()=>({mode})},els:{tracks:{children:rows},timelineScroll:scroll},$:()=>({children:headers})};
 vm.runInNewContext(source.match(/function syncTimelineTrackView\(\) \{[\s\S]*?\n\}/)[0],ctx);
 return{ctx,rows,headers,scroll,run:()=>ctx.syncTimelineTrackView(),mode:v=>{mode=v;},seq:v=>{seq=v;}};
}
test('simple shows occupied and main tracks; advanced retains all tracks without editing project',()=>{const s=setup(),before=JSON.stringify(s.ctx.project);s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[true,true,false,false,true]);assert.deepEqual(s.headers.map(r=>r.hidden),s.rows.map(r=>r.hidden));s.mode('advanced');s.run();assert.ok(s.rows.every(r=>!r.hidden));assert.equal(s.scroll.scrollTop,116);assert.equal(JSON.stringify(s.ctx.project),before);});
test('ordinary render/edit preserves manual scroll; new track, sequence or project focuses content',()=>{const s=setup();s.mode('advanced');s.run();s.scroll.scrollTop=0;s.run();assert.equal(s.scroll.scrollTop,0);s.ctx.project.clips[0].start=9;s.run();assert.equal(s.scroll.scrollTop,0);s.seq('b');s.run();assert.equal(s.scroll.scrollTop,116);s.scroll.scrollTop=0;s.ctx.runtime.projectGen++;s.run();assert.equal(s.scroll.scrollTop,116);s.ctx.project.clips.push({track:'V2'});s.run();assert.equal(s.scroll.scrollTop,58);});
test('empty simple project keeps main lanes; occupied non-main tracks remain editable',()=>{const s=setup();s.ctx.project.clips=[];s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[true,true,false,false,true]);s.ctx.project.clips=[{track:'V3'},{track:'A2'}];s.run();assert.deepEqual(s.rows.map(r=>r.hidden),[false,true,false,false,false]);});
