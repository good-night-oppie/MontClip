'use strict';
// Explicit development entry: the sentence dialog in one language, and no false "partly kept" (VV / Deja 2026-11-02).
// Hidden offscreen window, fresh profile: imports a 2 s synthetic WAV, puts it on A1 under two captions that sit on frame
// boundaries, opens the dialog in zh-CN and in en and reads it; ticks one whole sentence and reads the summary;
// applies both sentences, reopens, ticks one again (a second pass over captions with provenance) and reads it.
//   electron desktop/sentence-dialog-smoke.cjs --montclip-smoke --user-data-dir=<fresh folder>   [MONTCLIP_SD_OUT=<abs folder>]
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_SD_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_SD_OUT must be an absolute folder');
const SETUP=`(async()=>{
 const sr=8000,n=sr*2,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 w(0,"RIFF");v.setUint32(4,36+n*2,true);w(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(8000*Math.sin(2*Math.PI*440*i/sr)),true);
 const [m]=await importFiles([new File([buf],"two sentences.wav",{type:"audio/wav"})]);if(!m)throw Error("import failed");
 const f=(k)=>k/30;
 project.clips.push({id:"a1",mediaId:m.id,kind:"audio",track:"A1",start:0,in:0,duration:Math.min(2,m.duration||2),props:{}});
 project.clips.push({id:"s1",mediaId:null,kind:"text",track:"V2",start:f(4),duration:f(36)-f(4),props:{text:"第一句",caption:true}});
 project.clips.push({id:"s2",mediaId:null,kind:"text",track:"V2",start:f(36),duration:f(55)-f(36),props:{text:"第二句",caption:true}});
 rebuildClips();scheduleSave();await flushSave();return m.name;})()`;
// the dialog's own text (the sentence list is the user's captions and times, so it is left out)
const READ=`(()=>{const d=document.querySelector("dialog.sentence-dialog[open]");if(!d)return null;
 const c=d.cloneNode(true);c.querySelector("[data-sentences]").remove();c.querySelector("[data-summary]").remove();
 return {own:c.innerText.replace(/\\s+/g," ").trim(),summary:d.querySelector("[data-summary]").textContent};})()`;
const TICK=(i)=>`(()=>{const d=document.querySelector("dialog.sentence-dialog[open]");const b=d.querySelectorAll("[data-sentences] input")[${i}];b.click();return d.querySelector("[data-summary]").textContent;})()`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results={};
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.setContentSize(1270,800);await wait(600);
  await read(SETUP);await wait(500);
  const PARTIAL={'zh-CN':/一部分声音/,en:/part of (its|their) sound/};
  for(const language of ['zh-CN','en']){
   await read(`updateMontClipView({language:${JSON.stringify(language)}});true`);await wait(200);
   await read(`showSentenceSelection();true`);await wait(700);
   const r=await read(READ);if(!r)throw Error('dialog did not open');
   const summary=await read(TICK(1));await wait(200);
   if(out)fs.writeFileSync(path.join(out,`sentence-dialog-${language}.png`),(await win.webContents.capturePage()).toPNG());
   const other=language==='en'?/[一-鿿]/:/[A-Za-z]{2,}/;
   results[language]={own:r.own,summary,checks:{oneLanguage:!other.test(r.own.replace(/SRT/g,'')),summaryOneLanguage:!other.test(summary.replace(/\\d|[sS]\\b/g,'')),noFalsePartial:!PARTIAL[language].test(summary)}};
   await read(`document.querySelector("dialog.sentence-dialog[open]").close();true`);await wait(300);
  }
  // second pass: keep both sentences, then reopen and keep one of the new captions whole
  await read(`showSentenceSelection();true`);await wait(700);await read(TICK(0));await read(TICK(1));await wait(200);
  await read(`document.querySelector("dialog.sentence-dialog[open] [data-apply]").click();true`);await wait(800);
  await read(`flushSave()`);await wait(300);
  await read(`showSentenceSelection();true`);await wait(700);
  const again=await read(TICK(1));await wait(200);
  results.secondPass={summary:again,checks:{noFalsePartial:!PARTIAL.en.test(again)&&!PARTIAL['zh-CN'].test(again),planned:/→/.test(again)}};
  if(out)fs.writeFileSync(path.join(out,'sentence-dialog-second-pass.png'),(await win.webContents.capturePage()).toPNG());
  await read(`document.querySelector("dialog.sentence-dialog[open]").close();true`);
  const ok=Object.values(results).every(x=>Object.values(x.checks).every(Boolean));
  for(const [k,v] of Object.entries(results))process.stdout.write('SD '+k+' '+JSON.stringify(v)+'\n');
  if(out)fs.writeFileSync(path.join(out,'sentence-dialog.json'),JSON.stringify(results,null,1)+'\n');
  process.stdout.write((ok?'SD_PASS':'SD_FAIL')+'\n');
 }catch(e){process.stdout.write('SD_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
