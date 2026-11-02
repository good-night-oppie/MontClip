'use strict';
// Explicit development entry (run with an existing Electron, see docs/validation/2026-11-02-zh-terms).
// Hidden offscreen window, fresh profile, no input: switches the existing language preference
// and captures the app's own page (capturePage; never the screen) in zh-CN and en at two sizes.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_TERMS_OUT;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  for(const [w,h] of [[1270,800],[804,535]]){win.setContentSize(w,h);await wait(600);
   for(const language of ['zh-CN','en']){await read(`updateMontClipView({language:${JSON.stringify(language)}});true`);await wait(400);
    const r=await read(`(()=>{const bar=document.querySelector('.timeline-toolbar').getBoundingClientRect();return{lang:document.documentElement.lang,saved:mcView.get().language,export:document.getElementById('btnExport').textContent,lift:document.getElementById('btnLift').textContent,settings:document.getElementById('btnSettings').title,project:document.getElementById('projectName').textContent,marked:document.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-tail]').length,overflowX:document.documentElement.scrollWidth-innerWidth,toolbarClipped:[...document.querySelectorAll('.timeline-toolbar > *')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>bar.right+0.5).map(e=>e.id||e.className)};})()`);
    process.stdout.write('TERMS '+JSON.stringify({size:[w,h],...r})+'\n');
    const name=language+'-'+w+'x'+h;
    // screenshots are the app's own page only (webContents.capturePage), never the screen: privacy
    fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());}}
  process.stdout.write('TERMS_COMPLETE\n');
 }catch(e){process.stdout.write('TERMS_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
const Module=require('node:module'),load=Module._load;
Module._load=function(id,...args){
 if(id==='electron'){
  Module._load=load;
  return {...electron,BrowserWindow:class extends BrowserWindow{
   constructor(options){super({...options,show:false,webPreferences:{...options.webPreferences,offscreen:true,backgroundThrottling:false}});}
  }};
 }
 return load.call(this,id,...args);
};
require('./main');
