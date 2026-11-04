'use strict';
// P5 in the real editor (frozen design v10 ④, Deja 11-03): caption size and position in one go, from both entries.
// Fresh profile, hidden offscreen window, synthetic captions only (no media). For a landscape (1920×1080) and a
// portrait (1080×1920) project: five captions, one with its own size, one with its own position and one whose size is
// keyframed (skipped by a size change, Deja #81), so the buttons
// first show nothing and say the sizes / positions differ. 〔字幕大小〕 beside the style menu works on all of them,
// the Inspector's top on the selected ones. Each click is one undo step; undoing compares every clip with what it was.
//   electron desktop/caption-quick-smoke.cjs --montclip-smoke --user-data-dir=<fresh dir>
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');

const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 const report={};let ok=false;
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`updateMontClipView({language:'zh-CN'});true`);
  for(const [template,W,H] of [['landscape-1080',1920,1080],['vertical-1080',1080,1920]]){
   const r=report[template]={};
   await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'字幕大小 smoke ${template}',template:'${template}',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
   assert.deepEqual(await read(`[project.width,project.height]`),[W,H]);
   // five synthetic captions; c1 has its own size, c3 its own position
   await read(`(async()=>{const doc=projectJSON();doc.clips=[0,1,2,3,4].map(i=>MontClipCaptions.clip({start:i*2,end:i*2+1.5,text:'合成字幕 '+i},{style:'subtitle',width:${W},height:${H},track:'V2',id:'cap'+i}));
     doc.clips[1].props.fontSize=80;doc.clips[3].props.y=-100;doc.clips[4].keyframes={fontSize:[{t:0,v:30},{t:1,v:60}]};
     if(${H}>${W})doc.clips[2].keyframes={fontSize:[{t:0,v:30},{t:1,v:60}]};applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
   const snapClips=`JSON.stringify(project.clips.map(c=>({id:c.id,props:c.props,start:c.start,duration:c.duration,track:c.track})))`;
   const before=await read(snapClips),depth0=await read('runtime.undo.length');
   // 1. 〔字幕大小〕 beside the style menu: all five
   await read(`setSideTab('transcript');renderTranscript(true);true`);await wait();
   const entry=await read(`(()=>{const b=document.querySelector('[data-tr-cap-quick]');const prev=b&&b.previousElementSibling;return b&&{text:b.textContent,hidden:b.hidden,afterStyle:!!(prev&&prev.matches('[data-tr-cap-style]'))};})()`);
   assert.deepEqual(entry,{text:'字幕大小和位置',hidden:false,afterStyle:true},JSON.stringify(entry));
   await read(`document.querySelector('[data-tr-cap-quick]').click();true`);await wait();
   const panel=`(()=>{const p=document.querySelector('.cq-dialog[open] [data-cq-panel]')||document.querySelector('#inspector [data-cq-panel]');if(!p)return null;
     return{who:p.querySelector('[data-cq-who]').textContent,on:[...p.querySelectorAll('[data-cq-v].on')].map(b=>b.dataset.cqV),mixed:[...p.querySelectorAll('[data-cq-mixed]')].map(m=>m.textContent),desc:p.querySelector('[data-cq-desc]').textContent,text:p.textContent};})()`;
   const p0=await read(panel);r.allBefore=p0;
   assert.equal(p0.who,'全部 5 条字幕');assert.deepEqual(p0.on,[],'nothing on while they differ');
   assert.deepEqual(p0.mixed,['现在大小不一样，点一下就统一','现在位置不一样，点一下就统一']);
   assert.equal(p0.desc,'一次改掉这 5 条字幕的字号和位置，字幕的字不动。单独调过的也会改成一样（带动画的除外），改完可以撤销。');
   assert.ok(!/px/i.test(p0.text),'no px');
   const sz=await read(`MontClipCaptionQuick.sizes(${W},${H})`),ps=await read(`MontClipCaptionQuick.positions(${W},${H})`);
   await read(`document.querySelector('.cq-dialog[open] [data-cq-k="size"][data-cq-v="big"]').click();true`);await wait();
   r.big=await read(`({sizes:project.clips.map(c=>c.props.fontSize),toast:document.getElementById('toast').querySelector('span')?.textContent,undoButton:document.getElementById('toast').querySelector('.toast-action')?.textContent,undo:runtime.undo.length,on:[...document.querySelectorAll('.cq-dialog[open] [data-cq-v].on')].map(b=>b.dataset.cqV)})`);
   // cap4's fontSize is keyed (Deja, #81): it keeps its size, still counts in 全部 5 条, and the toast says so
   // the keyed ones keep their size; the toast says one or several in JJ's words, with 〔撤销〕
   const keyed=H>W?[2,4]:[4],cb=JSON.parse(before);
   assert.deepEqual(r.big.sizes,cb.map((c,i)=>keyed.includes(i)?c.props.fontSize:sz.big),'animated captions unchanged');
   assert.equal(r.big.toast,'已把 '+(5-keyed.length)+' 条字幕的字号改成「大」。'+(keyed.length===1?'有 1 条字幕带动画（字会变大变小或移动），这次没改它。要改的话，选中它，到「属性面板」里调。':'有 2 条字幕带动画（字会变大变小或移动），这次没改它们。要改的话，选中它们，到「属性面板」里一条条调。'));
   assert.equal(r.big.undoButton,'撤销');assert.equal(r.big.undo,depth0+1,'one undo step');assert.deepEqual(r.big.on,['big']);
   await read(`document.querySelector('.cq-dialog[open] [data-cq-k="pos"][data-cq-v="top"]').click();true`);await wait();
   r.top=await read(`({ys:project.clips.map(c=>c.props.y),toast:document.getElementById('toast').querySelector('span')?.textContent,undo:runtime.undo.length})`);
   assert.deepEqual(r.top.ys,Array(5).fill(ps.top));assert.equal(r.top.toast,'已把 5 条字幕移到画面上面。');assert.equal(r.top.undo,depth0+2);
   // the words are not generated again: the texts and timings are the same clips
   assert.deepEqual(await read(`project.clips.map(c=>[c.id,c.props.text,c.start,c.duration])`),JSON.parse(before).map(c=>[c.id,c.props.text,c.start,c.duration]));
   await read(`document.querySelector('.cq-dialog[open] [data-cq-close]').click();true`);await wait();
   // undo twice: every clip as it was, prop by prop
   await read(`undo();undo();true`);await wait();
   r.undone=(await read(snapClips))===before;assert.equal(r.undone,true,'undo restores every clip exactly');
   // 2. the Inspector's top: the two selected captions only
   await read(`setSelection(['cap0','cap2']);setSideTab('inspector');renderInspector();true`);await wait();
   const p1=await read(panel);r.selected=p1;
   assert.equal(p1.who,'选中的 2 条字幕');assert.deepEqual(p1.mixed,[],'two captions at the same size and place: nothing mixed');
   assert.equal(await read(`document.querySelector('#inspector [data-cq-panel]')===document.querySelector('#inspector').querySelector('[data-cq-panel]')&&!!document.querySelector('#inspector').firstElementChild.matches('[data-cq-panel]')`),true,'at the very top of the Inspector');
   await read(`document.querySelector('#inspector [data-cq-k="size"][data-cq-v="small"]').click();true`);await wait();
   r.small=await read(`project.clips.map(c=>c.props.fontSize)`);
   const b0=JSON.parse(before).map(c=>c.props.fontSize);
   // only the selected ones; in portrait cap2's size is keyed, so it keeps it
   assert.deepEqual(r.small,b0.map((f,i)=>(i===0||i===2)&&!(i===2&&H>W)?sz.small:f),'only the selected ones');
   await read(`undo();true`);await wait();
   assert.equal(await read(snapClips),before,'undo restores the selected ones too');
   r.sizes=sz;r.positions=ps;
  }
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'CAPTION_QUICK_PASS':'CAPTION_QUICK_FAIL',report);process.exitCode=ok?0:1;setTimeout(()=>app.exit(ok?0:1),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
