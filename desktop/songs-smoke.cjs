'use strict';
// P2 「找出每首歌」 in the desktop editor (Deja, 2026-11-03). Fresh profile, hidden offscreen window, synthetic sound only
// (test/songs-synth.js: a held tone is singing, tone bursts with pauses are talk). Checks, through the real server and page:
//  - an 8-minute file uploaded to media/ is read by POST /api/songs to the end; GET answers two songs within ±2 s;
//  - the songs are kept in the project (setSongs, through the same checks as MCP); an edit by hand, saved by the editor,
//    keeps them on disk (the editor drops top-level fields it does not know);
//  - a stopped scan carries on: cancel right after it starts, then POST again ends with the same songs.
//   electron desktop/songs-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → SONGS_PASS / SONGS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const {wav}=require('../test/songs-synth');
const PLAN=[['talk',60],['song',140],['talk',80],['song',150],['talk',50]],SONGS=[[60,200],[280,430]];
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s);
 let ok=false;const report={};
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'歌曲 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
  const b64=wav(PLAN).toString('base64');
  const up=await read(`(async()=>{const b=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const r=await fetch('/api/upload?name='+encodeURIComponent('合成 演唱.wav'),{method:'POST',body:b});return r.json();})()`);
  report.src=up.src;assert.ok(up.src);
  const poll=`(async(src)=>{for(let i=0;i<1200;i++){const r=await fetch('/api/songs?src='+encodeURIComponent(src)).then(r=>r.json());if(r.state!=='running')return r;await new Promise(z=>setTimeout(z,100));}throw Error('SLOW');})`;
  // stop right after it starts, then carry on
  const first=await read(`(async()=>{const src=${JSON.stringify(up.src)};const p=await fetch('/api/songs',{method:'POST',body:JSON.stringify({src})}).then(r=>r.json());await fetch('/api/songs/cancel',{method:'POST',body:JSON.stringify({src})});return {p,after:await ${poll}(src)};})()`);
  report.stopped={state:first.after.state,done:first.after.done};
  // an 8-minute file can be read before the cancel lands: then it is done; otherwise it says stopped, never none
  assert.ok(['stopped','done'].includes(first.after.state),first.after.state);
  const done=await read(`(async()=>{const src=${JSON.stringify(up.src)};await fetch('/api/songs',{method:'POST',body:JSON.stringify({src})});return ${poll}(src);})()`);
  report.done={state:done.state,complete:done.complete,songs:done.songs.map(s=>[s.from,s.to,s.confidence])};
  assert.equal(done.state,'done');assert.equal(done.songs.length,2);
  done.songs.forEach((s,i)=>{assert.ok(Math.abs(s.from-SONGS[i][0])<=2&&Math.abs(s.to-SONGS[i][1])<=2,JSON.stringify(s));});
  // into the project, then an edit by hand saved by the editor
  const kept=await read(`(async()=>{const src=${JSON.stringify(up.src)},d=${JSON.stringify({key:done.key,complete:done.complete,scanned:done.scanned,songs:done.songs})};
   const doc=projectJSON();doc.media.push({id:'m_song',name:'合成 演唱.wav',kind:'audio',src,duration:480});
   doc.clips.push({id:'c_song',mediaId:'m_song',kind:'audio',track:'A1',start:0,in:0,duration:480});
   doc.songs={m_song:MontClipSongs.entry(d)};applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');
   pushUndo();project.clips.find(c=>c.id==='c_song').duration=470;scheduleSave();if(!await flushSave())throw Error('SAVE2');
   const disk=await fetch('/api/project').then(r=>r.json());return {n:disk.songs&&disk.songs.m_song&&disk.songs.m_song.songs.length,dur:disk.clips.find(c=>c.id==='c_song').duration};})()`);
  report.keptAfterEdit=kept;assert.equal(kept.n,2);assert.equal(kept.dur,470);
  ok=true;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1200);}
 finally{out(ok?'SONGS_PASS':'SONGS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
