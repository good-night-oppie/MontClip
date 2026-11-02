'use strict';
// Explicit development entry (run with an existing Electron, see docs/validation/2026-11-02-zh-terms).
// Visible window, fresh profile, no input: switches the existing language preference and
// captures the page and an OS screenshot of the window in zh-CN and en at two sizes.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const out=process.env.MONTCLIP_TERMS_OUT;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.show();win.setAlwaysOnTop(true);
  for(const [w,h] of [[1270,800],[804,535]]){win.setContentSize(w,h);await wait(600);
   for(const language of ['zh-CN','en']){await read(`updateMontClipView({language:${JSON.stringify(language)}});true`);await wait(400);
    const r=await read(`(()=>{const bar=document.querySelector('.timeline-toolbar').getBoundingClientRect();return{lang:document.documentElement.lang,saved:mcView.get().language,export:document.getElementById('btnExport').textContent,lift:document.getElementById('btnLift').textContent,settings:document.getElementById('btnSettings').title,project:document.getElementById('projectName').textContent,marked:document.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-tail]').length,overflowX:document.documentElement.scrollWidth-innerWidth,toolbarClipped:[...document.querySelectorAll('.timeline-toolbar > *')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>bar.right+0.5).map(e=>e.id||e.className)};})()`);
    process.stdout.write('TERMS '+JSON.stringify({size:[w,h],...r})+'\n');
    const name=language+'-'+w+'x'+h;
    fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());
    const b=electron.screen.dipToScreenRect(win,win.getContentBounds());
    cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Drawing;Add-Type -Namespace W -Name D -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();';[void][W.D]::SetProcessDPIAware();$b=New-Object System.Drawing.Bitmap ${b.width},${b.height};$g=[System.Drawing.Graphics]::FromImage($b);$g.CopyFromScreen(${b.x},${b.y},0,0,$b.Size);$b.Save('${path.join(out,name+'.screen.png').replace(/'/g,"''")}');`],{windowsHide:true});}}
  process.stdout.write('TERMS_COMPLETE\n');
 }catch(e){process.stdout.write('TERMS_FAIL '+e.message+'\n');}finally{win.setAlwaysOnTop(false);setTimeout(()=>app.exit(0),300);}};
require('./main');
