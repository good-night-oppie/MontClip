'use strict';
// Explicit development entry (docs/validation/2026-11-02-narrow-layout). Hidden offscreen window, fresh
// profile: at 1270×800, 804×535 and 630×452, in zh-CN and en, simple and advanced, measures
//  - the preview picture (#preview) on screen, which must be larger than 0×0;
//  - whether the player controls (.transport) overlap the timeline panel;
//  - every tool of the timeline toolbar, the monitor header and the top bar: reachable when fully inside
//    its bar, hit at its centre, overlapping no neighbour and with its whole label, or hit at its centre inside the opened More menu;
//  - every player button: hit at its centre;
//  - every side-panel tab: hit at its centre once its strip is scrolled to it;
// and saves a page capture (the app's own page; never the screen) for each case.
// Pass --montclip-smoke; output dir in MONTCLIP_LAYOUT_OUT.
const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs'),path=require('node:path');
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
const out=process.env.MONTCLIP_LAYOUT_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_LAYOUT_OUT must be an absolute folder');const SIZES=[[1270,800],[804,535],[630,460]];
const MEASURE=`(async()=>{
 const r=e=>e.getBoundingClientRect(),vis=e=>!!e&&e.offsetParent!==null&&getComputedStyle(e).visibility!=="hidden";
 const frame=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
 const hit=e=>{const k=r(e);if(!(k.width>0&&k.height>0)||!vis(e))return false;if(k.left<0||k.top<0||k.right>innerWidth+0.5||k.bottom>innerHeight+0.5)return false;
  const h=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);return !!h&&(h===e||e.contains(h));};
 const tools=(root)=>[...root.querySelectorAll("button,input,select")].filter(e=>!e.classList.contains("more-btn")&&!e.classList.contains("hidden")&&!e.closest(".hidden")&&!e.hidden);
 async function bar(box,btn,menu,label){
  const bb=r(box),rows=[];
  for(const e of tools(box).filter(e=>!menu.contains(e))){const k=r(e),inside=k.left>=bb.left-0.5&&k.right<=bb.right+0.5;rows.push({id:e.id||e.dataset.editTool||e.className,where:label,inMore:false,ok:inside&&hit(e)});}
  const moved=tools(menu);
  if(moved.length){btn.click();await frame();for(const e of moved)rows.push({id:e.id||e.dataset.editTool||e.className,where:label,inMore:true,ok:!menu.hidden&&hit(e)});btn.click();await frame();}
  const kids=[...box.children].filter(e=>e!==menu&&vis(e)).map(e=>[e.id||e.className,r(e)]);const overlaps=[];
  for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++){const p=kids[i][1],q=kids[j][1];if(Math.min(p.right,q.right)-Math.max(p.left,q.left)>1&&Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top)>1)overlaps.push(label+":"+kids[i][0]+"/"+kids[j][0]);}
  for(const e of tools(box).filter(e=>!menu.contains(e)&&e.tagName==="BUTTON"&&vis(e)))if(e.scrollWidth>e.clientWidth+1)overlaps.push(label+":"+(e.id||e.className)+" label cut");
  return {rows,overlaps,moreShown:vis(btn)};}
 const tl=await bar(document.querySelector(".timeline-toolbar"),document.getElementById("btnTlMore"),document.getElementById("tlMoreMenu"),"timeline");
 const mon=await bar(document.querySelector("#monitorPanel .panel-head-actions"),document.getElementById("btnMonMore"),document.getElementById("monMoreMenu"),"monitor");
 const top=await bar(document.querySelector(".topbar-right"),document.getElementById("btnTopMore"),document.getElementById("topMoreMenu"),"topbar");
 const bin=await bar(document.querySelector(".bin-actions"),document.getElementById("btnBinMore"),document.getElementById("binMoreMenu"),"bin");
 const tabs=[];for(const t of document.querySelectorAll("#sideTabs button,#binTabs button")){if(t.classList.contains("hidden")||t.hidden||t.offsetParent===null)continue;
  t.scrollIntoView({block:"nearest",inline:"nearest"});await frame();tabs.push({id:t.textContent.trim(),ok:hit(t)});}
 for(const s of document.querySelectorAll(".bin-tabs"))s.scrollLeft=0;
 const panel=r(document.getElementById("timelinePanel")),pv=r(document.getElementById("preview")),stage=r(document.getElementById("monitorStage"));
 const shown={w:Math.max(0,Math.min(pv.right,stage.right)-Math.max(pv.left,stage.left)),h:Math.max(0,Math.min(pv.bottom,stage.bottom)-Math.max(pv.top,stage.top))};
 const tr=r(document.querySelector("#monitorPanel .transport"));
 const overlap=Math.max(0,Math.min(tr.bottom,panel.bottom)-Math.max(tr.top,panel.top))*Math.max(0,Math.min(tr.right,panel.right)-Math.max(tr.left,panel.left));
 const player=[...document.querySelectorAll("#monitorPanel .transport-btns button")].filter(e=>!e.classList.contains("hidden")).map(e=>({id:e.id,ok:hit(e)}));
 // elementsFromPoint: with the monitor More menu open, each item's centre must have the item on top (not #preview)
 const monitorMenu=await(async()=>{const b=document.getElementById("btnMonMore"),m=document.getElementById("monMoreMenu");if(b.hidden)return{shown:false,items:0,covered:[]};
  b.click();await frame();const items=tools(m),covered=[];
  for(const e of items){const k=r(e),top=document.elementsFromPoint(k.left+k.width/2,k.top+k.height/2)[0];if(!top||!(top===e||e.contains(top)))covered.push((e.id||e.className)+" under "+(top?(top.id||top.className||top.tagName):"nothing"));}
  b.click();await frame();return{shown:true,items:items.length,covered};})();
 // the transcript's caption row: every button reachable at its top edge, centre and bottom edge, after scrolling it into view
 const transcriptRow=await(async()=>{setSideTab("transcript");await frame();const btn=document.querySelector("[data-tr-sentences]");if(!btn){setSideTab("inspector");return{ok:false,missed:["missing"]};}
  const row=btn.closest(".tr-row");
  // as a person can: containers that clip without a scrollbar go back to the top (scrollIntoView would move them), and
  // only the nearest container a person can scroll (overflow auto/scroll, with something to scroll) brings the row in
  for(let p=row.parentElement;p&&p!==document.body;p=p.parentElement)if(getComputedStyle(p).overflowY==="hidden")p.scrollTop=0;
  let sc=null;for(let p=row.parentElement;p&&p!==document.body&&!sc;p=p.parentElement){const o=getComputedStyle(p).overflowY;if((o==="auto"||o==="scroll")&&p.scrollHeight>p.clientHeight+1)sc=p;}
  if(sc){const k=r(row),c=r(sc);if(k.bottom>c.bottom)sc.scrollTop+=k.bottom-c.bottom;if(r(row).top<c.top)sc.scrollTop-=c.top-r(row).top;}await frame();
  const missed=[];for(const e of [...row.querySelectorAll("button")].filter(vis)){const k=r(e),x=k.left+k.width/2;
   for(const y of [k.top+2,k.top+k.height/2,k.bottom-2]){const top=document.elementsFromPoint(x,y)[0];if(!top||!(top===e||e.contains(top))){missed.push(e.textContent.trim().slice(0,16));break;}}}
  setSideTab("inspector");await frame();return{ok:!missed.length,missed};})();
 const rows=[...tl.rows,...mon.rows,...top.rows,...bin.rows];
 return {lang:document.documentElement.lang,mode:mcView.get().mode,preview:{w:Math.round(shown.w),h:Math.round(shown.h)},transportOverTimeline:Math.round(overlap),
  unreachable:rows.filter(x=>!x.ok).map(x=>x.where+":"+x.id),playerUnreachable:player.filter(x=>!x.ok).map(x=>x.id),overlaps:[...tl.overlaps,...mon.overlaps,...top.overlaps,...bin.overlaps],tabsUnreachable:tabs.filter(x=>!x.ok).map(x=>x.id),tabs:tabs.length,
  inMore:rows.filter(x=>x.inMore).map(x=>x.where+":"+x.id),tools:rows.length,
  monitorMenu,transcriptRow,
  snap:(tl.rows.find(x=>x.id==="btnSnap")||{}),overflowX:document.documentElement.scrollWidth-innerWidth,overflowY:document.documentElement.scrollHeight-innerHeight};})()`;
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...args){await original.apply(this,args);const win=this,read=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);
  win.setMinimumSize(200,200);
  for(const [w,h] of SIZES){win.setContentSize(w,h);await wait(400);
   for(let i=0;i<5;i++){const [iw,ih]=await read(`[innerWidth,innerHeight]`),[cw,ch]=win.getContentSize();if(iw===w&&ih===h)break;win.setContentSize(Math.round(cw*w/iw),Math.round(ch*h/ih));await wait(400);}
   await wait(300);
   for(const language of ['zh-CN','en'])for(const mode of ['simple','advanced']){
    await read(`updateMontClipView({language:${JSON.stringify(language)},mode:${JSON.stringify(mode)}});true`);await wait(450);
    const m=await read(MEASURE),name=`${language}-${mode}-${w}x${h}`;results.push({size:[w,h],...m});
    process.stdout.write('LAYOUT '+JSON.stringify({size:[w,h],...m})+'\n');
    if(out){fs.writeFileSync(path.join(out,name+'.page.png'),(await win.webContents.capturePage()).toPNG());
     // screenshots are the app's own page only (webContents.capturePage), never the screen: privacy
     if(mode==="simple"&&w<1270){ // the timeline More menu open, as a person would see it
      const opened=await read(`(()=>{const b=document.getElementById("btnTlMore");if(b.hidden)return false;b.click();return true;})()`);
      if(opened){await wait(250);fs.writeFileSync(path.join(out,name+".more.page.png"),(await win.webContents.capturePage()).toPNG());await read(`document.getElementById("btnTlMore").click();true`);await wait(150);}}
    }}}
  if(out)fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(results,null,1)+'\n');
  const bad=results.filter(m=>m.monitorMenu.covered.length||!m.transcriptRow.ok||!(m.preview.w>0&&m.preview.h>0)||m.transportOverTimeline>0||m.unreachable.length||m.playerUnreachable.length||m.tabsUnreachable.length||m.overlaps.length||m.overflowX>0||m.overflowY>0);
  const menuBad=results.filter(m=>m.monitorMenu.covered.length),rowBad=results.filter(m=>!m.transcriptRow.ok);
  process.stdout.write((menuBad.length?'LAYOUT_MONITOR_MENU_FAIL '+menuBad.length+' of ':'LAYOUT_MONITOR_MENU_PASS ')+results.length+' cases\n');
  process.stdout.write((rowBad.length?'LAYOUT_TRANSCRIPT_ROW_FAIL '+rowBad.length+' of ':'LAYOUT_TRANSCRIPT_ROW_PASS ')+results.length+' cases\n');
  process.stdout.write((bad.length?'LAYOUT_FAIL '+bad.length+' of ':'LAYOUT_PASS ')+results.length+' cases\n');
  process.stdout.write('LAYOUT_COMPLETE\n');
 }catch(e){process.stdout.write('LAYOUT_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
// Hidden, offscreen window: nothing on the desktop, no focus taken; capturePage still gets real frames.
{const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='electron'){Module._load=load;return{...electron,BrowserWindow:class extends BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,offscreen:true,backgroundThrottling:false}});}}};}return load.call(this,id,...args);};}
require('./main');
