'use strict';
// VV (2026-11-05, #148 review at 360 px): in a 360 px window 素材 put the media panel to the right of the player, half off
// the page — the filter box ran 281→401 (its arrow off screen), the sort box 405→483 and its direction button 487→513.
// Rule: at 360×640 and 630×460 (and at the edge, 560×640 and 561×640), zh-CN and en, simple and advanced, once 素材 is
// clicked every visible control of the media panel (and the panel itself, and the 素材 button) lies inside the page:
// getBoundingClientRect().left ≥ 0 and .right ≤ innerWidth. A control inside a strip that scrolls sideways counts by the
// strip (a person scrolls the strip to it). The page itself does not scroll sideways.
// VV on #162 (bcdceed9): at ≤560 px the open panel covers the player, so a double-click that loaded Source looked like
// nothing happened. Now, at ≤560 px: the open panel's button says 返回播放器 / ← Player (JJ, 2026-11-05; its aria-label
// and tooltip in full: 返回播放器 / Back to player) with aria-expanded="true", and ⚙ and ? stay on the top bar; a single click, the star and the Show filter leave the panel open; a double-click that loads the
// file into Source puts the panel away and shows the player with Source in it; 素材 again brings the panel back with the
// same files. At 561 px and wider the panel and the player sit side by side and a double-click leaves the panel open.
// Hidden offscreen window, fresh profile, two files from library/elements; MONTCLIP_SHOTS_OUT=<absolute folder> saves the
// window's own page.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const shotsDir=process.env.MONTCLIP_SHOTS_OUT||null;if(shotsDir&&!path.isAbsolute(shotsDir))throw Error('MONTCLIP_SHOTS_OUT must be an absolute folder');
const SIZES=[[360,640],[560,640],[561,640],[630,460]];
const MEASURE=`(()=>{
 const bin=document.querySelector('.upper > .bin'),vis=e=>{const k=e.getBoundingClientRect();return k.width>0&&k.height>0&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';};
 if(!bin||!vis(bin))return{open:false,outside:['the media panel is not shown']};
 const scroller=e=>{for(let p=e.parentElement;p&&p!==bin.parentElement;p=p.parentElement){const o=getComputedStyle(p).overflowX;if((o==='auto'||o==='scroll')&&p.scrollWidth>p.clientWidth+1)return p;}return null;};
 const name=e=>(e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):''))+(e.textContent.trim()?' 「'+e.textContent.trim().slice(0,12)+'」':'');
 const seen=new Set(),outside=[];
 for(const e of [document.getElementById('mcMediaToggle'),bin,...bin.querySelectorAll('button,input,select,textarea,a[href],summary,[role=button],[tabindex]')]){
  if(!vis(e))continue;const box=scroller(e)||e;if(seen.has(box))continue;seen.add(box);
  const k=box.getBoundingClientRect();if(k.left<-0.5||k.right>innerWidth+0.5)outside.push(name(box)+' '+Math.round(k.left)+'→'+Math.round(k.right));}
 const b=bin.getBoundingClientRect();
 return{open:true,innerWidth,bin:[Math.round(b.left),Math.round(b.right)],controls:seen.size,outside,overflowX:document.documentElement.scrollWidth-innerWidth};})()`;
// open → click, star, filter (stays open) → double-click (loads Source; at ≤560 px puts the panel away) → 素材 again
const FLOW=`(async()=>{
 const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const appEl=document.getElementById('app'),tog=document.getElementById('mcMediaToggle'),bin=document.querySelector('.upper > .bin');
 const shown=e=>{if(!e)return false;const k=e.getBoundingClientRect();return k.width>0&&k.height>0&&e.getClientRects().length>0;};
 const toggle=()=>({text:tog.textContent,expanded:tog.getAttribute('aria-expanded'),label:tog.getAttribute('aria-label'),title:tog.title});
 // JJ (2026-11-05): ⚙ and ? stay on the top bar at 360 px, not in its More menu
 const onBar=id=>{const e=document.getElementById(id),m=document.getElementById('topMoreMenu'),k=e.getBoundingClientRect();return !m.contains(e)&&shown(e)&&k.left>=-0.5&&k.right<=innerWidth+0.5;};
 const ids=()=>[...bin.querySelectorAll('.bin-item[data-media-id]')].map(e=>e.dataset.mediaId).join(',');
 const files=()=>JSON.stringify(project.media.map(m=>[m.id,m.name,m.src]));
 const item=()=>bin.querySelector('.bin-item[data-media-id="m_syn_a"]');
 const opened=toggle(),bar={settings:onBar('btnSettings'),help:onBar('btnHelp')},playerWhileOpen=shown(document.getElementById('monitorStage')),before={ids:ids(),files:files()};
 item().click();await frame();
 item().querySelector('.bin-fav').click();await frame();item().querySelector('.bin-fav').click();await frame();
 const f=document.getElementById('binFilter');f.value='fav';f.dispatchEvent(new Event('change'));await frame();f.value='';f.dispatchEvent(new Event('change'));await frame();
 const stayed=appEl.classList.contains('media-open');
 item().dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await frame();await frame();
 const after={source:state.source.mediaId,monitor:state.monitorMode,open:appEl.classList.contains('media-open'),player:shown(document.getElementById('monitorStage')),toggle:toggle()};
 // AGAIN (after the screenshot of this moment) opens the panel again, if the double-click put it away
 window.__mcAgain=async()=>{if(!after.open){tog.click();await frame();await frame();}
  return{open:shown(bin),toggle:toggle(),sameFiles:ids()===before.ids&&files()===before.files&&before.ids.split(',').length===2,source:state.source.mediaId};};
 return{narrow:innerWidth<=560,labels:{media:uiText('own.media-toggle'),back:uiText('own.media-back')},opened,bar,playerWhileOpen,stayed,after};})()`;
const AGAIN=`(async()=>{const r=await window.__mcAgain();delete window.__mcAgain;return r;})()`;
// JJ's wording (定稿 2026-11-05): the button and, in full, its aria-label and tooltip
const BACK={'zh-CN':['返回播放器','返回播放器'],en:['← Player','Back to player']};
const flowProblems=(f,language)=>{const p=[],L=f.labels,want=(ok,what)=>{if(!ok)p.push(what);};
 want(f.opened.expanded==='true','open: aria-expanded is '+f.opened.expanded);
 want(f.opened.text===(f.narrow?BACK[language][0]:L.media),'open: the button says '+f.opened.text);
 if(f.narrow)want(f.opened.label===BACK[language][1]&&f.opened.title===BACK[language][1],'open: aria-label / title are '+JSON.stringify([f.opened.label,f.opened.title]));
 if(f.narrow)want(f.bar.settings&&f.bar.help,'open: ⚙ / ? are not on the top bar '+JSON.stringify(f.bar));
 want(f.playerWhileOpen===!f.narrow,'open: the player is '+(f.playerWhileOpen?'shown':'hidden'));
 want(f.stayed,'a click, the star or the filter put the panel away');
 want(f.after.source==='m_syn_a'&&f.after.monitor==='source','double-click did not load Source: '+JSON.stringify(f.after));
 want(f.after.player,'after the double-click the player is not shown');
 want(f.after.open===!f.narrow,'after the double-click the panel is '+(f.after.open?'open':'away'));
 if(f.narrow)want(f.after.toggle.text===L.media&&f.after.toggle.expanded==='false'&&f.after.toggle.label===null&&!f.after.toggle.title,'after the double-click the button says '+JSON.stringify(f.after.toggle));
 want(f.again.open&&f.again.toggle.expanded==='true','素材 again does not bring the panel back');
 want(f.again.sameFiles,'the panel lost files');want(f.again.source==='m_syn_a','Source lost its file');
 return p;};
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(!state.connected)throw Error('NOT_CONNECTED');})()`);
  // the app's own minimum size is for a framed window; this measures the page at VV's sizes, so lift it here only
  win.setMinimumSize(200,200);
  // two files that exist (library/elements), so a double-click really loads Source
  await read(`(async()=>{project.media=[{id:'m_syn_a',name:'synthetic-a.svg',kind:'svg',src:'/library/elements/logo-placeholder.svg',width:1280,height:720},{id:'m_syn_b',name:'synthetic-b.svg',kind:'svg',src:'/library/elements/bokeh-drift.svg',width:1280,height:720}];
   project.clips=[];renderBin();scheduleSave();if(!await flushSave())throw Error('SAVE');})()`);await wait(500);
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
    if(shotsDir&&mode==='simple')fs.writeFileSync(path.join(shotsDir,`narrow-media-${w}-${language}.png`),(await win.webContents.capturePage()).toPNG());
    const flow=clicked?await read(FLOW):null;await wait(400); // the Source picture draws
    if(shotsDir&&mode==='simple')fs.writeFileSync(path.join(shotsDir,`narrow-media-${w}-${language}-after-double-click.png`),(await win.webContents.capturePage()).toPNG());
    if(flow){flow.again=await read(AGAIN);if(shotsDir&&mode==='simple')fs.writeFileSync(path.join(shotsDir,`narrow-media-${w}-${language}-reopened.png`),(await win.webContents.capturePage()).toPNG());}
    const problems=flow?flowProblems(flow,language):['素材 is not shown'];
    const row={size:[w,h],language,mode,...m,flow:problems.length?{problems,...flow}:'ok'};results.push(row);process.stdout.write('NARROW_MEDIA '+JSON.stringify(row)+'\n');
    await read(`document.getElementById('app').classList.remove('media-open');setMonitorMode('program');true`);}}
  const bad=results.filter(m=>!m.open||m.outside.length||m.overflowX>0||m.flow!=='ok');
  process.stdout.write((bad.length?'NARROW_MEDIA_FAIL '+bad.length+' of ':'NARROW_MEDIA_PASS ')+results.length+' cases\n');
 }catch(e){process.stdout.write('NARROW_MEDIA_FAIL '+(e&&e.message)+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
