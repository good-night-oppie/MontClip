'use strict';
// Every modal dialog in the page, in a real window (Deja, 2026-11-03): each is opened the way the editor opens it, then
// measured (is it in the middle of the window, is the page behind it darkened) and, with MONTCLIP_SHOTS_OUT, captured with
// capturePage of this hidden offscreen window (nothing on the desktop is captured). Fresh profile, synthetic project
// (no media file is read), no network: the AI service is configured with a dummy key and its review box is cancelled.
// The close confirmation and the Yolo box are the main process's own native windows (dialog.showMessageBox, parented to
// the editor window): the system draws them, so they are not in the page and not here.
//   electron desktop/dialogs-smoke.cjs --montclip-smoke --user-data-dir=<fresh>     → DIALOGS_PASS / DIALOGS_FAIL
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),os=require('node:os');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!path.isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
process.env.MONTCLIP_ASR_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-noasr-'));
const out=(k,v)=>process.stdout.write(k+' '+JSON.stringify(v)+'\n');
// in the page: where an element sits against the window, and how dark what is behind it is
const MEASURE=`window.__dlgMeasure=(el,behind)=>{const r=el.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
 const alpha=(c)=>{const m=/rgba?\\(([^)]+)\\)/.exec(c||'');if(!m)return 0;const p=m[1].split(',').map(s=>parseFloat(s));return p.length>3?p[3]:1;};
 const back=behind?getComputedStyle(behind).backgroundColor:getComputedStyle(el,'::backdrop').backgroundColor;
 return {left:Math.round(r.left),top:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),vw,vh,
  dx:Math.round(r.left-(vw-r.right)),dy:Math.round(r.top-(vh-r.bottom)),backdrop:back,alpha:alpha(back)};};true`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){
 await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=(ms=200)=>new Promise(r=>setTimeout(r,ms));
 const shot=async(name)=>{if(!shotsDir)return;await wait(250);fs.writeFileSync(path.join(shotsDir,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 let ok=false;const report={dialogs:{},overlays:{}};
 const watchdog=setTimeout(()=>{out('DIALOGS_FAIL',{watchdog:'4 min',...report});app.exit(1);},240000);
 try{
  for(let i=0;i<150&&!await read(`state.connected`);i++)await wait(100);
  win.setContentSize(1280,800);await wait(300);
  await read(MEASURE);
  await read(`(async()=>{if(!await flushSaveBeforeSwitch())throw Error('SAVE');await pjPost({action:'new',name:'对话框 smoke',open:true});if(!await syncFromServer(true))throw Error('CREATE');})()`);
  // a synthetic recording and two caption sentences (nothing is read from disk)
  await read(`(async()=>{const doc=projectJSON();doc.media.push({id:'m_syn',src:'/media/none.mp4',kind:'video',name:'合成.mp4',duration:120});
   doc.clips.push({id:'c_syn',kind:'video',mediaId:'m_syn',track:'V1',start:0,in:0,duration:120,props:{volume:0}},
    {id:'cap1',kind:'text',mediaId:null,track:'V2',start:1,in:0,duration:3,props:{text:'第一句字幕',caption:true}},
    {id:'cap2',kind:'text',mediaId:null,track:'V2',start:5,in:0,duration:3,props:{text:'第二句字幕',caption:true}});
   applyProject(doc);scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);
  await read(`updateMontClipView({language:'zh-CN'});true`);await wait(300);
  const open=()=>read(`[...document.querySelectorAll('dialog[open]')].map(d=>d.className)`);
  // one <dialog>: open it with `js`, find it by its class, measure, capture, close it
  const dialog=async(name,cls,js)=>{
   await read(`(()=>{${js}})();true`);
   let m=null;for(let i=0;i<40&&!m;i++){await wait(100);m=await read(`(()=>{const d=document.querySelector('dialog.${cls}[open]');return d?__dlgMeasure(d):null;})()`);}
   report.dialogs[name]=m||{missing:true,open:await open()};
   if(m)await shot('dialog-'+name);
   await read(`for(const d of document.querySelectorAll('dialog[open]'))d.close();true`);await wait(200);
  };
  // the FLV import box closes as soon as the main process turns the synthetic file down: it is measured in the same turn
  // it opens, and a copy of it (the same markup) is shown for the capture
  await dialog('flv-import','flv-import-dialog',`desktopFlvImport({name:'合成.flv',size:0,path:''}).catch(()=>{});const d=document.querySelector('dialog.flv-import-dialog[open]');
   if(d){window.__flvSeen=__dlgMeasure(d);const c=d.cloneNode(true);c.removeAttribute('open');d.after(c);setTimeout(()=>c.showModal(),0);}`);
  report.dialogs['flv-import-as-opened']=await read(`window.__flvSeen||{missing:true}`);
  await dialog('caption-size','cq-dialog',`setSelection(['cap1']);openCaptionQuick()`);
  await dialog('asr-setup','asr-setup',`openAsrSetup()`);
  await dialog('highlights','highlight-dialog',`showHighlightCandidates()`);
  await dialog('auto-slices','auto-slices',`openAutoSlices()`);
  await dialog('auto-slices-preview','as-preview',`autoPreview({mediaId:'m_syn',s:0,e:5,kind:'moment',at:0})`);
  await dialog('sentences','sentence-dialog',`showSentenceSelection()`);
  // the AI service's review box (a dummy key; cancelled, nothing is sent)
  await read(`setSideTab('assistant');mcAgent.render();montclipAgentService.configure({provider:'openrouter',model:'synthetic-model',apiKey:'synthetic-test-key-not-real'});mcAgent.render();true`);await wait(300);
  await dialog('ai-review','cindy-confirm',`const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'只保留第一句');e.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>document.querySelector('.cindy-send button').click(),200)`);
  await read(`setSideTab('inspector');true`);
  // the editor's own overlays (a darkened layer with the box in its middle), opened by their buttons or functions
  const overlay=async(name,id,js)=>{
   await read(`(()=>{${js}})();true`);
   let m=null;for(let i=0;i<40&&!m;i++){await wait(100);m=await read(`(()=>{const o=document.getElementById(${JSON.stringify(id)});if(!o||o.classList.contains('hidden'))return null;const d=o.querySelector('.dialog')||o.firstElementChild;const r=o.getBoundingClientRect();return {...__dlgMeasure(d,o),cover:Math.round(r.width)===innerWidth&&Math.round(r.height)===innerHeight};})()`);}
   await wait(200);
   report.overlays[name]=m||{missing:true};
   if(m)await shot('overlay-'+name);
   await read(`document.getElementById(${JSON.stringify(id)}).classList.add('hidden');true`);await wait(150);
  };
  await overlay('export','exportSetup',`document.getElementById('btnExport').click()`);
  await overlay('export-queue','exportQueue',`openQueue()`);
  await overlay('projects','projectsOverlay',`document.getElementById('btnProjects')?document.getElementById('btnProjects').click():openProjects()`);
  await overlay('settings','settingsOverlay',`document.getElementById('btnSettings').click()`);
  await overlay('help','helpOverlay',`document.getElementById('btnHelp').click()`);
  await overlay('import-url','importUrlOverlay',`document.getElementById('importUrlOverlay').classList.remove('hidden')`);
  // centred within 2 px each way (a box taller than the window is pinned to the top by the browser, so only dx then);
  // the page behind it darkened at least 30 %
  const bad=[];
  for(const [group,list] of Object.entries(report))for(const [name,m] of Object.entries(list)){
   if(m.missing){bad.push(name+': did not open');continue;}
   if(Math.abs(m.dx)>2||(m.h<m.vh&&Math.abs(m.dy)>2))bad.push(`${name}: off centre (dx ${m.dx}, dy ${m.dy})`);
   if(m.alpha<0.3)bad.push(`${name}: backdrop ${m.backdrop}`);
   if(group==='overlays'&&!m.cover)bad.push(name+': the dark layer does not cover the window');
  }
  report.bad=bad;ok=!bad.length;
 }catch(e){report.error=String(e&&e.stack||e).slice(0,1500);}
 finally{clearTimeout(watchdog);out(ok?'DIALOGS_PASS':'DIALOGS_FAIL',report);process.exitCode=ok?0:1;app.exit(ok?0:1);}
 await new Promise(()=>{});
};
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
