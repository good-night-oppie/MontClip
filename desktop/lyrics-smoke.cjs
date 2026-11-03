'use strict';
// P6a: correct captions from the lyrics, in the real page. Fresh profile, hidden offscreen window, a synthetic silent WAV
// and a synthetic transcript (no speech engine runs, no network). Checks:
//  - the button sits in the Transcript tab's caption row; with nothing selected and no IN / OUT it says what to do;
//  - pasting the lyrics and 〔对齐〕 shows each line as heard and as it becomes; a line that aligns poorly is
//    「可能不对」 and not ticked; before applying, the project does not change by a single character;
//  - 〔全部应用（可能不对的除外）〕 replaces the song's captions in one undo step, one per lyric line, with the transcript's
//    times; the caption outside the song stays; 〔撤销〕 puts the old captions back;
//  - the project changing while the window is open: nothing applied.
//   electron desktop/lyrics-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → LYRICS_PASS / LYRICS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
// 30 s of silence, 8 kHz mono 16-bit
const wav=()=>{const n=8000*30,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);return b;};
// what the transcript heard: talking, then a song with misheard characters, then talking
const heard=[...'大家好'].map((w,i)=>[w,1+i*0.3,1.25+i*0.3]).concat([...'天空好想夏雨我好想住你个笔'].map((w,i)=>[w,10+i*0.3,10.25+i*0.3]),[...'谢谢大家'].map((w,i)=>[w,20+i*0.3,20.25+i*0.3]));
const LYRICS='天空好想下雨\n我好想住你隔壁\n这一句完全没有唱到';
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=150)=>new Promise(r=>setTimeout(r,ms));
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'歌词校准 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);await wait();
  const b64=wav().toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));return (await fetch('/api/upload?name=song.wav',{method:'POST',body:b})).json();})()`);
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_song',name:'合成录像',kind:'audio',src:${JSON.stringify(up.src)},duration:30});
   doc.clips.push({id:'c_song',mediaId:'m_song',kind:'audio',track:'A1',start:0,in:0,duration:30,props:{}});applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');
   await fetch('/api/transcript?src='+encodeURIComponent(${JSON.stringify(up.src)}),{method:'POST',body:JSON.stringify({src:${JSON.stringify(up.src)},model:'paraformer-zh',language:'zh',duration:30,words:${JSON.stringify(heard)}})});
   await loadTranscript(${JSON.stringify(up.src)},true);updateMontClipView({language:'zh-CN'});setSideTab('transcript');renderTranscript(true);})()`);await wait(400);
  // the captions as the transcript gives them
  await read(`(async()=>{addCaptionsFromTranscript('subtitle');if(!await flushSave())throw Error('SAVE');renderTranscript(true);})()`);await wait(400);
  const caps=()=>read(`project.clips.filter(FableCutCaptions.isCaption).sort((a,b)=>a.start-b.start).map(c=>({text:c.props.text,start:c.start,end:+(c.start+c.duration).toFixed(3)}))`);
  const before=await caps();report.before=before;
  assert.ok(before.length>=2,'captions from the transcript');
  // 1. the button, and what it says with nothing to work on
  const btn=await read(`(()=>{const b=document.querySelector('[data-tr-cap-lyrics]');return b&&{text:b.textContent,hidden:b.hidden,title:b.title};})()`);
  report.button=btn;assert.equal(btn.text,'按歌词校准字幕');assert.equal(btn.hidden,false);
  await read(`state.selIds.clear();project.inPoint=null;project.outPoint=null;document.querySelector('[data-tr-cap-lyrics]').click();true`);await wait();
  assert.match(await read(`document.getElementById('toast').textContent`),/先在时间线上选中这首歌的字幕，或者用 IN 和 OUT 框出这首歌/);
  // 2. IN–OUT around the song; paste, 对齐: heard → becomes, the unsung line 没法放, nothing changed yet
  const doc0=await read(`JSON.stringify(project.clips)`);
  await read(`project.inPoint=9.5;project.outPoint=15;document.querySelector('[data-tr-cap-lyrics]').click();true`);await wait();
  assert.ok(await read(`!!document.querySelector('[data-ly-dialog][open]')`),'the window opens');
  await read(`(()=>{const e=document.querySelector('[data-ly-text]');e.value=${JSON.stringify(LYRICS)};document.querySelector('[data-ly-align]').click();})();true`);await wait();
  const shown=await read(`[...document.querySelectorAll('[data-ly-lines] li')].map(li=>({was:li.querySelector('.ly-was').textContent,now:li.querySelector('.ly-now').textContent,ticked:li.querySelector('[data-ly-pick]').checked,disabled:li.querySelector('[data-ly-pick]').disabled,tag:li.querySelector('.ly-tag')?.textContent||''}))`);
  report.lines=shown;
  assert.deepEqual(shown.map(s=>s.now),['改成：天空好想下雨','改成：我好想住你隔壁','改成：这一句完全没有唱到']);
  assert.deepEqual(shown.map(s=>s.was),['原来：天空好想夏雨','原来：我好想住你个笔','原来：—']);
  assert.deepEqual(shown.map(s=>s.ticked),[true,true,false]);assert.equal(shown[2].disabled,true);assert.equal(shown[2].tag,'这段没听到这句，没法放');
  assert.match(await read(`document.querySelector('[data-ly-summary]').textContent`),/^能对上 2 行，可能不对 1 行。/);
  assert.equal(await read(`JSON.stringify(project.clips)`),doc0,'nothing changed before applying');
  // 3. the project changes while the window is open: nothing applied
  await read(`(()=>{pushUndo();project.clips.find(c=>c.id==='c_song').props.volume=0.9;return true;})()`);
  await read(`document.querySelector('[data-ly-apply-all]').click();true`);await wait();
  assert.match(await read(`document.querySelector('[data-ly-summary]').textContent`),/项目在打开这个窗口之后改过了/);
  assert.deepEqual(await caps(),before);
  await read(`document.querySelector('[data-ly-dialog] [value=cancel]').click();undo();true`);await wait();
  // 4. again, and apply all that match: one undo step; the talking before and after keeps its caption
  await read(`(async()=>{if(!await flushSave())throw Error('SAVE');document.querySelector('[data-tr-cap-lyrics]').click();})()`);await wait();
  await read(`(()=>{const e=document.querySelector('[data-ly-text]');e.value=${JSON.stringify(LYRICS)};document.querySelector('[data-ly-align]').click();})();true`);await wait();
  const depth=await read(`runtime.undo.length`);
  await read(`document.querySelector('[data-ly-apply-all]').click();true`);await wait(300);
  const after=await caps();report.after=after;
  assert.equal(await read(`runtime.undo.length`),depth+1,'one undo step');
  const song=after.filter(c=>c.start>=9.5&&c.start<15);
  assert.deepEqual(song.map(c=>c.text),['天空好想下雨','我好想住你隔壁']);
  assert.equal(song[0].start,10);assert.equal(song[1].start,11.8);
  assert.deepEqual(after.filter(c=>c.start<9.5||c.start>=15),before.filter(c=>c.start<9.5||c.start>=15),'captions outside the song stay');
  const t=await read(`(()=>{const t=document.getElementById('toast');return{text:t.querySelector('span')?.textContent,button:t.querySelector('.toast-action')?.textContent};})()`);
  report.toast=t;assert.equal(t.text,'已按歌词改好 2 行字幕，可以撤销。');assert.equal(t.button,'撤销');
  await read(`document.getElementById('toast').querySelector('.toast-action').click();true`);await wait();
  assert.deepEqual(await caps(),before,'〔撤销〕 puts the old captions back');
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{out(ok?'LYRICS_PASS':'LYRICS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
