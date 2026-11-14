/* Existing-engine characterization, not new buttons or decoded-media acceptance.
 * CFR/VFR arrays below are synthetic presentation timestamps, not ffprobe output.
 * Execute actual edit and app undo functions; DOM/save are stubbed explicitly. */
'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const crypto=require('node:crypto');
const Edit=require('../shared/edit-ops');
const MP4=require('../app/mp4-demux');
const Events=require('../app/agent-events');
const {SRC}=require('./timeline-sandbox');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ffPath=require('../server/ffmpeg-path');

function world() {
  const shot=(id,start,inn)=>['V1','A1'].map(track=>({id:id+track,track,
    kind:track==='V1'?'video':'audio',mediaId:'synthetic',start,in:inn,duration:1,
    linkGroup:id,props:{speed:1},keyframes:{opacity:[{t:0,v:1}]}}));
  const project={fps:25,revision:1,clips:[...shot('a',0,0),...shot('b',1,.04),...shot('c',2,3)],
    media:[{id:'synthetic',kind:'video',duration:10}],markers:[{t:1}],comps:[]};
  const runtime={undo:[],redo:[]};
  const env={project,runtime,crypto,MontClipEvents:Events,pruneSelection(){},scheduleSave(){},renderInspector(){},
    toast(){},uiText:k=>k,SeqLib:{others:()=>[],activeId:()=> 'main',find:()=>null},seqRoot:()=>project,
    reloadMediaSource(){},renderBin(){},scheduleOfflineCheck(){}};
  const start=SRC.indexOf('function undoSnapshot()'),end=SRC.indexOf('function defaultTrackFor(',start);
  a.ok(start>=0&&end>start);
  const undo=new Function(...Object.keys(env),SRC.slice(start,end)+
    '; return {undoSnapshot,pushUndo,undo,redo,eventLog};')(...Object.values(env));
  const byId=id=>project.clips.find(c=>c.id===id);
  // Test driver models the existing caller-owned edit/snapshot boundary; it is
  // not evidence that a UI button invokes this transaction or saves a revision.
  function apply(method,id,side,delta) {
    const before=undo.undoSnapshot();
    const actual=Edit.forDoc(project)[method](byId(id),side,delta);
    if(typeof actual==='number'&&actual!==0) undo.pushUndo(before,{args:{method,id,side,delta,actual}});
    return actual;
  }
  return {project,runtime,byId,apply,...undo};
}
const near=(actual,expected)=>a.ok(Math.abs(actual-expected)<.000051,`${actual} != ${expected}`);

for(const method of ['rippleTrim','rollEdit']) for(const side of ['in','out']) {
  test(`${method} ${side}: one project frame, linked audio, actual undo and redo`,()=>{
    const w=world(),before=w.undoSnapshot();
    near(w.apply(method,'bV1',side,1/w.project.fps),.04);
    const after=w.undoSnapshot();
    a.notEqual(after,before);
    for(const field of ['start','in','duration']) near(w.byId('bV1')[field],w.byId('bA1')[field]);
    if(method==='rollEdit') {
      near(w.byId('cV1').start+w.byId('cV1').duration,3);
      near(w.byId('aV1').start+w.byId('aV1').duration,w.byId('bV1').start);
      near(w.byId('bV1').start+w.byId('bV1').duration,w.byId('cV1').start);
    } else near(w.byId('cV1').start,side==='in'?1.96:2.04);
    a.equal(w.runtime.undo.length,1);
    a.equal(w.eventLog().list().length,1,'one correction event, not one per linked stem');
    w.undo();a.equal(w.undoSnapshot(),before);a.equal(w.runtime.redo.length,1);
    w.redo();a.equal(w.undoSnapshot(),after);a.equal(w.runtime.undo.length,1);
  });
}

for(const method of ['rippleTrim','rollEdit']) for(const lock of ['clip','track','linked']) {
  test(`${method}: ${lock} lock refuses without changing timeline or undo`,()=>{
    const w=world();
    if(lock==='clip')w.byId('bV1').locked=true;
    if(lock==='track')w.project.lockedTracks=['A1'];
    if(lock==='linked')w.byId('bA1').locked=true;
    const before=JSON.stringify(w.project);
    a.equal(w.apply(method,'bV1','out',.04),Edit.TRIM_LOCKED);
    a.equal(JSON.stringify(w.project),before);
    a.deepEqual(w.runtime.undo,[]);a.deepEqual(w.runtime.redo,[]);
    a.equal(w.eventLog().list().length,0);
  });
}

test('source start / zero delta cannot create a correction or consume redo',()=>{
  const w=world();w.apply('rollEdit','bV1','out',.04);w.undo();
  const before=w.undoSnapshot(),redo=w.runtime.redo.slice();
  a.equal(w.apply('rippleTrim','aV1','in',-.04),0);
  a.equal(w.apply('rollEdit','bV1','out',0),0);
  a.equal(w.undoSnapshot(),before);a.deepEqual(w.runtime.undo,[]);a.deepEqual(w.runtime.redo,redo);
});

test('insufficient preroll clamps: current engine does not promise a complete frame',()=>{
  const w=world();w.byId('bV1').in=.01;w.byId('bA1').in=.01;
  near(w.apply('rollEdit','bV1','in',-.04),-.01);
  near(w.byId('bV1').in,0);near(w.byId('bV1').start,.99);
  // Characterization: the future exact-one-frame wrapper must reject a candidate
  // like this, rather than count a partial move as a successful whole frame.
});

for(const [label,pts,expected] of [
  ['CFR 30 fps',[0,1/30,2/30,3/30,.133333,.166667],[1,2,3]],
  ['VFR',[0,.025,.09,.14,.2],[1,1,2]],
]) test(`${label} metadata: project frame is not a source-frame ordinal`,()=>{
  const samples=pts.map(pts=>({pts})),order=MP4.presentationOrder(samples),w=world();
  const indices=[];
  for(let n=0;n<3;n++) {
    if(n)w.apply('rippleTrim','bV1','in',1/w.project.fps);
    const c=w.byId('bV1');
    indices.push(MP4.frameAt(samples,order,c.in));
  }
  a.deepEqual(indices,expected);
  near(w.byId('bV1').in,.12);
  if(label==='VFR')a.equal(indices[0],indices[1],'project frame advanced but source frame did not');
});

let canDecode=true;
try { for(const tool of ['ffmpeg','ffprobe'])execFileSync(ffPath.path(tool),['-version'],{stdio:'ignore'}); }
catch { canDecode=false; }
for(const vfr of [false,true])test(`generated ${vfr?'VFR':'CFR'}: decoded timestamps survive trim/undo`,{skip:!canDecode},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-cut-frame-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'synthetic.mp4');
  execFileSync(ffPath.path('ffmpeg'),['-v','error','-f','lavfi','-i','testsrc2=size=64x48:rate=25:duration=5',
    ...(vfr?['-vf',"select='eq(n,0)+eq(n,1)+eq(n,4)+eq(n,5)+gte(n,9)'"]:[]),
    '-fps_mode','vfr','-c:v','mpeg4','-bf','0','-an',file],{stdio:'pipe'});
  const probe=JSON.parse(execFileSync(ffPath.path('ffprobe'),['-v','error','-select_streams','v:0',
    '-show_frames','-show_streams','-show_entries','frame=pts,pts_time:stream=time_base,duration',
    '-of','json',file],{encoding:'utf8'}));
  const samples=probe.frames.map(f=>({pts:Number(f.pts_time)})),order=MP4.presentationOrder(samples);
  a.ok(samples.length>100);near(samples[0].pts,0);
  const widths=samples.slice(1).map((s,i)=>Math.round((s.pts-samples[i].pts)*1e6));
  a.equal(new Set(widths).size>1,vfr,'measured intervals, not filename or avg fps, establish VFR');
  const w=world();w.project.media[0].duration=Number(probe.streams[0].duration);
  const before=w.undoSnapshot(),initial=MP4.frameAt(samples,order,w.byId('bV1').in);
  near(w.apply('rippleTrim','bV1','in',.04),.04);
  const next=MP4.frameAt(samples,order,w.byId('bV1').in);
  a.equal(next,vfr?initial:initial+1);
  w.undo();a.equal(w.undoSnapshot(),before);
  t.diagnostic(JSON.stringify({fixture:vfr?'VFR':'CFR',source:'program-generated testsrc2; ffprobe decoded frames',
    sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    timeBase:probe.streams[0].time_base,frameCount:samples.length,
    firstFrames:probe.frames.slice(0,12).map((f,index)=>({index,pts:f.pts,time:f.pts_time})),
    sourceIndices:[initial,next],projectFrameSeconds:.04,uiVerified:false,exportVerified:false}));
});
