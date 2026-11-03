'use strict';
// P3 「✨ 自动出切片」 in the desktop editor (Deja 2026-11-03; frozen design v7, v7.5 last). Fresh profile, hidden offscreen
// window, synthetic sound only (test/songs-synth.js: held tones are singing, tone bursts with pauses are talk). Checks,
// through the real server, page and main process:
//  - the top-bar entry opens the dialog; a search over the project's recording ends in the review with two song cards,
//    both 「估的」 at the start and the end; the window is not in front, so the main process is asked for one
//    notification (in a smoke it prints MONTCLIP_NOTIFY instead of showing it);
//  - 〔放到时间线上（N 条）〕 closes the dialog, puts the ticked parts after the end of the timeline, selects the first one
//    on the track it landed on, and says 已把 N 条放到时间线上，可以接着细剪。 with 〔撤销〕; 〔撤销〕 takes the whole batch
//    back in one step: the timeline and the selection are what they were;
//  - with A1 untargeted the first part lands on A2 and A2's clip is selected (never V1 or A1 by name); Ctrl+Z undoes it;
//  - closed and opened again, the review is still there (关掉不会丢);
//  - 〔直接导出这 N 条〕 exports one file per ticked part through the export queue.
//   electron desktop/auto-slices-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → AUTO_SLICES_PASS / AUTO_SLICES_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const {wav}=require('../test/songs-synth');
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]];
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
// the main process prints the notification it would show; collect those lines
const notes=[];{const w=process.stdout.write.bind(process.stdout);process.stdout.write=(s,...r)=>{const m=/^MONTCLIP_NOTIFY (.*)$/m.exec(String(s));if(m)notes.push(JSON.parse(m[1]));return w(s,...r);};}
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 try{
  await until(`state.connected`,15000);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'自动出切片 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  // the recording on A1, as a streamer would have it
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 2 日 合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:480});
   doc.clips.push({id:'c_rec',mediaId:'m_rec',kind:'audio',track:'A1',start:0,in:0,duration:480,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  report.focused=await read(`document.hasFocus()`);
  // 1. the top-bar entry, the search, the review
  await read(`document.getElementById('btnAutoSlices').click();true`);
  report.opened=await read(`!!document.querySelector('dialog.auto-slices[open]')`);assert.ok(report.opened);
  // started, then the dialog closed: the search goes on, and the top-bar button says it is done
  await read(`document.querySelector('[data-as-act=go]').click();AUTO.el.close();true`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  report.doneButton=await read(`document.getElementById('btnAutoSlices').textContent`);assert.equal(report.doneButton,'✨ 自动出切片 · 找完了');
  await read(`document.getElementById('btnAutoSlices').click();true`);
  assert.equal(await read(`document.getElementById('btnAutoSlices').textContent`),'✨ 自动出切片');
  const rv=await read(`(()=>{const st=autoState();return{cards:st.clips.map(c=>({kind:c.kind,s:c.s,e:c.e,on:c.on,levels:[MontClipAutoSlices.edgeLevel(c,'s'),MontClipAutoSlices.edgeLevel(c,'e')]})),
    labels:[...document.querySelectorAll('[data-as-level]')].map(e=>e.textContent),hints:[...document.querySelectorAll('[data-as-hint]')].map(e=>e.className+':'+e.textContent),
    head:document.querySelector('.auto-slices h1').textContent,place:document.querySelector('[data-as-act=place]').textContent,exp:document.querySelector('[data-as-act=export]').textContent};})()`);
  report.review=rv;
  const songs=rv.cards.filter(c=>c.kind==='song');
  // v8 (frozen, JJ-approved): a level beside every start and end; nothing was guessed in these two, so 比较可能 with its grey hint
  assert.equal(songs.length,2,'two parts that may be singing');assert.ok(songs.every(c=>c.levels.every(l=>l==='likely')),JSON.stringify(songs));
  assert.deepEqual(rv.labels,['比较可能','比较可能','比较可能','比较可能']);
  assert.ok(rv.hints.length===4&&rv.hints.every(h=>/^as-likely:(开头|结尾)比较可能在这里，还是点「▶ 听(开头|结尾)」听一下再定。$/.test(h)),rv.hints.join('|'));
  // Deja over the frozen design: below the naming gate no 第 n 首 anywhere; song cards 「{time} 那段 · 可能在唱歌」
  const naming=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),t=d.innerText+[...d.querySelectorAll('input[type=text]')].map(i=>i.value).join(' ');
    return{noNth:!/第\\s*\\d+\\s*首/.test(t),maybe:(t.match(/可能在唱歌/g)||[]).length,
    lyrics:[...d.querySelectorAll('.as-lyrics')].map(e=>e.textContent.replace(/\\s+/g,' ').trim()),trusted:MontClipAutoSlices.songsTrusted()};})()`);
  report.naming=naming;assert.equal(naming.trusted,false);assert.equal(naming.noNth,true,'no 第 n 首 below the gate');assert.equal(naming.maybe,2);
  assert.ok(naming.lyrics.every(x=>x==='按歌词校准字幕 如果这段是唱歌'),naming.lyrics.join('|'));
  // moved: 你调过 (grey) and no hint; undone: its own level and hint again
  const moved=await read(`(()=>{const card=document.querySelector('[data-as-card]'),id=card.dataset.asCard;card.querySelector('[data-as-act=nudge][data-as-w=s][data-as-d="-1"]').click();
    const el=()=>document.querySelector('[data-as-card="'+id+'"] [data-as-edge=s]');const a={label:el().querySelector('[data-as-level]').textContent,hint:!!el().querySelector('[data-as-hint]')};
    autoUndo();const b={label:el().querySelector('[data-as-level]').textContent,hint:!!el().querySelector('[data-as-hint]')};return{a,b};})()`);
  report.moved=moved;assert.deepEqual(moved.a,{label:'你调过',hint:false});assert.deepEqual(moved.b,{label:'比较可能',hint:true});
  const n=rv.cards.filter(c=>c.on).length;
  assert.equal(rv.place,`放到时间线上（${n} 条）`);assert.equal(rv.exp,`直接导出这 ${n} 条`);
  await wait(300);report.notify=notes.slice();assert.equal(notes.length,1,'one notification asked');assert.equal(notes[0].found,rv.cards.length);
  // 2. place: closes, the first part selected on its own track, the toast with 撤销; 撤销 restores timeline and selection
  await read(`selectClip('c_rec');true`);
  const before=await read(`JSON.stringify(project.clips)`),selBefore=await read(`JSON.stringify([...state.selIds])`),undoDepth=await read(`runtime.undo.length`);
  const placed=await read(`(()=>{document.querySelector('[data-as-act=place]').click();const sel=getClip(state.selId);const t=document.getElementById('toast');
    return{open:!!document.querySelector('dialog.auto-slices[open]'),sel:sel&&{track:sel.track,start:sel.start,mediaId:sel.mediaId},added:project.clips.length,
    toast:t.querySelector('span')&&t.querySelector('span').textContent,btn:t.querySelector('button')&&t.querySelector('button').textContent,undo:runtime.undo.length,tab:document.querySelector('[data-side].on')?.dataset.side};})()`);
  report.placed=placed;
  assert.equal(placed.open,false,'the dialog closed');assert.equal(placed.undo,undoDepth+1,'one undo step');
  assert.ok(placed.sel&&placed.sel.mediaId==='m_rec'&&placed.sel.start===480,'the first part selected, after the end of the timeline');
  assert.equal(placed.sel.track,'A1');assert.equal(placed.tab,'inspector');
  assert.equal(placed.toast,`已把 ${n} 条放到时间线上，可以接着细剪。`);assert.equal(placed.btn,'撤销');
  const undone=await read(`(()=>{document.querySelector('#toast .toast-action').click();return{clips:JSON.stringify(project.clips),sel:JSON.stringify([...state.selIds]),undo:runtime.undo.length};})()`);
  report.undone={same:undone.clips===before,sel:undone.sel,undo:undone.undo};
  assert.equal(undone.clips,before,'the timeline is as it was');assert.equal(undone.sel,selBefore,'the selection is as it was');assert.equal(undone.undo,undoDepth);
  // 3. A1 untargeted: the first part lands on A2, A2's clip selected; Ctrl+Z undoes it. Reopened: the review is kept.
  await read(`(()=>{state.untargetedTracks.add('A1');project.untargetedTracks=['A1'];return true;})()`);
  await read(`document.getElementById('btnAutoSlices').click();true`);
  report.kept=await read(`autoState().step==='review'&&document.querySelectorAll('[data-as-card]').length`);assert.ok(report.kept>=2,'closed and opened: the review is still there');
  const a2=await read(`(()=>{document.querySelector('[data-as-act=place]').click();const sel=getClip(state.selId);return sel&&sel.track;})()`);
  report.untargeted=a2;assert.equal(a2,'A2');
  await read(`(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true}));return true;})()`);
  assert.equal(await read(`JSON.stringify(project.clips)`),before,'Ctrl+Z took the batch back');
  await read(`(()=>{state.untargetedTracks.delete('A1');project.untargetedTracks=[];return true;})()`);
  // 调一下 on the second card: placed with the ticked ones, that card's part selected; 撤销 takes them back
  const fine=await read(`(()=>{document.getElementById('btnAutoSlices').click();const cards=[...document.querySelectorAll('[data-as-card]')];const c=autoClip(cards[1].dataset.asCard);
    cards[1].querySelector('[data-as-act=fine]').click();const sel=getClip(state.selId),t=document.getElementById('toast');
    const r={cardIn:c.s,selIn:sel&&sel.in,track:sel&&sel.track,toast:t.querySelector('span')&&t.querySelector('span').textContent};document.querySelector('#toast .toast-action').click();r.back=JSON.stringify(project.clips)===${JSON.stringify(before)};return r;})()`);
  report.fine=fine;assert.equal(fine.selIn,fine.cardIn,'the card it was asked on is the one selected');assert.ok(fine.toast.startsWith('在时间线上选中了「'));assert.equal(fine.back,true);
  // 4. 直接导出: the best 45 s of one song, one file
  const ex=await read(`(async()=>{const st=autoState();st.len='hook';const r=MontClipAutoSlices.build({recordings:st.recs,kind:'sing',count:5,len:'hook'});st.clips=r.clips.map((c,i)=>({...c,on:i===0}));
    document.getElementById('btnAutoSlices').click();autoRender('review');document.querySelector('[data-as-act=export]').click();document.querySelector('[data-as-act=ex-go]').click();
    const end=Date.now()+240000;while(Date.now()<end){const items=(st.exportIds||[]).map(id=>exportQueue.find(q=>q.id===id));if(items.length&&items.every(q=>q&&(q.status==='done'||q.status==='failed')))break;await new Promise(r=>setTimeout(r,300));}
    await new Promise(r=>setTimeout(r,800));const items=st.exportIds.map(id=>exportQueue.find(q=>q.id===id));
    return{items:items.map(q=>({name:q.name,status:q.status,error:q.error||null,src:!!q.src})),title:document.querySelector('.auto-slices h1').textContent,step:st.step};})()`);
  report.export=ex;
  assert.equal(ex.items.length,1);assert.equal(ex.items[0].status,'done',JSON.stringify(ex.items[0]));assert.ok(/^01 \d+：\d\d 那段$/.test(ex.items[0].name),'named by its time: '+ex.items[0].name);
  assert.equal(ex.title,'导出好了，1 条');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'AUTO_SLICES_PASS':'AUTO_SLICES_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
