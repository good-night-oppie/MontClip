'use strict';
// Explicit development entry (docs/validation/2026-11-02-zh-transcript). Visible window, fresh
// profile: imports a 1 s synthetic WAV with a Chinese name, puts it on A1, selects it, opens the
// Transcript tab, searches, and in zh-CN and en reads the panel's visible text and the top bar
// status (dropdown options and hover titles are batch 3 and not read). Captures the page.
// Pass --montclip-smoke; output dir (absolute) in MONTCLIP_TR_OUT.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const out=process.env.MONTCLIP_TR_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_TR_OUT must be an absolute folder');
const SETUP=`(async()=>{
 const sr=8000,n=sr,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
 w(0,"RIFF");v.setUint32(4,36+n*2,true);w(8,"WAVEfmt ");v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(8000*Math.sin(2*Math.PI*440*i/sr)),true);
 const [m]=await importFiles([new File([buf],"讲话 样本.wav",{type:"audio/wav"})]);if(!m)throw Error("import failed");
 project.clips.push({id:"c_tr1",mediaId:m.id,kind:"audio",track:"A1",start:0,in:0,duration:Math.min(1,m.duration||1),props:{}});
 rebuildClips();setSelection(["c_tr1"]);scheduleSave();await flushSave();
 setSideTab("transcript");return m.name;})()`;
const READ=`(async()=>{
 const page=els.transcriptPage,vis=e=>e.offsetParent!==null;
 const until=Date.now()+8000;while(!page.querySelector(".tr-note")&&Date.now()<until)await new Promise(r=>setTimeout(r,50));
 const find=page.querySelector("[data-tr-find]");find.value="样本";find.dispatchEvent(new Event("input",{bubbles:true}));await new Promise(r=>setTimeout(r,100));
 const clone=page.cloneNode(true);clone.querySelectorAll("select,option").forEach(e=>e.remove());
 const texts=[...page.querySelectorAll("button,.tr-lbl,.tr-note,.tr-empty,.tr-count")].filter(vis).map(e=>e.textContent.trim()).filter(Boolean);
 return {lang:document.documentElement.lang,texts,placeholder:find.placeholder,panel:clone.innerText.replace(/\\s+/g," ").trim(),top:document.getElementById("projectName").textContent};})()`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.show();win.setContentSize(1270,800);await wait(600);
  const name=await read(SETUP);await wait(800);
  for(const [step,language] of ['zh-CN','en','zh-CN'].entries()){
   await read(`updateMontClipView({language:${JSON.stringify(language)}});true`);await wait(500);
   const r=await read(READ);results.push(r);
   // what a person reads must be in the interface language; the file name and SRT/VTT are not interface text
   const rest=(r.panel+' '+r.top.replace(project_name_placeholder(r.top),'')).split(name).join(' ').replace(/\b(SRT|VTT)\b/g,' ');
   r.latin=language==='zh-CN'?(rest.match(/[A-Za-z]{2,}/g)||[]):[];r.cjk=language==='en'?(rest.match(/[一-鿿]+/g)||[]):[];
   process.stdout.write('TR '+JSON.stringify(r)+'\n');
   if(out)fs.writeFileSync(path.join(out,(step+1)+'-'+language+'-transcript.page.png'),(await win.webContents.capturePage()).toPNG());}
  if(out)fs.writeFileSync(path.join(out,'transcript.json'),JSON.stringify(results,null,1)+'\n');
  const bad=results.filter(r=>r.latin.length||r.cjk.length);
  process.stdout.write((bad.length?'TR_FAIL ':'TR_PASS ')+results.length+' languages\n');
 }catch(e){process.stdout.write('TR_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// the project name is user content (default "Untitled Project"): left out of the language check
function project_name_placeholder(top){return top.split('  ·  ')[0];}
require('./main');
