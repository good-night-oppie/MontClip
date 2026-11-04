'use strict';
// The 自动出切片 card's 〔按歌词校准字幕〕 in the real page (Deja 2026-11-03; docs/decisions/2026-11-03-card-lyrics.md).
// Fresh profile, hidden offscreen window, synthetic sound (test/songs-synth.js: held tones are singing) and a synthetic
// transcript (no speech engine runs; the page is told the on-device model is there, so subtitles are made). Checks:
//  - the search's two song cards show the button; a card with no transcript words in its part shows none;
//  - the dialog aligns the card's own words only; applying keeps the lines on the card, the button then says
//    「再对一遍歌词（已改 N 句）」 (placeholder key), and the timeline does not change by a single character;
//  - 〔撤销〕 (the dialog's undo) takes it back: no lines on the card, the button as before; applied again;
//  - 〔放到时间线上〕: that card's captions are its lyric lines, inside its clip; the other card's captions are the
//    transcript's, as before.
//   electron desktop/card-lyrics-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → CARD_LYRICS_PASS / CARD_LYRICS_FAIL
//   (MONTCLIP_SHOTS_OUT=<absolute folder> saves pictures of its own window)
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shots=process.env.MONTCLIP_SHOTS_OUT||null;if(shots&&!path.isAbsolute(shots))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const {wav}=require('../test/songs-synth');
const V=require('../ui-preferences'),zh=(k,v)=>V.t('zh-CN','own.'+k,v);
const asrEmpty=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'montclip-noasr-'));process.env.MONTCLIP_ASR_DIR=asrEmpty;
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]];
// what the transcript heard (recording seconds): talking, the first song (misheard), the second song (misheard)
const chars=(t,at,step=0.4)=>[...t].map((w,i)=>[w,+(at+i*step).toFixed(2),+(at+i*step+0.35).toFixed(2)]);
const HEARD=[...chars('大家好',10),...chars('天控好蓝',100),...chars('我想飞香',104),...chars('月量弯弯',300)];
const LYRICS='天空好蓝\n我想飞翔';
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 const until=async(expr,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await read(expr))return true;await wait(100);}throw Error('TIMEOUT '+expr);};
 const shot=async(name)=>{if(!shots)return;await wait(300);fs.writeFileSync(path.join(shots,name),(await win.webContents.capturePage()).toPNG());};
 try{
  await until(`state.connected`,15000);
  win.setContentSize(1280,800);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'卡片歌词 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');updateMontClipView({language:'zh-CN'});})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=rec.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const src=${JSON.stringify(up.src)};
   await fetch('/api/transcript?src='+encodeURIComponent(src),{method:'POST',body:JSON.stringify({src,model:'paraformer-zh',language:'zh',duration:480,words:${JSON.stringify(HEARD)}})});
   await loadTranscript(src,true);
   // the on-device model "installed", so the cards get subtitles when placed (no engine runs: the transcript is there)
   asrState.status={engine:{ready:true},vad:{ready:true},asr:{ready:true}};
   const doc=projectJSON();doc.media.push({id:'m_rec',name:'11 月 3 日 合成录像',kind:'audio',src,duration:480});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');return true;})()`);
  // something on the timeline with an undo step: a Ctrl+Z that reached the timeline behind the dialog would take it back
  await read(`(()=>{pushUndo(undoSnapshot());project.clips.push({id:'c_tl',kind:'text',mediaId:null,track:'V2',start:0,in:0,duration:2,props:{text:'时间线上的'}});scheduleSave();return true;})()`);
  await read(`document.getElementById('btnAutoSlices').click();true`);
  await until(`!!document.querySelector('dialog.auto-slices[open] [data-as-act=go]')`);
  await read(`document.querySelector('[data-as-act=go]').click();true`);
  await until(`autoState().step==='review'&&!autoState().run`,180000);
  await read(`(()=>{const d=document.querySelector('dialog.auto-slices');if(!d.open)document.getElementById('btnAutoSlices').click();autoRender('review');return true;})()`);
  const cards=await read(`autoState().clips.map(c=>({id:c.id,kind:c.kind,s:c.s,e:c.e,button:!!document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]'),text:(document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]')||{}).textContent||null}))`);
  report.cards=cards;
  const songs=cards.filter(c=>c.kind==='song');
  assert.equal(songs.length,2,'two song cards');
  const first=songs.find(c=>c.s<=100&&c.e>=106),second=songs.find(c=>c.s<=300&&c.e>=302);
  assert.ok(first&&second,'each song card covers its song '+JSON.stringify(songs));
  assert.ok(songs.every(c=>c.button&&c.text===zh('as-lyrics')),'both song cards have the button');
  assert.ok(cards.filter(c=>c.kind!=='song').every(c=>!c.button),'no button on the other cards');
  // a song card whose part has no transcript words: none
  const empty=await read(`(()=>{const c=autoClip(${JSON.stringify(second.id)}),keep=[c.s,c.e];c.s=200;c.e=250;autoRender('review');const has=!!document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]');[c.s,c.e]=keep;autoRender('review');return has;})()`);
  assert.equal(empty,false,'no words in its part: no button');
  // 1. the dialog over the first card: its own words only; applied, kept on the card; the timeline the same
  const before=await read(`JSON.stringify(project.clips)`);
  const titleBefore=await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').title`);report.titleBefore=titleBefore;
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS)};d.querySelector('[data-ly-align]').click();return true;})()`);
  const dlg=await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');return{was:[...d.querySelectorAll('.ly-was')].map(e=>e.textContent),now:[...d.querySelectorAll('.ly-now')].map(e=>e.textContent),sure:[...d.querySelectorAll('[data-ly-pick]')].map(b=>b.checked)};})()`);
  report.dialog=dlg;await shot('card-lyrics-dialog.png');
  assert.deepEqual(dlg.now,[zh('ly-now')+'天空好蓝',zh('ly-now')+'我想飞翔']);
  assert.ok(dlg.was.every(w=>!/大家|月量/.test(w)),'only the card\'s own words: '+dlg.was.join('|'));
  assert.deepEqual(dlg.sure,[true,true]);
  await read(`document.querySelector('dialog[data-ly-dialog] [data-ly-apply-all]').click();true`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')`);
  const applied=await read(`(()=>{const c=autoClip(${JSON.stringify(first.id)});return{cues:(c.lyricCues||[]).map(q=>[q.text,q.start,q.end,q.lyrics]),n:c.lyricN,button:document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]').textContent,
    other:document.querySelector('[data-as-card="${second.id}"] [data-as-act=lyrics]').textContent,toast:(document.querySelector('[data-as-toast-msg]')||{}).textContent,clips:JSON.stringify(project.clips)};})()`);
  report.applied={cues:applied.cues,n:applied.n,button:applied.button,other:applied.other,toast:applied.toast};
  await shot('card-lyrics-applied.png');
  assert.deepEqual(applied.cues.map(q=>q[0]),['天空好蓝','我想飞翔']);assert.ok(applied.cues.every(q=>q[3]&&q[1]>=first.s&&q[2]<=first.e));
  assert.equal(applied.button,zh('as-lyrics-again',{n:2}));assert.equal(applied.other,zh('as-lyrics'),'the other card as it was');
  assert.equal(applied.clips,before,'the timeline not changed by a single character');
  assert.equal(applied.toast,zh('as-lyrics-done',{n:2}),'JJ words: nothing is on the timeline yet');
  // VV on #100 d545221: after applying, the focus is the card's own lyrics button (in the dialog), the card is in view and
  // flashed, and the tooltip says it is calibrated (placeholder key)
  report.afterApply=await read(`(()=>{const d=document.querySelector('dialog.auto-slices'),card=d.querySelector('[data-as-card="${first.id}"]'),b=card.querySelector('[data-as-act=lyrics]'),body=d.querySelector('[data-as-body]');
    const r=card.getBoundingClientRect(),q=body.getBoundingClientRect();return{focus:document.activeElement===b,inView:r.top<q.bottom&&r.bottom>q.top,title:b.title};})()`);
  // JJ's words, as written (Deja, on #100); nothing of the transcript line left
  assert.deepEqual(report.afterApply,{focus:true,inView:true,title:"字幕已按歌词改过 2 句。再点一次会带上你上次贴的歌词，可以再对一遍；想回到改之前，撤销一步就行。"});
  assert.ok(!/听写出来|可能有错字/.test(report.afterApply.title));
  // 2. the dialog's undo takes it back; then applied again
  // its 〔撤销〕 under #92's rule: shown past the old 5 s, held for 9 s while it has the focus, then it takes the step back
  await wait(6000);
  const held=await read(`(async()=>{const t=document.querySelector('[data-as-toast]'),b=t.querySelector('[data-as-toast-undo]');const at6=!t.hidden&&!b.hidden;b.focus();await new Promise(r=>setTimeout(r,9000));return{at6,held:!t.hidden};})()`);
  report.held=held;assert.deepEqual(held,{at6:true,held:true},'〔撤销〕 stays 8 s and while it has the focus');
  const undone=await read(`(()=>{document.querySelector('[data-as-toast] [data-as-toast-undo]').click();const c=autoClip(${JSON.stringify(first.id)});return{cues:c.lyricCues||null,button:document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]').textContent};})()`);
  report.undone=undone;assert.deepEqual(undone,{cues:null,button:zh('as-lyrics')});
  // undone: the tooltip as it was before calibrating
  assert.equal(await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').title`),titleBefore,'the tooltip back to before');
  assert.equal(await read(`document.querySelector('dialog.auto-slices').contains(document.activeElement)`),true,'the focus stays in the dialog after 〔撤销〕');
  // applied again, then a real Ctrl+Z: back to before calibrating, the timeline not touched, the focus in the dialog
  const tl=await read(`JSON.stringify(project.clips)`);
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS)};d.querySelector('[data-ly-align]').click();d.querySelector('[data-ly-apply-all]').click();return true;})()`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')&&!!autoClip(${JSON.stringify(first.id)}).lyricCues`);
  for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Z',modifiers:['control']});await wait(400);
  report.ctrlZ=await read(`(()=>{const c=autoClip(${JSON.stringify(first.id)});return{cues:c.lyricCues||null,inDialog:document.querySelector('dialog.auto-slices').contains(document.activeElement)};})()`);
  assert.deepEqual(report.ctrlZ,{cues:null,inDialog:true},'a real Ctrl+Z undoes the card, never the timeline');
  assert.equal(await read(`JSON.stringify(project.clips)`),tl);
  // VV on #100 aeb81e7: undone, the lyrics pasted stay on the card (only the calibration is undone), as its tooltip says
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  report.afterUndoText=await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]'),v=d.querySelector('[data-ly-text]').value;d.close();return v;})()`);
  assert.equal(report.afterUndoText,LYRICS,'undone: the lyrics pasted last time are still there');
  await until(`!document.querySelector('dialog[data-ly-dialog]')`);
  // 〔再对一遍歌词〕 opens with the lyrics pasted last time (this window only)
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS)};d.querySelector('[data-ly-align]').click();d.querySelector('[data-ly-apply-all]').click();return true;})()`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')&&!!autoClip(${JSON.stringify(first.id)}).lyricCues`);
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  report.again=await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]'),v=d.querySelector('[data-ly-text]').value;d.close();return v;})()`);
  assert.equal(report.again,LYRICS,'the lyrics pasted last time');
  await until(`!document.querySelector('dialog[data-ly-dialog]')`);
  // R02c (Deja, 2026-11-04; VV on #105 74d8486): calibrated twice with different lyrics, undone twice, reopened → the second paste
  // (the card was calibrated once more just above: that is the first round here)
  const LYRICS2='天空好蓝。\n我想飞翔！';
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS2)};d.querySelector('[data-ly-align]').click();d.querySelector('[data-ly-apply-all]').click();return true;})()`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')&&!!autoClip(${JSON.stringify(first.id)}).lyricCues`);
  await wait(300);
  for(let i=0;i<2;i++){for(const type of ['keyDown','keyUp'])win.webContents.sendInputEvent({type,keyCode:'Z',modifiers:['control']});await wait(400);}
  report.twice=await read(`(()=>{const c=autoClip(${JSON.stringify(first.id)});return{cues:c.lyricCues||null,button:document.querySelector('[data-as-card="'+c.id+'"] [data-as-act=lyrics]').textContent};})()`);
  assert.deepEqual(report.twice,{cues:null,button:zh('as-lyrics')},'both calibrations undone');
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  report.twiceText=await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]'),v=d.querySelector('[data-ly-text]').value;d.close();return v;})()`);
  assert.equal(report.twiceText,LYRICS2,'undone twice: the lyrics pasted the second time');
  await until(`!document.querySelector('dialog[data-ly-dialog]')`);
  // the lyrics are still in this window only: not in the project file
  assert.ok(!(await read(`JSON.stringify(projectJSON())`)).includes('我想飞翔！'),'not in the project file');
  // VV on #100 aeb81e7: at 630×460 the toast after applying does not lie over the card's own lyrics button
  win.setMinimumSize(320,320);win.setContentSize(630,460);await wait(500);
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS)};d.querySelector('[data-ly-align]').click();d.querySelector('[data-ly-apply-all]').click();return true;})()`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')&&!!autoClip(${JSON.stringify(first.id)}).lyricCues`);
  await wait(300);
  report.narrow=await read(`(()=>{const t=document.querySelector('[data-as-toast]'),b=document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]'),r=t.getBoundingClientRect(),q=b.getBoundingClientRect();
    return{toast:!t.hidden,overlap:!(r.right<=q.left||q.right<=r.left||r.bottom<=q.top||q.bottom<=r.top),buttonSeen:q.height>0&&q.top>=0&&q.bottom<=innerHeight};})()`);
  if(shots)await shot('card-lyrics-630x460.png');
  assert.deepEqual(report.narrow,{toast:true,overlap:false,buttonSeen:true},'630: the toast leaves the card\'s button in sight');
  win.setContentSize(1280,800);await wait(400);
  await read(`document.querySelector('[data-as-card="${first.id}"] [data-as-act=lyrics]').click();true`);
  await until(`!!document.querySelector('dialog[data-ly-dialog][open]')`);
  await read(`(()=>{const d=document.querySelector('dialog[data-ly-dialog]');d.querySelector('[data-ly-text]').value=${JSON.stringify(LYRICS)};d.querySelector('[data-ly-align]').click();d.querySelector('[data-ly-apply-all]').click();return true;})()`);
  await until(`!document.querySelector('dialog[data-ly-dialog]')&&!!autoClip(${JSON.stringify(first.id)}).lyricCues`);
  // 3. placed (both song cards only): the first card's captions are its lines, inside its clip; the second's as heard
  await read(`(()=>{for(const c of autoState().clips)c.on=c.kind==='song';autoRender('review');document.querySelector('[data-as-act=place]').click();return true;})()`);
  const placed=await read(`(()=>{const caps=project.clips.filter(c=>FableCutCaptions.isCaption(c)).map(c=>({text:c.props.text,s:c.start,e:+(c.start+c.duration).toFixed(3)}));
    const parts=project.clips.filter(c=>c.kind==='audio').map(c=>({in:c.in,start:c.start,e:+(c.start+c.duration).toFixed(3)}));return{caps,parts};})()`);
  report.placed=placed;
  const part1=placed.parts.find(p=>Math.abs(p.in-first.s)<1e-6),part2=placed.parts.find(p=>Math.abs(p.in-second.s)<1e-6);
  assert.ok(part1&&part2,'both parts placed');
  const in1=placed.caps.filter(c=>c.s>=part1.start-1e-6&&c.e<=part1.e+1e-6),in2=placed.caps.filter(c=>c.s>=part2.start-1e-6&&c.e<=part2.e+1e-6);
  assert.deepEqual(in1.map(c=>c.text),['天空好蓝','我想飞翔'],'the calibrated card: its lyric lines');
  assert.ok(Math.abs(in1[0].s-(part1.start+(100-first.s)))<0.05,'at the words\' own time');
  assert.equal(in2.map(c=>c.text).join(''),'月量弯弯','the other card: as heard');
  assert.equal(in1.length+in2.length,placed.caps.length,'every caption inside a placed part');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{try{fs.rmSync(asrEmpty,{recursive:true,force:true});}catch{}out(ok?'CARD_LYRICS_PASS':'CARD_LYRICS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
