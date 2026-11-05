'use strict';
// VV (2026-11-05, #148 review at 360 px): in a 360 px window 素材 put the media panel to the right of the player, half off
// the page — the filter box ran 281→401 (its arrow off screen), the sort box 405→483 and its direction button 487→513.
// Rule: at 360×640 and 630×460, zh-CN and en, simple and advanced, once 素材 is clicked every visible control of the media
// panel (and the panel itself) lies inside the page: getBoundingClientRect().left ≥ 0 and .right ≤ innerWidth. A control
// inside a strip that scrolls sideways counts by the strip (a person scrolls the strip to it). The page itself does not
// scroll sideways. Hidden offscreen window, fresh profile; MONTCLIP_SHOTS_OUT=<absolute folder> saves the window's own page.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!path.isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const SIZES=[[360,640],[630,460]];
const MEASURE=`(()=>{
 const bin=document.querySelector('.upper > .bin'),vis=e=>{const k=e.getBoundingClientRect();return k.width>0&&k.height>0&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';};
 if(!bin||!vis(bin))return{open:false,outside:['the media panel is not shown']};
 const scroller=e=>{for(let p=e.parentElement;p&&p!==bin.parentElement;p=p.parentElement){const o=getComputedStyle(p).overflowX;if((o==='auto'||o==='scroll')&&p.scrollWidth>p.clientWidth+1)return p;}return null;};
 const name=e=>(e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):''))+(e.textContent.trim()?' 「'+e.textContent.trim().slice(0,12)+'」':'');
 const seen=new Set(),outside=[];
 for(const e of [bin,...bin.querySelectorAll('button,input,select,textarea,a[href],summary,[role=button],[tabindex]')]){
  if(!vis(e))continue;const box=scroller(e)||e;if(seen.has(box))continue;seen.add(box);
  const k=box.getBoundingClientRect();if(k.left<-0.5||k.right>innerWidth+0.5)outside.push(name(box)+' '+Math.round(k.left)+'→'+Math.round(k.right));}
 const b=bin.getBoundingClientRect();
 return{open:true,innerWidth,bin:[Math.round(b.left),Math.round(b.right)],controls:seen.size,outside,overflowX:document.documentElement.scrollWidth-innerWidth};})()`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  // the app's own minimum size is for a framed window; this measures the page at VV's sizes, so lift it here only
  win.setMinimumSize(200,200);
  for(const [w,h] of SIZES){win.setContentSize(w,h);await wait(400);
   // a scaled display rounds the page a pixel short: step the window a pixel at a time when the ratio alone does not reach it
   const fit=(c,i,want)=>{const n=Math.round(c*want/i);return n!==c?n:c+Math.sign(want-i);};
   for(let i=0;i<8;i++){const [iw,ih]=await read(`[innerWidth,innerHeight]`),[cw,ch]=win.getContentSize();if(iw===w&&ih===h)break;win.setContentSize(fit(cw,iw,w),fit(ch,ih,h));await wait(400);}
   // on a scaled display some sizes cannot be hit by the ratio: try the window sizes around it, one by one
   for(let dw=-4;dw<=4;dw++){const [iw,ih]=await read(`[innerWidth,innerHeight]`);if(iw===w&&ih===h)break;const [cw,ch]=win.getContentSize();
    win.setContentSize(cw+(iw===w?0:Math.sign(w-iw)||1)*(1+Math.abs(dw)),ch+(ih===h?0:Math.sign(h-ih)));await wait(300);}
   const [iw,ih]=await read(`[innerWidth,innerHeight]`);if(iw!==w||ih!==h)throw Error('page is '+iw+'×'+ih+', not '+w+'×'+h);
   for(const language of ['zh-CN','en'])for(const mode of ['simple','advanced']){
    await read(`document.getElementById('app').classList.remove('media-open');updateMontClipView({language:${JSON.stringify(language)},mode:${JSON.stringify(mode)}});true`);await wait(400);
    // as a person does: click 素材 / Media in the top bar
    const clicked=await read(`(()=>{const b=document.getElementById('mcMediaToggle'),k=b.getBoundingClientRect();if(!(k.width>0&&k.height>0))return false;b.click();return true;})()`);
    await wait(400);
    const m=clicked?await read(MEASURE):{open:false,outside:['素材 is not shown']};
    const row={size:[w,h],language,mode,...m};results.push(row);process.stdout.write('NARROW_MEDIA '+JSON.stringify(row)+'\n');
    if(shotsDir&&mode==='simple')fs.writeFileSync(path.join(shotsDir,`narrow-media-${w}-${language}.png`),(await win.webContents.capturePage()).toPNG());
    await read(`document.getElementById('app').classList.remove('media-open');true`);}}
  const bad=results.filter(m=>!m.open||m.outside.length||m.overflowX>0);
  process.stdout.write((bad.length?'NARROW_MEDIA_FAIL '+bad.length+' of ':'NARROW_MEDIA_PASS ')+results.length+' cases\n');
 }catch(e){process.stdout.write('NARROW_MEDIA_FAIL '+(e&&e.message)+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
