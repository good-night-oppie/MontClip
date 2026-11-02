'use strict';
// Explicit development entry (docs/validation/2026-11-02-narrow-layout). Visible window, fresh
// profile: at 1270×800, 804×535 and 630×452, in zh-CN and en, simple and advanced, measures
//  - the preview picture (#preview) on screen, which must be larger than 0×0;
//  - whether the player controls (.transport) overlap the timeline panel;
//  - every timeline tool: reachable when fully inside the toolbar and hit at its centre,
//    or listed in the toolbar's More menu;
// and saves a page capture and an OS screenshot of the window for each case.
// Pass --montclip-smoke; output dir in MONTCLIP_LAYOUT_OUT.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const out=process.env.MONTCLIP_LAYOUT_OUT,SIZES=[[1270,800],[804,535],[630,452]];
const MEASURE=`(()=>{
 const r=e=>e.getBoundingClientRect(),vis=e=>!!e&&e.offsetParent!==null&&getComputedStyle(e).visibility!=='hidden';
 const bar=document.querySelector('.timeline-toolbar'),b=r(bar),panel=r(document.getElementById('timelinePanel'));
 const pv=r(document.getElementById('preview')),stage=r(document.getElementById('monitorStage'));
 const shown={w:Math.max(0,Math.min(pv.right,stage.right)-Math.max(pv.left,stage.left)),h:Math.max(0,Math.min(pv.bottom,stage.bottom)-Math.max(pv.top,stage.top))};
 const tr=r(document.querySelector('#monitorPanel .transport'));
 const overlap=Math.max(0,Math.min(tr.bottom,panel.bottom)-Math.max(tr.top,panel.top))*Math.max(0,Math.min(tr.right,panel.right)-Math.max(tr.left,panel.left));
 const more=document.getElementById('tlMoreMenu'),inMore=new Set(more?[...more.querySelectorAll('[data-more-for]')].map(e=>e.dataset.moreFor):[]);
 const tools=[...bar.querySelectorAll('button,input,select')].filter(e=>!e.closest('#tlMoreMenu')&&!e.classList.contains('hidden')&&!e.closest('.hidden')&&e.id!=='btnTlMore');
 const rows=tools.map(e=>{const id=e.id||e.dataset.editTool||e.className,k=r(e);
  const inside=k.width>0&&k.left>=b.left-0.5&&k.right<=b.right+0.5&&k.top>=b.top-0.5&&k.bottom<=b.bottom+0.5;
  const hit=inside&&vis(e)&&(()=>{const h=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);return !!h&&(h===e||e.contains(h));})();
  return {id,inBar:hit,inMore:inMore.has(id),reachable:hit||inMore.has(id)};});
 return {lang:document.documentElement.lang,mode:mcView.get().mode,preview:{w:Math.round(shown.w),h:Math.round(shown.h)},transportOverTimeline:Math.round(overlap),
  unreachable:rows.filter(x=>!x.reachable).map(x=>x.id),inMore:rows.filter(x=>x.inMore).map(x=>x.id),tools:rows.length,
  moreButton:!!document.getElementById('btnTlMore')&&vis(document.getElementById('btnTlMore')),snapInBar:(rows.find(x=>x.id==='btnSnap')||{}).inBar,
  overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight};})()`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.show();win.setAlwaysOnTop(true);
  for(const [w,h] of SIZES){win.setContentSize(w,h);await wait(700);
   for(const language of ['zh-CN','en'])for(const mode of ['simple','advanced']){
    await read(`updateMontClipView({language:${JSON.stringify(language)},mode:${JSON.stringify(mode)}});true`);await wait(450);
    const m=await read(MEASURE),name=`${language}-${mode}-${w}x${h}`;results.push({size:[w,h],...m});
    process.stdout.write('LAYOUT '+JSON.stringify({size:[w,h],...m})+'\n');
    if(out){fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());
     const s=electron.screen.dipToScreenRect(win,win.getContentBounds());
     cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Drawing;Add-Type -Namespace W -Name D -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();';[void][W.D]::SetProcessDPIAware();$b=New-Object System.Drawing.Bitmap ${s.width},${s.height};$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(${s.x},${s.y},0,0,$b.Size);$b.Save('${path.join(out,name+'.screen.png').replace(/'/g,"''")}');`],{windowsHide:true});}}}
  if(out)fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(results,null,1)+'\n');
  process.stdout.write('LAYOUT_COMPLETE\n');
 }catch(e){process.stdout.write('LAYOUT_FAIL '+e.message+'\n');}finally{win.setAlwaysOnTop(false);setTimeout(()=>app.exit(0),300);}};
require('./main');
