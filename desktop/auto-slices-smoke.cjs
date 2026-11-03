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
// #70 is here: an empty folder for the speech engine and models, so the app starts with transcription not installed
const asrEmpty=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'montclip-noasr-'));process.env.MONTCLIP_ASR_DIR=asrEmpty;
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
  // v9 / Deja: below the song gate the first screen promises parts that may be singing, never songs one by one
  const gated=await read(`(()=>{document.querySelector('[data-as-act=kind][data-as-v=sing]').click();const d=document.querySelector('dialog.auto-slices');d.querySelector('details.as-more').open=true;
    const r={kind:d.querySelector('[data-as-kind-hint]').textContent,len:d.querySelector('.as-opt:nth-of-type(2) p.as-small').textContent,step:autoRunHtml().includes('找哪几段可能在唱歌'),
      text:d.innerText};document.querySelector('[data-as-act=kind][data-as-v=auto]').click();return r;})()`);
  report.gated={kind:gated.kind,len:gated.len,step:gated.step};
  assert.equal(gated.kind,'会找可能在唱歌的段落，每段单独出一条。');assert.equal(gated.len,'可能在唱歌的段落，每段出一条。');assert.equal(gated.step,true);
  assert.ok(!/一首歌|每首歌|第\s*\d+\s*首/.test(gated.text),'no promise of songs one by one');
  // JJ's re-review: every kind × every length, 更多设置 open — no 首歌 / 整首 before the gate; this recording has no
  // danmaku, so no hint mentions it
  const every=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),out=[];
    for(const k of MontClipAutoSlices.KINDS)for(const l of MontClipAutoSlices.LENS){document.querySelector('[data-as-act=kind][data-as-v='+k+']').click();document.querySelector('[data-as-act=len][data-as-v='+l+']').click();
      d.querySelector('details.as-more').open=true;out.push({k,l,hint:d.querySelector('[data-as-kind-hint]').textContent,text:d.innerText});}
    document.querySelector('[data-as-act=kind][data-as-v=auto]').click();document.querySelector('[data-as-act=len][data-as-v=song]').click();return out;})()`);
  for(const e of every){assert.ok(!/首歌|整首|第\s*\d+\s*首/.test(e.text),e.k+'/'+e.l+': '+e.text.match(/.{0,20}(首歌|整首).{0,20}/)?.[0]);
    if(['chat','game','watch'].includes(e.k))assert.ok(!/弹幕/.test(e.hint),e.k+': '+e.hint);}
  report.jj2={combos:every.length,hints:Object.fromEntries(every.filter(e=>e.l==='song').map(e=>[e.k,e.hint])),lenSong:every.find(e=>e.l==='song').text.includes('唱歌的段落整段出'),hook:every[0].text.includes('只要最好听的一部分（约 45 秒）')};
  assert.equal(report.jj2.lenSong,true);assert.equal(report.jj2.hook,true);
  // busy while exporting: its own sentence, the dialog stays shut
  const busy=await read(`(()=>{document.querySelector('dialog.auto-slices').close();state.exporting=true;document.getElementById('btnAutoSlices').click();
    const r={toast:document.querySelector('#toast span')?.textContent||document.getElementById('toast').textContent,open:!!document.querySelector('dialog.auto-slices[open]')};state.exporting=false;
    document.getElementById('btnAutoSlices').click();return r;})()`);
  report.jj2.busy=busy;assert.deepEqual(busy,{toast:'正在导出，等导出完再点这里。',open:false});
  // inside a precomposed clip: its own sentence (state.compCtx set only for this click)
  const comp=await read(`(()=>{document.querySelector('dialog.auto-slices').close();const t=document.getElementById('toast');t.textContent='';const keep=state.compCtx;state.compCtx={compId:'smoke'};
    document.getElementById('btnAutoSlices').click();state.compCtx=keep;return{toast:t.querySelector('span')?.textContent||t.textContent,open:!!document.querySelector('dialog.auto-slices[open]')};})()`);
  report.jj2.comp=comp;assert.deepEqual(comp,{toast:'你现在在合成片段里面。点时间线上方最左边的主序列名字，回到主序列再点这里。',open:false});
  // mid-drag: no message; the click opens the dialog once the drag ends
  const drag=await read(`(async()=>{const t=document.getElementById('toast');t.textContent='';state.gesture=true;document.getElementById('btnAutoSlices').click();
    await new Promise(r=>setTimeout(r,400));const during={toast:t.textContent,open:!!document.querySelector('dialog.auto-slices[open]')};state.gesture=false;
    await new Promise(r=>setTimeout(r,400));return{during,after:{toast:t.textContent,open:!!document.querySelector('dialog.auto-slices[open]')}};})()`);
  report.jj2.drag=drag;assert.deepEqual(drag,{during:{toast:'',open:false},after:{toast:'',open:true}});
  // v10: 更多设置 › 字幕 shows the state only; without the on-device model: 还没装听写, and step 2 says it is skipped
  const subs=await read(`(()=>{const d=document.querySelector('dialog.auto-slices');d.querySelector('details.as-more').open=true;return{label:d.querySelector('[data-as-subs-label]').textContent,hint:d.querySelector('[data-as-subs-hint]').textContent,go:!!d.querySelector('[data-as-act=sub-go]'),checked:d.querySelector('[data-as-subs]').checked,step:autoRunHtml().includes('听写成文字：这台电脑还没装听写，先跳过，不影响找高光')};})()`);
  // 〔去装〕 opens #70's setup page, so it is there exactly when that page is
  const canInstall=await read(`typeof openAsrSetup==='function'`);
  report.subs=subs;assert.deepEqual(subs,{label:'加字幕（还没装听写）',hint:'找高光照样能用，只是这次不出字幕。',go:canInstall,checked:true,step:true});
  // started, then the dialog closed: the search goes on, and the top-bar button says it is done
  await read(`document.querySelector('[data-as-act=go]').click();AUTO.el.close();true`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  report.doneButton=await read(`document.getElementById('btnAutoSlices').textContent`);assert.equal(report.doneButton,'✨ 自动出切片 · 找完了');
  await read(`document.getElementById('btnAutoSlices').click();true`);
  assert.equal(await read(`document.getElementById('btnAutoSlices').textContent`),'✨ 自动出切片');
  const rv=await read(`(()=>{const st=autoState();return{cards:st.clips.map(c=>({kind:c.kind,s:c.s,e:c.e,on:c.on,levels:[MontClipAutoSlices.edgeLevel(c,'s'),MontClipAutoSlices.edgeLevel(c,'e')]})),
    labels:[...document.querySelectorAll('[data-as-level]')].map(e=>e.textContent),hints:[...document.querySelectorAll('[data-as-hint]')].map(e=>e.className+':'+e.textContent),tips:[...document.querySelectorAll('[data-as-level]')].map(e=>e.title),
    head:document.querySelector('.auto-slices h1').textContent,place:document.querySelector('[data-as-act=place]').textContent,exp:document.querySelector('[data-as-act=export]').textContent};})()`);
  report.review=rv;
  const songs=rv.cards.filter(c=>c.kind==='song');
  // v8 (frozen, JJ-approved): a level beside every start and end; nothing was guessed in these two, so 比较可能; JJ's v11
  // visual review: the hint is no longer written under the strip, it is the tag's tooltip
  assert.equal(songs.length,2,'two parts that may be singing');assert.ok(songs.every(c=>c.levels.every(l=>l==='likely')),JSON.stringify(songs));
  assert.deepEqual(rv.labels,['比较可能','比较可能','比较可能','比较可能']);
  assert.equal(rv.hints.length,0,'nothing written under the strips');
  assert.ok(rv.tips.length===4&&rv.tips.every(h=>/^(开头|结尾)比较可能在这里，还是点「▶ 听(开头|结尾)」听一下再定。$/.test(h)),rv.tips.join('|'));
  // Deja over the frozen design: below the naming gate no 第 n 首 anywhere; song cards 「{time} 那段 · 可能在唱歌」
  const naming=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),t=d.innerText+[...d.querySelectorAll('input[type=text]')].map(i=>i.value).join(' ');
    return{noNth:!/第\\s*\\d+\\s*首|一首歌|每首歌/.test(t),maybe:(t.match(/可能在唱歌/g)||[]).length,
    lyrics:[...d.querySelectorAll('.as-lyrics')].map(e=>e.textContent.replace(/\\s+/g,' ').trim()),trusted:MontClipAutoSlices.songsTrusted()};})()`);
  report.naming=naming;assert.equal(naming.trusted,false);assert.equal(naming.noNth,true,'no 第 n 首 below the gate');assert.equal(naming.maybe,2);
  assert.ok(naming.lyrics.every(x=>x==='如果这段是唱歌，可以按歌词校准字幕'),naming.lyrics.join('|'));
  // moved: 你调过 (grey) and no tooltip; undone: its own level and tooltip again
  const moved=await read(`(()=>{const card=document.querySelector('[data-as-card]'),id=card.dataset.asCard;card.querySelector('[data-as-act=nudge][data-as-w=s][data-as-d="-1"]').click();
    const el=()=>document.querySelector('[data-as-card="'+id+'"] [data-as-edge=s]');const a={label:el().querySelector('[data-as-level]').textContent,hint:!!el().querySelector('[data-as-level]').title};
    autoUndo();const b={label:el().querySelector('[data-as-level]').textContent,hint:!!el().querySelector('[data-as-level]').title};return{a,b};})()`);
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
    document.getElementById('btnAutoSlices').click();autoRender('review');document.querySelector('[data-as-act=export]').click();const nosub=document.querySelector('.as-ex').textContent.includes('这次没有字幕：这台电脑还没装听写。成片照样能导出。要字幕的话，到「设置 › 听写」装上（要联网下载一次，约 230 MB），再回来导出。');if(!nosub)throw Error('NOSUB');document.querySelector('[data-as-act=ex-go]').click();
    const end=Date.now()+240000;while(Date.now()<end){const items=(st.exportIds||[]).map(id=>exportQueue.find(q=>q.id===id));if(items.length&&items.every(q=>q&&(q.status==='done'||q.status==='failed')))break;await new Promise(r=>setTimeout(r,300));}
    await new Promise(r=>setTimeout(r,800));const items=st.exportIds.map(id=>exportQueue.find(q=>q.id===id));
    return{items:items.map(q=>({name:q.name,status:q.status,error:q.error||null,src:!!q.src})),title:document.querySelector('.auto-slices h1').textContent,step:st.step};})()`);
  report.export=ex;
  assert.equal(ex.items.length,1);assert.equal(ex.items[0].status,'done',JSON.stringify(ex.items[0]));assert.ok(/^01 \d+：\d\d 那段$/.test(ex.items[0].name),'named by its time: '+ex.items[0].name);
  assert.equal(ex.title,'导出好了，1 条');
  // v10, the model installed (#70's asrReady stands in here) and a transcript of the recording: the song card says how many
  // sentences; placing adds captions over the placed slices only, in the same undo step
  const words=[];for(let t=0;t<478;t+=0.5){const ch='大家好今天一起唱歌'[Math.round(t*2)%9];words.push([ch+(Math.round(t*2)%9===8?'。':''),t,t+0.4]);}
  const local=await read(`(async()=>{window.asrReady=()=>true;if(typeof asrState==='object'&&asrState)asrState.status={engine:{ready:true},vad:{ready:true},asr:{ready:true},punct:{ready:false}};const m=project.media.find(x=>x.id==='m_rec');
    await fetch('/api/transcript?src='+encodeURIComponent(m.src),{method:'POST',body:JSON.stringify({src:m.src,model:'paraformer-zh',language:'zh',duration:480,words:${JSON.stringify(words)}})});
    await loadTranscript(m.src,true);const st=autoState();st.subs=true;const r=MontClipAutoSlices.build({recordings:st.recs,kind:'sing',count:5,len:'song'});st.clips=r.clips.map((c,i)=>({...c,on:i===0}));
    document.getElementById('btnAutoSlices').click();autoRender('review');const line=document.querySelector('[data-as-sub-line]');
    const capsBefore=project.clips.filter(FableCutCaptions.isCaption).length,before=JSON.stringify(project.clips),depth=runtime.undo.length;
    document.querySelector('[data-as-act=place]').click();const on=st.clips.filter(c=>c.on),at0=Math.max(...JSON.parse(before).map(c=>c.start+c.duration)),len=on.reduce((n,c)=>n+c.e-c.s,0);
    const caps=project.clips.filter(FableCutCaptions.isCaption);const inside=caps.every(c=>c.start>=at0-1e-6&&c.start+c.duration<=at0+len+0.5);
    const r2={line:line&&line.title.split('\n')[0],caps:caps.length-capsBefore,inside,undo:runtime.undo.length-depth};undo();r2.back=JSON.stringify(project.clips)===before;delete window.asrReady;return r2;})()`);
  report.local=local;assert.ok(/^字幕：[0-9]+ 句，是听写出来的，唱歌部分可能有错字$/.test(local.line),local.line);
  assert.ok(local.caps>0,'captions placed');assert.equal(local.inside,true,'only over the placed slices');assert.equal(local.undo,1,'the same undo step');assert.equal(local.back,true);
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{require('node:fs').rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'AUTO_SLICES_PASS':'AUTO_SLICES_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
