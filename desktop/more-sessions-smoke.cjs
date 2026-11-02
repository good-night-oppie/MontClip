'use strict';
// Explicit development entry (VV 2026-11-02: at 630×452 with More open, a session row showed
// half its text under the reference buttons). Fresh profile, visible window: four long-named
// sessions, More open; every session button must be either fully visible and hit at its centre,
// or entirely scrolled out of view — never cut — and reachable once scrolled to.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--montclip-smoke'))throw Error('Explicit smoke required');
// never fall back to the default profile: a broken command line must stop here, not use real data
const profileArg=process.argv.find(a=>a.startsWith('--user-data-dir='));
if(!profileArg||!profileArg.slice('--user-data-dir='.length).trim())throw Error('A fresh --user-data-dir is required');
const out=process.env.MONTCLIP_MORE_OUT||null;if(out&&!path.isAbsolute(out))throw Error('MONTCLIP_MORE_OUT must be an absolute folder');
const original=BrowserWindow.prototype.loadURL;
BrowserWindow.prototype.loadURL=async function(...a){await original.apply(this,a);const w=this,read=s=>w.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const results=[];
 try{await read(`(async()=>{const until=Date.now()+15000;while(!state.connected&&Date.now()<until)await new Promise(r=>setTimeout(r,25));})()`);w.show();
  await read(`updateMontClipView({language:'zh-CN'});setSideTab('assistant');mcAgent.render();true`);await wait(300);
  const btn=t=>`[...document.querySelectorAll('.cindy-port button')].find(b=>b.textContent===${JSON.stringify(t)})`;
  for(let i=0;i<4;i++){await read(`(()=>{const e=document.querySelector('[data-cindy-draft]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'第${i}个会话的标题比较长一些');e.dispatchEvent(new Event('input',{bubbles:true}));(${btn('新会话')}).click();return true;})()`);await wait(150);}
  for(const [W,H] of [[630,452],[804,535],[1270,800]]){w.setContentSize(W,H);await wait(600);
   await read(`(()=>{const b=${btn('更多')};if(b&&b.getAttribute('aria-expanded')!=='true')b.click();return true;})()`);await wait(400);
   if(!await read(`!!document.querySelector('.cindy-more')`))throw Error('More did not open at '+W+'x'+H);
   const r=await read(`(async()=>{const list=document.querySelector('.cindy-more [data-session-list]')||document.querySelector('.cindy-more .agent-toolbar');
    const frame=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
    // what can show a session: the list and every scrolling box around it
    const clip=()=>{let t=-Infinity,b=Infinity;for(let e=list;e;e=e.parentElement){const s=getComputedStyle(e);if(e===list||/(auto|scroll|hidden)/.test(s.overflowY)){const k=e.getBoundingClientRect();t=Math.max(t,k.top);b=Math.min(b,k.bottom);}}return {t,b};};
    const rows=[],box=clip();
    for(const b of list.querySelectorAll('button')){const k=b.getBoundingClientRect(),inside=k.top>=box.t-0.5&&k.bottom<=box.b+0.5,outside=k.bottom<=box.t+0.5||k.top>=box.b-0.5;
     const h=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);rows.push({t:b.textContent.slice(0,6),cut:!inside&&!outside,hitWhenShown:inside?(h===b||b.contains(h)):null});}
    const reach=[];for(const b of list.querySelectorAll('button')){b.scrollIntoView({block:'nearest'});await frame();const k=b.getBoundingClientRect(),h=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);reach.push(h===b||b.contains(h));}
    list.scrollTop=0;for(let e=list;e;e=e.parentElement)if(e.classList&&e.classList.contains('cindy-more'))e.scrollTop=0;return {rows,reach};})()`);
   const ok=r.rows.every(x=>!x.cut&&x.hitWhenShown!==false)&&r.reach.every(Boolean);
   results.push({size:[W,H],ok,...r});process.stdout.write('MORE '+JSON.stringify({size:[W,H],ok,cut:r.rows.filter(x=>x.cut).map(x=>x.t),unreachable:r.reach.filter(x=>!x).length})+'\n');
   if(out)fs.writeFileSync(path.join(out,`more-sessions-${W}x${H}.page.png`),(await w.webContents.capturePage()).toPNG());}
  if(out)fs.writeFileSync(path.join(out,'more-sessions.json'),JSON.stringify(results,null,1)+'\n');
  process.stdout.write((results.every(x=>x.ok)?'MORE_PASS':'MORE_FAIL')+'\n');
 }catch(e){process.stdout.write('MORE_FAIL '+e.message+'\n');}finally{setTimeout(()=>app.exit(0),300);}};
require('./main');
