'use strict';
// The sequence menu's Highlights… in the real editor (VV: it failed with "Highlights.sourcesOf is not a function"
// because highlight-candidates.js took over the same global). Fresh profile, hidden offscreen window, two synthetic
// video clips made here with MontClip's own ffmpeg. Checks: the menu item is enabled, clicking it opens the dialog
// with both clips counted and no page error, and Make cuts a new sequence from them.
//   MONTCLIP_FFMPEG_DIR=<bundled ffmpeg dir> electron desktop/highlights-menu-smoke.cjs --montclip-smoke --user-data-dir=<fresh>
const electron=require('electron'),{app,BrowserWindow}=electron,assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const dir=process.env.MONTCLIP_FFMPEG_DIR;if(!dir)throw Error('MONTCLIP_FFMPEG_DIR (the bundled ffmpeg) is required');
const ffmpeg=path.join(dir,'ffmpeg'+(process.platform==='win32'?'.exe':''));
const SECONDS=12;
function makeClip(file,hz,pattern){
 const r=cp.spawnSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i',`${pattern}=size=320x180:rate=30:duration=${SECONDS}`,
  '-f','lavfi','-i',`sine=frequency=${hz}:sample_rate=48000:duration=${SECONDS}`,'-map','0:v','-map','1:a',
  '-c:v','libvpx-vp9','-b:v','0','-crf','36','-deadline','realtime','-cpu-used','8','-g','15','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-ac','1','-movflags','+faststart',file],{windowsHide:true});
 if(r.status!==0)throw Error('SOURCE_FAILED '+String(r.stderr).slice(0,300));
 return fs.readFileSync(file).toString('base64');
}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mc-hlm-'));
const clips=[['合成 一.mp4',makeClip(path.join(tmp,'a.mp4'),220,'testsrc2')],['合成 二.mp4',makeClip(path.join(tmp,'b.mp4'),440,'testsrc')]];
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const errors=[];
 win.webContents.on('console-message',(...a)=>{const e=a[0]&&typeof a[0]==='object'&&'message' in a[0]?a[0]:{level:a[1],message:a[2]};if(e.level==='error'||e.level===3)errors.push(String(e.message));});
 try{
  await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  await read(`window.__pageErrors=[];addEventListener('error',e=>__pageErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>__pageErrors.push(String(e.reason&&e.reason.message||e.reason)));true`);
  const srcs=[];
  for(const [name,b64] of clips)srcs.push(await read(`(async()=>{const bin=Uint8Array.from(atob(${JSON.stringify(b64)}),c=>c.charCodeAt(0));const r=await fetch('/api/upload?name='+encodeURIComponent(${JSON.stringify(name)}),{method:'POST',body:new Blob([bin])});if(!r.ok)throw Error('upload '+r.status);return (await r.json()).src;})()`));
  await read(`(async()=>{for(let i=0;i<200&&!runtime.projectId;i++)await new Promise(r=>setTimeout(r,50));const doc=projectJSON(),srcs=${JSON.stringify(srcs)};
   Object.assign(doc,{media:srcs.map((src,i)=>({id:'m'+i,src,kind:'video',name:'合成 '+i+'.mp4',duration:${SECONDS},width:320,height:180})),
    clips:srcs.map((src,i)=>({id:'v'+i,kind:'video',mediaId:'m'+i,track:'V1',start:i*${SECONDS},in:0,duration:${SECONDS},props:{volume:1}}))});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('save');})()`);
  await wait(800);
  const seqBefore=await read(`SeqLib.entries(seqRoot()).length`);
  await read(`document.getElementById('btnSequences').click();true`);await wait(300);
  const item=await read(`(()=>{const b=[...document.querySelectorAll('.ctx-item')].find(b=>/Highlights|自动拼短片/.test(b.textContent));return b?{text:b.textContent.trim(),disabled:b.disabled}:null;})()`);
  assert.ok(item,'the sequence menu has Highlights…');
  assert.equal(item.disabled,false,'enabled with video on the timeline');
  await read(`[...document.querySelectorAll('.ctx-item')].find(b=>/Highlights|自动拼短片/.test(b.textContent)).click();true`);await wait(400);
  const pop=await read(`(()=>{const p=document.querySelector('.seq-new #hlLen')&&document.querySelector('.seq-new');return p?{status:p.querySelector('[data-hl-status]').textContent,ok:!p.querySelector('[data-ok]').disabled}:null;})()`);
  assert.ok(pop,'the Highlights dialog opens');
  assert.match(pop.status,/\(2\)/,'both video clips are counted: '+pop.status);
  assert.equal(pop.ok,true,'Make is enabled');
  assert.deepEqual(await read(`__pageErrors`),[],'no page error opening it');
  // Make: sources, pick and ops all run
  await read(`document.querySelector('.seq-new #hlLen').value='15';document.querySelector('.seq-new [data-ok]').click();true`);
  const until=Date.now()+120000;let seqAfter=seqBefore;
  while(Date.now()<until){await wait(500);seqAfter=await read(`SeqLib.entries(seqRoot()).length`);if(seqAfter>seqBefore)break;}
  const made=await read(`({name:openSequenceName(),clips:project.clips.filter(c=>c.kind==='video').length,len:projDur()})`);
  assert.equal(seqAfter,seqBefore+1,'Make adds a sequence');
  assert.ok(made.clips>=2&&made.len>0&&made.len<=15.05,'a short edit from the clips: '+JSON.stringify(made));
  assert.deepEqual(await read(`__pageErrors`),[],'no page error making it');
  assert.ok(!errors.some(e=>/sourcesOf|is not a function/.test(e)),'no "is not a function" in the console: '+errors.join(' | '));
  process.stdout.write('HIGHLIGHTS_MENU_PASS '+JSON.stringify({item,pop,made})+'\n');
 }catch(e){let pe=[];try{pe=await read('window.__pageErrors||[]');}catch{}
  process.stdout.write('HIGHLIGHTS_MENU_FAIL '+(e&&e.message)+' '+JSON.stringify({pageErrors:pe,console:errors.slice(0,5)})+'\n');}
 finally{fs.rmSync(tmp,{recursive:true,force:true});setTimeout(()=>app.exit(0),300);}
};
// Hidden, offscreen window: nothing on the desktop, no focus taken.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
